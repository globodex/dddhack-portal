import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeDialogHistoryForNavigation, trackDialogHistory } from "../app/dialog-history";

test("navigation replaces the temporary menu entry without a cleanup Back racing the router", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const entries = [{ url: "/admin/credits", state: { __NA: true, route: "credits" } as Record<string, unknown> }];
  const timers = new Map<number, () => void>();
  let nextTimer = 0, backCalls = 0;
  const listeners = new Map<string, Set<() => void>>();
  const mock = {
    location: { href: "http://localhost:3000/admin/credits" },
    history: {
      get state() { return entries.at(-1)!.state; },
      pushState(state: Record<string, unknown>, _unused: string, url: string) { entries.push({ state, url }); },
      replaceState(state: Record<string, unknown>, _unused: string, url: string) { entries[entries.length - 1] = { state, url }; },
      back() { backCalls++; entries.pop(); for (const listener of listeners.get("popstate") || []) listener(); },
    },
    setTimeout(fn: () => void) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    addEventListener(name: string, fn: () => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: mock });
  const flush = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); };
  try {
    assert.equal(consumeDialogHistoryForNavigation(), false, "ordinary navigation keeps router.push");
    const cleanup = trackDialogHistory(() => assert.fail("navigation must not dismiss a later route"));
    flush();
    assert.equal(entries.length, 2);
    assert.equal(consumeDialogHistoryForNavigation(), true, "menu navigation selects router.replace");
    assert.equal(mock.history.state.__NA, true, "Next history fields remain intact");
    assert.equal(mock.history.state.portalDialog, undefined);
    cleanup();
    flush();
    assert.equal(backCalls, 0, "closing the menu cannot queue history.back");
    mock.history.replaceState({ __NA: true, route: "dashboard" }, "", "/dashboard");
    assert.equal(entries.length, 2);
    mock.history.back();
    assert.equal(entries.at(-1)!.url, "/admin/credits", "one Back returns to the prior page");
    assert.equal(consumeDialogHistoryForNavigation(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
