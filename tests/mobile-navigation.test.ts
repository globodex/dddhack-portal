import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Portal from "../app/portal";
import { openMobileNavigation } from "../app/mobile-navigation";

test("all role shells share one mobile dialog with ordinary role-authorized links and no section labels", () => {
  const cases = [
    { path: "/", me: undefined, links: ["Home", "Projects", "Sign in"] },
    {
      path: "/",
      me: { role: "participant", name: "Synthetic" },
      links: [
        "Dashboard",
        "Discover",
        "Projects",
        "Rules",
        "Your profile",
        "Log out",
      ],
    },
    {
      path: "/admin/participants",
      me: { role: "admin", name: "Synthetic admin" },
      links: [
        "Participants",
        "Discover",
        "Teams",
        "Submissions",
        "Settings",
        "Rules",
        "Workspace",
        "Log out",
      ],
    },
    {
      path: "/admin/participants",
      me: { role: "admin", owner: true, name: "Synthetic owner" },
      links: ["Participants", "Logs", "Workspace", "Log out"],
    },
    {
      path: "/dashboard",
      me: { role: "volunteer", name: "Synthetic volunteer" },
      links: ["Dashboard", "Administration", "Log out"],
    },
    {
      path: "/dashboard",
      me: { role: "judge", name: "Synthetic judge" },
      links: ["Assigned projects", "Log out"],
    },
    {
      path: "/dashboard",
      me: { role: "mentor", name: "Synthetic mentor" },
      links: ["Assigned projects", "Log out"],
    },
    {
      path: "/projects",
      me: { role: "participant", mode: "viewer", name: "Synthetic viewer" },
      links: ["Discover", "Projects", "Log out"],
    },
  ];
  for (const entry of cases) {
    const html = renderToStaticMarkup(
      createElement(Portal, {
        path: entry.path,
        initialPublic: {
          me: entry.me
            ? {
                id: "fake_navigation",
                email: "navigation@portal.test",
                owner: false,
                ...entry.me,
                mode: entry.me.mode as "viewer" | undefined,
              }
            : undefined,
        },
      }),
    );
    assert.equal((html.match(/id="mobile-navigation"/g) || []).length, 1);
    const dialog = html.match(
      /<dialog[^>]*id="mobile-navigation"[\s\S]*?<\/dialog>/,
    )?.[0];
    assert.ok(dialog, entry.path);
    assert.match(dialog, /aria-label="Navigation"/);
    assert.match(dialog, /aria-label="Close navigation"/);
    assert.doesNotMatch(
      dialog,
      /<h[1-6]|>Menu<|>Navigation<|>Administration<\/h/,
    );
    for (const label of entry.links)
      assert.ok(dialog.includes(`>${label}<`), `${entry.path}: ${label}`);
    if (entry.me?.mode === "viewer")
      assert.ok(!dialog.includes('href="/profile"'));
    if (!entry.me)
      assert.match(
        dialog,
        /href="\/signin\?returnTo=%2Fdashboard" target="_top"/,
      );
  }
});

test("modal lifetime locks page scroll, dismisses on desktop resize and restores trigger without moving the page", () => {
  const events = new Map<string, () => void>();
  let opened = 0,
    closed = 0,
    focused: unknown,
    desktop = 0;
  const view = {
    innerWidth: 390,
    addEventListener: (name: string, fn: () => void) => events.set(name, fn),
    removeEventListener: (name: string) => events.delete(name),
  };
  const doc = {
    defaultView: view,
    activeElement: {
      isConnected: true,
      focus: (options: unknown) => {
        focused = options;
      },
    },
    body: { style: { overflow: "clip" } },
    documentElement: { style: { overflow: "auto" } },
  };
  const node = {
    ownerDocument: doc,
    showModal: () => opened++,
    close: () => closed++,
  };
  const cleanup = openMobileNavigation(
    node as unknown as HTMLDialogElement,
    () => desktop++,
  );
  assert.equal(opened, 1);
  assert.equal(doc.body.style.overflow, "hidden");
  assert.equal(doc.documentElement.style.overflow, "hidden");
  events.get("resize")!();
  assert.equal(desktop, 0);
  view.innerWidth = 1200;
  events.get("resize")!();
  assert.equal(desktop, 1);
  cleanup();
  assert.equal(closed, 1);
  assert.equal(doc.body.style.overflow, "clip");
  assert.equal(doc.documentElement.style.overflow, "auto");
  assert.deepEqual(focused, { preventScroll: true });
  assert.equal(events.size, 0);
});
