import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeMenuLinkNavigation } from "../app/mobile-navigation";
import { trackDialogHistory } from "../app/dialog-history";

for (const target of ["_top", "_self", "_blank"]) {
  test(`menu ${target} target preserves native navigation and consumes only the appropriate history marker`, () => {
    const old = Object.getOwnPropertyDescriptor(globalThis, "window");
    const timers: (() => void)[] = [];
    const entries: { state: Record<string, any>; url: string }[] = [
      { state: { __NA: true }, url: "http://localhost:3012/" },
    ];
    let replaced = "",
      prevented = false,
      backCalls = 0;
    const mock = {
      location: {
        href: "http://localhost:3012/",
        origin: "http://localhost:3012",
        replace(value: string) {
          replaced = value;
        },
      },
      history: {
        get state() {
          return entries.at(-1)!.state;
        },
        pushState(state: Record<string, any>, _unused: string, url: string) {
          entries.push({ state, url });
        },
        replaceState(state: Record<string, any>, _unused: string, url: string) {
          entries[entries.length - 1] = { state, url };
        },
        back() {
          backCalls++;
        },
      },
      setTimeout(fn: () => void) {
        timers.push(fn);
        return timers.length;
      },
      clearTimeout() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mock,
    });
    try {
      const cleanup = trackDialogHistory(() =>
        assert.fail("a navigation must not dismiss a later page"),
      );
      timers.shift()!();
      const event = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault() {
          prevented = true;
        },
      };
      const consumed = consumeMenuLinkNavigation(event, {
        href: "http://localhost:3012/signin",
        target,
        hasAttribute() {
          return false;
        },
      });
      assert.equal(consumed, target !== "_blank");
      assert.equal(prevented, target === "_self");
      assert.equal(
        replaced,
        target === "_self" ? "http://localhost:3012/signin" : "",
      );
      assert.equal(!!mock.history.state.portalDialog, target === "_blank");
      assert.equal(mock.history.state.__NA, true);
      cleanup();
      if (target !== "_blank")
        assert.equal(
          timers.length,
          0,
          "no cleanup Back may cancel a pending navigation",
        );
      assert.equal(backCalls, 0);
    } finally {
      if (old) Object.defineProperty(globalThis, "window", old);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
}
