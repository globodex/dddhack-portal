import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setup } from "./helpers";
import { fixtures } from "../scripts/fixtures";
import { PortalExperience } from "../lib/experience";
import { PortalService } from "../lib/service";
import { handleExport } from "../lib/http";
import { one, rows } from "../lib/db";
import { parseCSV } from "../lib/security";
import {
  participantExportSelection,
  participantCSV,
  participantExportColumns,
} from "../lib/participant-export";
import {
  filterParticipants,
  participantExportHref,
  defaultParticipantFilters,
} from "../lib/participant-filters";
import { AdminParticipants, adminParticipantProjection } from "../app/portal";
const sample = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  email: id + "@example.invalid",
  status: "Registered",
  team_id: "team-" + id,
  team_name: "Team " + id,
  teamStatus: "Locked",
  teamLocked: true,
  teamLockedAt: "2026-10-24T10:00:00Z",
  ...extra,
});
const synthetic = [
  sample("b", { teamLockedAt: "2026-10-25T10:00:00Z" }),
  sample("a"),
  sample("form", { teamStatus: "Forming", teamLocked: false }),
  sample("going", { status: "Going" }),
  sample("removed", { deactivated_at: "2026-10-24T10:00:00Z" }),
  sample("solo", {
    team_id: null,
    team_name: null,
    teamLocked: false,
    teamStatus: null,
  }),
  sample("submitted", { teamStatus: "Submitted" }),
  sample("unsigned", {
    id: null,
    name: null,
    email: "unsigned@example.invalid",
    team_id: null,
    team_name: null,
    teamLocked: false,
    teamStatus: null,
  }),
];
const selected = (query: string) =>
  participantExportSelection(synthetic, new URLSearchParams(query));
test("shared table/export filters agree for every personal/team status and active/removed selection, using earliest lock order", () => {
  for (const status of ["all", "registered", "going", "checked in", "absent"])
    for (const team of [
      "all",
      "locked",
      "forming",
      "not submitted",
      "submitted",
      "unlocked",
      "none",
    ] as const)
      for (const recordState of ["all", "active", "removed"] as const) {
        const filters = { status, team, individual: "", teamQuery: "" };
        const ui = filterParticipants(
          synthetic.map(adminParticipantProjection),
          filters,
          recordState,
        ).map((r) => r.email);
        const result = participantExportSelection(
          synthetic,
          new URL(
            participantExportHref(filters, recordState),
            "https://portal.test",
          ).searchParams,
        );
        assert.deepEqual(
          result.rows.map((r) => r.email),
          ui,
          JSON.stringify({ status, team, recordState }),
        );
        assert.equal(result.total, ui.length);
      }
  assert.deepEqual(
    selected("status=registered&team=locked&recordState=active").rows.map(
      (r) => r.id,
    ),
    ["a", "b"],
  );
  assert.deepEqual(
    selected(
      "status=all&team=all&individual=GOING%40example&teamQuery=Team%20going",
    ).rows.map((r) => r.id),
    ["going"],
  );
});
test("filter export links encode both search fields and removal state; default UI exports all matching rows and count, not the whole list", () => {
  const href = participantExportHref(
    {
      ...defaultParticipantFilters,
      individual: "a+b@example.invalid",
      teamQuery: "R&D / Build",
    },
    "removed",
  );
  const p = new URL(href, "https://portal.test").searchParams;
  assert.equal(p.get("individual"), "a+b@example.invalid");
  assert.equal(p.get("teamQuery"), "R&D / Build");
  assert.equal(p.get("recordState"), "removed");
  assert.equal(p.get("scope"), "all");
  const html = renderToStaticMarkup(
    createElement(AdminParticipants, {
      data: {
        me: { id: "admin", name: "Admin", role: "admin", owner: false },
        items: synthetic,
      } as any,
      run: async () => {
        throw new Error("No mutation in render");
      },
    }),
  );
  assert.match(html, /Export filtered participants \(2\)/);
  assert.match(html, /status=registered&amp;team=locked/);
  assert.doesNotMatch(
    html,
    /Export full participant list|independently of these table filters/,
  );
});
test("all matching export is not truncated; explicit page mode keeps stable order and reports total separately, including empty pages", () => {
  const all = selected("status=all&team=all");
  assert.equal(all.rows.length, synthetic.length);
  const first = selected("status=all&team=all&scope=page&page=0&pageSize=3"),
    second = selected("status=all&team=all&scope=page&page=1&pageSize=3");
  assert.equal(first.total, all.total);
  assert.equal(second.total, all.total);
  assert.deepEqual(
    [...first.rows, ...second.rows].map((r) => r.email),
    all.rows.slice(0, 6).map((r) => r.email),
  );
  const beyond = selected("scope=page&page=100&pageSize=3");
  assert.equal(beyond.exported, 0);
  assert.equal(beyond.total, all.total);
  assert.equal(
    participantCSV(beyond.rows),
    participantExportColumns.map((v) => '"' + v + '"').join(","),
  );
  for (const query of [
    "status=bogus",
    "team=bogus",
    "recordState=bogus",
    "scope=bogus",
    "page=-1",
    "page=1.1",
    "pageSize=0",
    "pageSize=251",
    "status=going&status=registered",
    "individual=" + "x".repeat(201),
  ])
    assert.throws(() => selected(query), query);
});
test("CSV uses a positive operational column allowlist and neutralizes spreadsheet formulas in names, emails and team fields", () => {
  const result = participantExportSelection(
    [
      sample("formula", {
        name: ' =HYPERLINK("https://example.invalid")',
        email: "+formula@example.invalid",
        team_name: "@SUM(1)",
        phone: "PRIVATE-PHONE",
        gender: "PRIVATE-GENDER",
        openai_org_id: "PRIVATE-ORG",
        idea: { title: "PRIVATE-IDEA" },
        credit: { value: "PRIVATE-CREDIT" },
        ciphertext: "PRIVATE-CIPHER",
        feedback: "PRIVATE-FEEDBACK",
        rating: 9,
      }),
    ],
    new URLSearchParams(),
  );
  const text = participantCSV(result.rows),
    parsed = parseCSV(text);
  assert.deepEqual(parsed[0], participantExportColumns);
  assert.ok(!text.includes("PRIVATE-"));
  assert.ok(!parsed[0].includes("removed"));
  assert.ok(parsed[1][1].startsWith("' ="));
  assert.ok(parsed[1][2].startsWith("'+"));
  assert.ok(parsed[1][5].startsWith("'@"));
  // Searching hidden row content must never reveal which participant contains it.
  assert.equal(
    participantExportSelection(
      [sample("safe", { phone: "secret-search" })],
      new URLSearchParams("individual=secret-search"),
    ).total,
    0,
  );
});
test("participant export requires current owner/admin authority, rejects untrusted role/query claims, and service-level list cannot bypass it", async () => {
  const { db, service } = await setup();
  try {
    await service("owner").command("portal-role", {
      userId: "fake_pending",
      role: "volunteer",
      reason: "Synthetic scoped volunteer",
    });
    for (const name of ["alice", "stranger", "judge", "pending"]) {
      const r = await handleExport(
        new Request(
          "https://portal.test/api/export?list=participants&role=owner&include=phone,credits",
        ),
        { db, identity: fixtures[name], key: undefined },
      );
      assert.equal(r.status, 403, name);
      assert.equal(
        ((await r.json()) as { code: string }).code,
        "ADMIN_REQUIRED",
      );
      await assert.rejects(service(name).adminList("participants"), {
        code: "ADMIN_REQUIRED",
      });
    }
    const anon = await handleExport(
      new Request("https://portal.test/api/export?list=participants"),
      { db, identity: null, key: undefined },
    );
    assert.equal(anon.status, 401);
    for (const identity of [fixtures.admin, fixtures.owner]) {
      const response = await handleExport(
        new Request(
          "https://portal.test/api/export?list=participants&status=all&team=all&recordState=all",
        ),
        { db, identity, key: undefined },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      assert.match(
        response.headers.get("content-disposition") || "",
        /devday-participants.csv/,
      );
      const csv = await response.text();
      assert.ok(!csv.includes("+12025550100"));
      assert.deepEqual(parseCSV(csv)[0], participantExportColumns);
    }
  } finally {
    db.close();
  }
});
test("HTTP filters/counts/page selection exactly match current server table projections and audit only non-secret counts", async () => {
  const { db, service } = await setup();
  try {
    await service().command("save-workspace-idea", {
      title: "Synthetic lock",
      description: "Synthetic private idea",
    });
    await service().command("lock-team", { confirmation: "LOCK_TEAM" });
    await service("admin").command("admin-status", {
      kind: "person",
      targetId: "fake_alice",
      status: "Registered",
      reason: "Synthetic approval pending",
      confirmation: "CHANGE_STATUS",
    });
    const records = await new PortalExperience(service()).participantRows();
    const filters = {
      ...defaultParticipantFilters,
      individual: "alice",
      teamQuery: "small",
    };
    const url = participantExportHref(filters, "active"),
      expected = participantExportSelection(
        records,
        new URL(url, "https://portal.test").searchParams,
      );
    const response = await handleExport(
      new Request("https://portal.test" + url),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-total-count"), String(expected.total));
    assert.equal(
      response.headers.get("x-exported-count"),
      String(expected.exported),
    );
    assert.equal(response.headers.get("x-export-scope"), "all");
    assert.equal(await response.text(), participantCSV(expected.rows));
    assert.equal(expected.total, 1);
    const page = await handleExport(
      new Request(
        "https://portal.test/api/export?list=participants&scope=page&page=1&pageSize=2",
      ),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-page"), "1");
    assert.equal(page.headers.get("x-page-size"), "2");
    assert.equal(page.headers.get("x-exported-count"), "2");
    const logs = await rows<{ detail: string }>(
      db,
      "SELECT detail FROM audit_logs WHERE action='export'",
    );
    assert.ok(logs.length >= 2);
    assert.ok(
      logs.every(
        (r) => !r.detail.includes("alice@") && !r.detail.includes("phone"),
      ),
    );
    const invalid = await handleExport(
      new Request(
        "https://portal.test/api/export?list=participants&status=not-a-status",
      ),
      { db, identity: fixtures.admin, key: undefined },
    );
    assert.equal(invalid.status, 422);
  } finally {
    db.close();
  }
});
