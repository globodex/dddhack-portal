import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch } from "../lib/db";
import { handlePortal, handleExport } from "../lib/http";
import { adminDemographics } from "../lib/admin-demographic-filters";
import { teamIsApproved } from "../app/admin-team-approval";
for (const engine of ["sqlite", "postgres"] as const)
  test(`${engine}: team size filters match aggregate buckets, approval requires real lock, exports and cache scopes agree`, async () => {
    const f = engine === "sqlite" ? await setup() : await createPGliteFixture();
    if (engine === "postgres") await seedLocal(f.db);
    const service = (who = "owner") =>
      new PortalService(
        f.db,
        fixtures[who],
        LOCAL_CREDIT_KEY,
        () => "2026-10-22T08:00:00.000Z",
      );
    const runtime = {
      db: f.db,
      identity: fixtures.owner,
      key: LOCAL_CREDIT_KEY,
      localTest: true,
    };
    try {
      const all: any = await service().view("/admin/teams");
      // Fully approved solo can remain Forming; it is not an approved locked team.
      assert.equal(
        all.items.find((t: any) => t.id === "fake_team1").readiness.total,
        1,
      );
      for (const size of ["1", "2", "3", "4", "5"]) {
        const data: any = await service().view("/admin/teams", {
          teamSize: size,
        });
        assert.equal(
          data.items.length,
          all.stats.teamSizes[Number(size) - 1].value,
        );
        for (const team of data.items)
          assert.equal(team.members.length, Number(size));
        assert.deepEqual(
          data.stats,
          all.stats,
          "Entire-collection analytics do not shrink to filters",
        );
      }
      const response = await handlePortal(
        new Request("http://localhost/api/portal?view=/admin/teams&teamSize=1"),
        runtime,
      );
      assert.equal(response.status, 200);
      const single: any = await response.json();
      assert.equal(single.items.length, 1);
      const large = await handlePortal(
        new Request(
          "http://localhost/api/portal?view=/admin/teams&teamSize=5&presentation=" +
            single.adminPresentation.version,
        ),
        runtime,
      );
      assert.equal(large.status, 200);
      const largeBody: any = await large.json();
      assert.notEqual(
        largeBody.adminPresentation.scope,
        single.adminPresentation.scope,
      );
      assert.equal(largeBody.items[0].members.length, 5);
      for (const list of ["teams", "team-emails"]) {
        const out = await handleExport(
          new Request(
            "http://localhost/api/export?list=" + list + "&teamSize=1",
          ),
          runtime,
        );
        assert.equal(out.status, 200);
        const csv = await out.text();
        assert.match(
          csv,
          list === "teams" ? /Small Wonder/ : /alice@portal\.test/,
        );
        assert.doesNotMatch(
          csv,
          /Common Ground|Core Orbit|bob@portal\.test|eve@portal\.test/,
        );
      }
      const before: any = await service().view("/admin/teams");
      assert.equal(
        before.stats.teamSizeGroups.find((g: any) => g.key === "approved")
          .total,
        0,
      );
      await batch(f.db, [
        [
          "INSERT INTO team_locks VALUES('fake_team1','fake_alice','2026-10-22T08:00:00Z')",
        ],
      ]);
      const locked: any = await service().view("/admin/teams");
      assert.equal(
        locked.stats.teamSizeGroups.find((g: any) => g.key === "approved")
          .sizes[0].value,
        1,
      );
      assert.equal(
        teamIsApproved(locked.items.find((t: any) => t.id === "fake_team1")),
        true,
      );
      await service().command("admin-unlock-team", {
        teamId: "fake_team1",
        expectedLockedAt: "2026-10-22T08:00:00Z",
        confirmation: "UNLOCK_TEAM",
      });
      const unlocked: any = await service().view("/admin/teams");
      assert.equal(
        unlocked.stats.teamSizeGroups.find((g: any) => g.key === "approved")
          .total,
        0,
      );
      await assert.rejects(
        service("alice").view("/admin/teams", { teamSize: "1" }),
      );
      await assert.rejects(
        service().view("/discover/teams", { teamSize: "1" }),
        { code: "TEAM_SIZE_FILTER_ROUTE_REQUIRED" },
      );
      const combined: any = await service().view("/admin/teams", {
        teamSize: "1",
        teamStatus: "Locked",
      });
      assert.equal(combined.items.length, 0, "Size AND actual status");
    } finally {
      await f.db.close();
    }
  });
test("team size rejects out of range, fractional, padded and injection values", () => {
  for (const teamSize of ["0", "6", "-1", "1.0", "01", "1 OR 1=1", " 1"])
    assert.throws(() => adminDemographics({ teamSize }), {
      code: "INVALID_TEAM_SIZE_FILTER",
    });
  assert.equal(adminDemographics({ teamSize: "" }).teamSize, "");
});

test("Teams popover offers sizes 1–5, stages Apply, clears and fits desktop/short mobile", async () => {
  const { build } = await import("esbuild");
  const { chromium } = await import("playwright-core");
  const fs = await import("node:fs");
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Filters from'./app/admin-demographic-filters';function App(){const[value,setValue]=useState({});return React.createElement(Filters,{value,teamSizes:true,onChange:next=>{window.latest=next;setValue(next);}})}createRoot(document.getElementById('root')).render(React.createElement(App));`,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
  });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  fs.mkdirSync("/workspace/team-size-filter-review", { recursive: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 320 ? 480 : 900 },
      });
      await page.setContent(
        '<div class="app-shell"><div id="root" style="display:flex;justify-content:flex-end;padding:24px"></div></div>',
      );
      for (const name of ["style.css", "admin-demographic-filters.css"])
        await page.addStyleTag({
          content: fs.readFileSync("app/" + name, "utf8"),
        });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const trigger = page.getByRole("button", {
        name: "Filters",
        exact: true,
      });
      await trigger.waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector<HTMLButtonElement>(".admin-filter-trigger")
            ?.disabled,
      );
      await trigger.click();
      const dialog = page.getByRole("dialog");
      const select = dialog.getByRole("combobox", {
        name: "Team size",
        exact: true,
      });
      assert.deepEqual(
        await select
          .locator("option")
          .evaluateAll((nodes) =>
            nodes.map((n) => (n as HTMLOptionElement).value),
          ),
        ["", "1", "2", "3", "4", "5"],
      );
      await select.selectOption("1");
      assert.equal(
        await page.evaluate(() => (window as any).latest),
        undefined,
      );
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "/workspace/team-size-filter-review/filter-" + width + ".png",
      });
      await dialog.getByRole("button", { name: "Apply", exact: true }).click();
      const active = page.getByRole("button", {
        name: "Filters (1 active)",
        exact: true,
      });
      await active.waitFor();
      assert.equal(
        await page.evaluate(() => (window as any).latest.teamSize),
        "1",
      );
      await active.click();
      await dialog.getByRole("button", { name: "Clear", exact: true }).click();
      await trigger.waitFor();
      assert.equal(
        await page.evaluate(() => (window as any).latest.teamSize),
        "",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
