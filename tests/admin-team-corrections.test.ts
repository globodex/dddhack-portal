import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, attend } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch, one, rows } from "../lib/db";
import { handlePortal } from "../lib/http";
import { prepareAdminPresentation } from "../lib/admin-presentation";

const at = "2026-10-22T08:00:00.000Z";
const add = (email = "pending@portal.test", teamId = "fake_team3") => ({
  teamId,
  email,
  confirmation: "ADD_TEAM_MEMBER",
});
const rename = (name = "Corrected team", expectedName = "Common Ground") => ({
  teamId: "fake_team3",
  name,
  expectedName,
  confirmation: "RENAME_TEAM",
});
for (const engine of ["sqlite", "postgres"] as const) {
  async function fixture() {
    if (engine === "sqlite") return setup();
    const { db } = await createPGliteFixture();
    await seedLocal(db);
    return {
      db,
      service: (who = "alice") =>
        new PortalService(db, fixtures[who], LOCAL_CREDIT_KEY, () => at),
    };
  }
  test(`${engine}: admin adds and renames locked teams after membership freeze without changing crown, lock, registration, private idea or history`, async () => {
    const { db, service } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      await attend(db, "fake_bob");
      await batch(db, [
        [
          "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('synthetic-preserved-version','fake_team3',1,'{}','2026-11-01T04:00:00.000Z')",
        ],
      ]);
      const policy = (await service().settings(true)).policy;
      await batch(db, [
        [
          "UPDATE event_settings SET active=1,policy=? WHERE id=1",
          JSON.stringify({
            ...policy,
            membershipFreeze: "2026-10-22T07:00:00.000Z",
          }),
        ],
      ]);
      const stableTables = [
        "team_locks",
        "ideas",
        "submission_versions",
        "project_commit_receipts",
        "profiles",
        "participant_profiles",
        "profile_details",
        "registrations",
        "luma_roster",
        "credit_allocations",
      ];
      const stable = async () =>
        Promise.all(
          stableTables.map((table) =>
            rows(db, `SELECT * FROM ${table} ORDER BY 1,2`),
          ),
        );
      const before = await stable();
      const team = await one<any>(
        db,
        "SELECT * FROM teams WHERE id='fake_team3'",
      );
      const prior = await prepareAdminPresentation(
        await service("admin").view("/admin/teams"),
        "/admin/teams",
      );
      const result = await service("admin").command(
        "admin-add-team-member",
        add(),
      );
      assert.equal(result.changed, true);
      assert.equal(result.memberCount, 4);
      assert.equal(
        (await service("admin").command("admin-add-team-member", add()))
          .changed,
        false,
      );
      const renamed = await service("owner").command(
        "admin-rename-team",
        rename('Name "quoted" 🟠'),
      );
      assert.equal(renamed.changed, true);
      assert.deepEqual(
        { ...(await one(db, "SELECT * FROM teams WHERE id='fake_team3'")) },
        { ...team, name: 'Name "quoted" 🟠' },
      );
      assert.deepEqual(await stable(), before);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT status FROM registrations WHERE email='pending@portal.test'",
          )
        )?.status,
        "pending",
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
      const audit = await rows<any>(
        db,
        "SELECT action,detail FROM audit_logs WHERE action IN ('admin-add-team-member','admin-rename-team') ORDER BY action",
      );
      assert.equal(audit.length, 2);
      assert.ok(!JSON.stringify(audit).includes("+12025550100"));
      assert.ok(!JSON.stringify(audit).includes("private core idea"));
      const current = await prepareAdminPresentation(
        await service("admin").view("/admin/teams"),
        "/admin/teams",
        {},
        prior.adminPresentation.version,
      );
      assert.equal(current.adminPresentation.unchanged, false);
      await assert.rejects(
        service("bob").command("rename-team", {
          name: "Leader cannot override freeze",
        }),
        { code: "MEMBERSHIP_FROZEN" },
      );
    } finally {
      await db.close();
    }
  });
  test(`${engine}: staff permission, registration, current membership, capacity, rename CAS and results freeze remain authoritative`, async () => {
    const { db, service } = await fixture();
    try {
      for (const who of ["alice", "bob", "carol", "judge", "stranger"]) {
        await assert.rejects(
          service(who).command("admin-add-team-member", add()),
          { code: who === "stranger" ? "VIEWER_READ_ONLY" : "ADMIN_REQUIRED" },
        );
        await assert.rejects(
          service(who).command("admin-rename-team", rename()),
          { code: who === "stranger" ? "VIEWER_READ_ONLY" : "ADMIN_REQUIRED" },
        );
        await assert.rejects(
          service(who).view("/admin/team-candidates/fake_team3"),
          { code: "ADMIN_REQUIRED" },
        );
      }
      await assert.rejects(
        new PortalService(db, null, undefined).view(
          "/admin/team-candidates/fake_team3",
        ),
        { code: "SIGN_IN_REQUIRED" },
      );
      const oldRoster = await rows(
        db,
        "SELECT email FROM registrations UNION SELECT email FROM luma_roster ORDER BY email",
      );
      await assert.rejects(
        service("admin").command(
          "admin-add-team-member",
          add("stranger@portal.test"),
        ),
        { code: "REGISTERED_ACCOUNT_REQUIRED" },
      );
      await assert.rejects(
        service("admin").command(
          "admin-add-team-member",
          add("unsigned@example.invalid"),
        ),
        { code: "REGISTERED_ACCOUNT_REQUIRED" },
      );
      assert.deepEqual(
        await rows(
          db,
          "SELECT email FROM registrations UNION SELECT email FROM luma_roster ORDER BY email",
        ),
        oldRoster,
      );
      await assert.rejects(
        service("admin").command(
          "admin-add-team-member",
          add("alice@portal.test"),
        ),
        (error: any) =>
          error.code === "ALREADY_IN_TEAM" &&
          /Small Wonder.*Remove/.test(error.message),
      );
      await assert.rejects(
        service("admin").command(
          "admin-add-team-member",
          add("pending@portal.test", "fake_team5"),
        ),
        { code: "TEAM_FULL" },
      );
      await assert.rejects(
        service("admin").command("admin-rename-team", rename("New", "Stale")),
        { code: "TEAM_NAME_CHANGED" },
      );
      await service("admin").command("participant-bulk", {
        emails: ["pending@portal.test"],
        status: "cancelled",
      });
      await assert.rejects(
        service("admin").command("admin-add-team-member", add()),
        { code: "REGISTERED_ACCOUNT_REQUIRED" },
      );
      await service("admin").command("participant-deactivate", {
        userId: "fake_carol",
        confirmation: "REMOVE_PARTICIPANT",
      });
      await assert.rejects(
        service("admin").command(
          "admin-add-team-member",
          add("carol@portal.test"),
        ),
        { code: "PARTICIPANT_REMOVED" },
      );
      await batch(db, [
        [
          "INSERT INTO result_snapshots(id,policy_version,source_revision,payload,created_at,frozen_by) SELECT 'synthetic-admin-team-freeze',1,version,'[]',?,'fake_owner' FROM scoring_revision WHERE id=1",
          at,
        ],
      ]);
      await assert.rejects(
        service("admin").command("admin-add-team-member", add()),
        { code: "RESULTS_FROZEN" },
      );
      await assert.rejects(
        service("admin").command("admin-rename-team", rename()),
        { code: "RESULTS_FROZEN" },
      );
      const candidates = await service("admin").view(
        "/admin/team-candidates/fake_team3",
      );
      assert.equal(candidates.canAdd, false);
      assert.match(String(candidates.blockedReason), /frozen/);
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });
  test(`${engine}: candidate search is private, paginated25 and includes truthful disabled current-team identities`, async () => {
    const { db, service } = await fixture();
    try {
      await batch(
        db,
        Array.from({ length: 31 }, (_, i) => [
          [
            "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
            `synthetic_candidate_${i}`,
            `candidate${i}@example.invalid`,
            `Candidate ${String(i).padStart(2, "0")}`,
            at,
          ],
          [
            "INSERT INTO registrations(email,status) VALUES(?,'pending')",
            `candidate${i}@example.invalid`,
          ],
        ]).flat() as any,
      );
      const request = (page: number) =>
        handlePortal(
          new Request(
            `https://portal.test/api/portal?view=%2Fadmin%2Fteam-candidates%2Ffake_team3&q=Candidate&page=${page}`,
          ),
          { db, identity: fixtures.admin, key: LOCAL_CREDIT_KEY },
        );
      const first = await request(0),
        second = await request(1);
      assert.match(
        first.headers.get("cache-control") || "",
        /private, no-store/,
      );
      const a = (await first.json()) as any,
        b = (await second.json()) as any;
      assert.equal(a.items.length, 25);
      assert.equal(b.items.length, 6);
      assert.equal(a.totalRows, 31);
      assert.equal(a.hasMore, true);
      assert.equal(b.hasMore, false);
      assert.equal(
        new Set([...a.items, ...b.items].map((p: any) => p.id)).size,
        31,
      );
      assert.ok(a.items.every((p: any) => p.selectable));
      const team = await service("admin").view(
        "/admin/team-candidates/fake_team3",
        { search: "Bob" },
      );
      assert.equal((team.items as any[])[0].selectable, false);
      assert.equal(
        (team.items as any[])[0].unavailableReason,
        "Already a member.",
      );
      const other = await service("admin").view(
        "/admin/team-candidates/fake_team3",
        { search: "alice@portal.test" },
      );
      assert.match(
        (other.items as any[])[0].unavailableReason,
        /Small Wonder.*Remove/,
      );
      assert.equal(
        (
          await service("admin").view("/admin/team-candidates/fake_team3", {
            search: "stranger",
          })
        ).totalRows,
        0,
      );
      for (const person of [...a.items, ...b.items, ...(other.items as any[])])
        assert.deepEqual(Object.keys(person).sort(), [
          "email",
          "id",
          "name",
          "selectable",
          "teamId",
          "teamName",
          "unavailableReason",
        ]);
    } finally {
      await db.close();
    }
  });
  test(`${engine}: simultaneous corrections preserve five-member cap, global membership uniqueness and atomic audit/guard cleanup`, async () => {
    const { db, service } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      await batch(
        db,
        Array.from({ length: 6 }, (_, i) => [
          [
            "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)",
            `synthetic_race_${i}`,
            `race${i}@example.invalid`,
            `Race ${i}`,
            at,
          ],
          [
            "INSERT INTO registrations(email,status) VALUES(?,'pending')",
            `race${i}@example.invalid`,
          ],
        ]).flat() as any,
      );
      const race = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          service("admin").command(
            "admin-add-team-member",
            add(`race${i}@example.invalid`),
          ),
        ),
      );
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 2);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT count(*) n FROM memberships WHERE team_id='fake_team3'",
          )
        )?.n,
        5,
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='admin-add-team-member'",
          )
        ).length,
        2,
      );
      await batch(db, [
        [
          "INSERT INTO users(id,email,name,created_at) VALUES('synthetic_global_member','global-member@example.invalid','Global member',?)",
          at,
        ],
        [
          "INSERT INTO registrations(email,status) VALUES('global-member@example.invalid','pending')",
        ],
        [
          "INSERT INTO teams VALUES('synthetic_other_team','Other target','fake_admin','',?)",
          at,
        ],
        [
          "INSERT INTO memberships VALUES('fake_admin','synthetic_other_team',?)",
          at,
        ],
      ]);
      const samePerson = await Promise.allSettled([
        service("admin").command(
          "admin-add-team-member",
          add("global-member@example.invalid", "fake_team1"),
        ),
        service("owner").command(
          "admin-add-team-member",
          add("global-member@example.invalid", "synthetic_other_team"),
        ),
      ]);
      assert.equal(
        samePerson.filter((r) => r.status === "fulfilled").length,
        1,
      );
      assert.equal(samePerson.filter((r) => r.status === "rejected").length, 1);
      assert.equal(
        (
          await one<any>(
            db,
            "SELECT count(*) n FROM memberships WHERE user_id='synthetic_global_member'",
          )
        )?.n,
        1,
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });
  test(`${engine}: scoped overrides cannot change unrelated locked fields and audit failure rolls membership and guards back`, async () => {
    const { db, service } = await fixture();
    try {
      await service("bob").command("lock-team", { confirmation: "LOCK_TEAM" });
      const guard =
        "admin-team-add:" + JSON.stringify(["fake_team3", "fake_pending"]);
      await assert.rejects(
        batch(db, [
          ["INSERT INTO write_guards VALUES(?,1)", guard],
          [
            "UPDATE teams SET name='Unauthorized field change' WHERE id='fake_team3'",
          ],
        ]),
        /TEAM_LOCKED/,
      );
      const renameGuard =
        "admin-team-rename:" +
        JSON.stringify(["fake_team3", "Common Ground", "Allowed name"]);
      await assert.rejects(
        batch(db, [
          ["INSERT INTO write_guards VALUES(?,1)", renameGuard],
          [
            "UPDATE teams SET name='Allowed name',bio='Unauthorized private change' WHERE id='fake_team3'",
          ],
        ]),
        /TEAM_LOCKED/,
      );
      const admin = service("admin");
      admin.audit = () => [
        "INSERT INTO write_guards VALUES('synthetic-audit-failure',0)",
      ];
      await assert.rejects(admin.command("admin-add-team-member", add()));
      assert.equal(
        await one(
          db,
          "SELECT user_id FROM memberships WHERE user_id='fake_pending'",
        ),
        undefined,
      );
      assert.equal(
        (await one<any>(db, "SELECT name FROM teams WHERE id='fake_team3'"))
          ?.name,
        "Common Ground",
      );
      assert.equal(
        (
          await rows(
            db,
            "SELECT * FROM audit_logs WHERE action='admin-add-team-member'",
          )
        ).length,
        0,
      );
      assert.equal((await rows(db, "SELECT * FROM write_guards")).length, 0);
    } finally {
      await db.close();
    }
  });
}
