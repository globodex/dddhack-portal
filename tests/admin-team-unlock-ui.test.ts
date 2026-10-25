import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import AdminTeamActions from "../app/admin-team-actions";

const team = {
  id: "synthetic_locked_team",
  name: "Synthetic team",
  members: [],
  locked: true,
  lockedAt: "2026-10-25T09:00:00.000Z",
};
const noMutation = async () => {
  throw new Error("Rendering must not mutate a team.");
};

test("unlock is separate from team status and absent for unlocked teams", () => {
  const html = renderToStaticMarkup(
    createElement(AdminTeamActions, {
      team: { ...team, locked: false },
      run: noMutation,
    }),
  );
  assert.doesNotMatch(html, /Unlock team|lucide-lock-open/);
  assert.match(html, /Rename team/);
  assert.match(html, /Add member/);
  assert.match(html, /Delete team/);
});

test("locked teams expose the icon action safely before hydration", () => {
  const html = renderToStaticMarkup(
    createElement(AdminTeamActions, {
      team,
      run: noMutation,
    }),
  );
  assert.match(
    html,
    /disabled=""[^>]*aria-busy="false"[^>]*>.*lucide-lock-open.*Unlock team/s,
  );
  assert.doesNotMatch(html, /name="status"|recruiting|Forming/);
});

test("backend refusal and unavailable lock metadata have associated explanations", () => {
  for (const [target, reason] of [
    [
      { ...team, unlockBlockedReason: "This team has committed submissions." },
      "This team has committed submissions.",
    ],
    [{ ...team, lockedAt: undefined }, "Refresh to load this team's lock."],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(AdminTeamActions, {
        team: target,
        run: noMutation,
      }),
    );
    assert.match(
      html,
      /disabled=""[^>]*aria-busy="false"[^>]*aria-describedby="([^"]+-unlock-blocked)"/,
    );
    assert.ok(html.includes(reason.replaceAll("'", "&#x27;")));
  }
});

const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
test(
  "unlock supports keyboard, touch, pending, cancellation, and local error retry",
  {
    skip: !existsSync(chromiumPath),
  },
  async () => {
    const built = await build({
      stdin: {
        contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import AdminTeamActions from "./app/admin-team-actions";
        import { ActionCancelled } from "./lib/action-confirmation";
        const root = createRoot(document.getElementById("root"));
        window.calls = [];
        window.renderTeam = (team) => root.render(React.createElement(AdminTeamActions, {
          key: JSON.stringify(team), team,
          run: (action, values, options) => {
            window.calls.push({ action, values, options });
            return new Promise((resolve, reject) => {
              window.resolveAction = resolve;
              window.rejectAction = (message) => reject(new Error(message));
              window.cancelAction = () => reject(new ActionCancelled());
            });
          },
        }));
      `,
        resolveDir: process.cwd(),
        loader: "tsx",
        sourcefile: "admin-team-unlock-ui-harness.tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const errors: string[] = [];
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(
        '<div class="app-shell"><main class="main"><div id="root"></div></main></div>',
      );
      for (const css of ["app/style.css", "app/admin-experience.css"])
        await page.addStyleTag({ content: readFileSync(css, "utf8") });
      await page.addScriptTag({ content: built.outputFiles[0].text });
      await page.evaluate((value) => (window as any).renderTeam(value), team);
      const unlock = page.getByRole("button", {
        name: "Unlock team",
        exact: true,
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent === "Unlock team" && !button.disabled,
        ),
      );
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 480 },
      ]) {
        await page.setViewportSize(viewport);
        const bounds = await unlock.boundingBox();
        assert.ok(
          bounds && bounds.width >= 44 && bounds.height >= 44,
          JSON.stringify({ viewport, bounds }),
        );
      }
      await unlock.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Unlocking…" }).waitFor();
      assert.deepEqual(await page.evaluate(() => (window as any).calls), [
        {
          action: "admin-unlock-team",
          values: {
            teamId: team.id,
            expectedLockedAt: team.lockedAt,
            confirmation: "UNLOCK_TEAM",
          },
          options: { errorFeedback: "local" },
        },
      ]);
      assert.equal(
        await page.locator('button[aria-busy="true"]').getAttribute("disabled"),
        "",
      );
      assert.equal(await page.locator("button:enabled").count(), 0);
      await page.evaluate(() =>
        document
          .querySelector<HTMLButtonElement>('button[aria-busy="true"]')!
          .click(),
      );
      assert.equal(await page.evaluate(() => (window as any).calls.length), 1);
      await page.evaluate(() =>
        (window as any).rejectAction(
          "This team changed. Refresh and try again.",
        ),
      );
      const alert = page.getByRole("alert");
      await alert.waitFor();
      assert.equal(
        await alert.textContent(),
        "This team changed. Refresh and try again.",
      );
      assert.equal(
        await unlock.evaluate((button) => button === document.activeElement),
        true,
      );
      await unlock.tap();
      await page.getByRole("button", { name: "Unlocking…" }).waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      await page.evaluate(() => (window as any).cancelAction());
      await unlock.waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      await unlock.tap();
      await page.getByRole("button", { name: "Unlocking…" }).waitFor();
      await page.evaluate(() =>
        (window as any).resolveAction({ message: "Team unlocked." }),
      );
      await unlock.waitFor();
      assert.equal(await page.evaluate(() => (window as any).calls.length), 3);
      await page.evaluate((value) => (window as any).renderTeam(value), {
        ...team,
        unlockBlockedReason: "Final results are frozen.",
      });
      await page
        .getByText("Final results are frozen.", { exact: true })
        .waitFor();
      assert.equal(await unlock.isDisabled(), true);
      const description = await unlock.getAttribute("aria-describedby");
      assert.ok(description);
      assert.equal(
        await page.locator(`[id="${description}"]`).textContent(),
        "Final results are frozen.",
      );
      await unlock.evaluate((button) => (button as HTMLButtonElement).click());
      assert.equal(await page.evaluate(() => (window as any).calls.length), 3);
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
