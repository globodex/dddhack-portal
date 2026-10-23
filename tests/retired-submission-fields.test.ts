import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { one, rows } from "../lib/db";

type API = "revised" | "legacy";
type Fixture = Awaited<ReturnType<typeof setup>>;
type Service = ReturnType<Fixture["service"]>;
type Payload = Record<string, unknown>;
type Version = { id: string; attempt: number; payload: string };

function values(api: API, name = "Retired fields rehearsal"): Payload {
  const {
    contributions: _contributions,
    commitSha: _hash,
    ...legacy
  } = submission;
  if (api === "legacy") return { ...legacy, projectName: name };
  return {
    projectName: name,
    problemSolution: submission.problemSolution,
    description: submission.description,
    github: submission.github,
    demo: submission.demo,
    logo: submission.logo,
    banner: submission.banner,
    tools: submission.tools,
    attestation: submission.attestation,
  };
}

function commit(api: API, service: Service, project: Payload, revision = 0) {
  return api === "revised"
    ? service.command("submit-project", { revision, project })
    : service.command("submit", project);
}

async function versions(fixture: Fixture, teamId: string) {
  return rows<Version>(
    fixture.db,
    "SELECT id,attempt,payload FROM submission_versions WHERE team_id=? ORDER BY attempt",
    teamId,
  );
}

const retiredValues: unknown[] = [
  null,
  "not-json: retired-only-marker",
  { userId: "not-a-member", role: "retired-only-marker" },
  [{ userId: "fake_carol", role: "", codex: "" }],
  Array.from({ length: 8 }, () => ({ retired: "retired-only-marker" })),
];

for (const api of ["revised", "legacy"] as const) {
  test(`${api}: multi-member submission omits contributions; retired values do not change persisted data or concurrent retry identity`, async () => {
    const fixture = await setup();
    const { db, service, clock } = fixture;
    try {
      await activate(db);
      await attend(db, "fake_bob");
      clock("2026-11-01T04:00:00.000Z");
      const project = values(api);
      assert.equal(Object.hasOwn(project, "contributions"), false);
      let revision = 0;
      if (api === "revised") {
        await service("bob").command("save-project", { revision, project });
        revision = 1;
        assert.equal((await versions(fixture, "fake_team3")).length, 0);
      }
      const first = await commit(api, service("bob"), project, revision);
      const firstId = api === "revised" ? first.versionId : first.id;
      assert.equal(typeof firstId, "string");
      const retried = await Promise.all(
        retiredValues.map((contributions) =>
          commit(api, service("bob"), { ...project, contributions }, revision),
        ),
      );
      for (const result of retried)
        assert.equal(api === "revised" ? result.versionId : result.id, firstId);
      const committed = await versions(fixture, "fake_team3");
      assert.equal(committed.length, 1);
      assert.equal(committed[0].attempt, 1);
      const persisted = JSON.parse(committed[0].payload);
      assert.deepEqual(persisted.contributions, []);
      assert.equal(persisted.projectName, project.projectName);
      assert.equal(persisted.attestation, true);
      assert.equal(committed[0].payload.includes("retired-only-marker"), false);
      if (api === "revised") {
        const draft = await one<{ draft: string }>(
          db,
          "SELECT draft FROM projects WHERE team_id='fake_team3'",
        );
        assert.ok(draft);
        assert.deepEqual(JSON.parse(draft.draft).contributions, []);
        assert.equal(draft.draft.includes("retired-only-marker"), false);
        assert.equal(
          (await rows(db, "SELECT * FROM project_commit_receipts")).length,
          1,
        );
      } else {
        assert.equal((await rows(db, "SELECT * FROM astra_jobs")).length, 1);
      }
    } finally {
      db.close();
    }
  });

  test(`${api}: retiring contributions retains leader attendance, submission window, accuracy attestation and raster media guards`, async () => {
    const fixture = await setup();
    const { db, service, clock } = fixture;
    try {
      await activate(db);
      clock("2026-11-01T04:00:00.000Z");
      const project = values(api);
      await assert.rejects(commit(api, service("stranger"), project), {
        code: "VIEWER_READ_ONLY",
      });
      await assert.rejects(commit(api, service("carol"), project), {
        code: "LEADER_REQUIRED",
      });
      await assert.rejects(commit(api, service("bob"), project), {
        code: "TEAM_CHECKIN_REQUIRED",
      });
      await attend(db, "fake_carol");
      await assert.rejects(commit(api, service("bob"), project), {
        code: "LEADER_CHECKIN_REQUIRED",
      });
      await attend(db, "fake_bob");
      for (const time of [
        "2026-11-01T02:29:59.999Z",
        "2026-11-01T10:30:00.000Z",
      ]) {
        clock(time);
        await assert.rejects(commit(api, service("bob"), project), {
          code: "SUBMISSIONS_CLOSED",
        });
      }
      clock("2026-11-01T04:00:00.000Z");
      await assert.rejects(
        commit(api, service("bob"), { ...project, attestation: false }),
        { code: "ATTESTATION_REQUIRED" },
      );
      await assert.rejects(
        commit(api, service("bob"), { ...project, banner: "" }),
        { code: "PROJECT_MEDIA_REQUIRED" },
      );
      await assert.rejects(
        commit(api, service("bob"), { ...project, banner: project.logo }),
        { code: "IMAGE_RATIO" },
      );
      assert.equal((await versions(fixture, "fake_team3")).length, 0);
      assert.equal((await rows(db, "SELECT * FROM projects")).length, 0);
      await commit(api, service("bob"), project);
      assert.equal((await versions(fixture, "fake_team3")).length, 1);
    } finally {
      db.close();
    }
  });

  test(`${api}: ignored contributions cannot consume extra retry attempts or bypass the immutable three-version ceiling`, async () => {
    const fixture = await setup();
    const { db, service, clock } = fixture;
    try {
      await activate(db);
      await attend(db, "fake_alice");
      clock("2026-11-01T04:00:00.000Z");
      let third: Record<string, unknown> | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const project = values(api, `Committed version ${attempt}`);
        const result = await commit(api, service(), project, attempt - 1);
        const retried = await commit(
          api,
          service(),
          { ...project, contributions: retiredValues[attempt] },
          attempt - 1,
        );
        assert.equal(
          api === "revised" ? retried.versionId : retried.id,
          api === "revised" ? result.versionId : result.id,
        );
        assert.equal((await versions(fixture, "fake_team1")).length, attempt);
        third = result;
      }
      assert.ok(third);
      await assert.rejects(
        commit(
          api,
          service(),
          { ...values(api, "Attempt four"), contributions: false },
          3,
        ),
        api === "revised"
          ? { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" }
          : /CHECK constraint failed/,
      );
      if (api === "revised")
        await assert.rejects(
          service().command("save-project", {
            revision: 3,
            project: { ...values(api), contributions: "retired-only-marker" },
          }),
          { code: "PROJECT_LOCKED_AFTER_THIRD_SUBMISSION" },
        );
      const committed = await versions(fixture, "fake_team1");
      assert.deepEqual(
        committed.map((v) => v.attempt),
        [1, 2, 3],
      );
      for (const version of committed)
        assert.deepEqual(JSON.parse(version.payload).contributions, []);
      await assert.rejects(
        db
          .prepare("UPDATE submission_versions SET payload='{}' WHERE id=?")
          .bind(committed[0].id)
          .all(),
        /IMMUTABLE/,
      );
      assert.deepEqual(await versions(fixture, "fake_team1"), committed);
    } finally {
      db.close();
    }
  });
}
