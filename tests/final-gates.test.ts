import { freezeResults } from "./helpers";
import { attend } from "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, submission } from "./helpers";
import { batch, one } from "../lib/db";
test("ties need complete owner adjudication; altered score breakdown invalidates earlier order", async () => {
  const { db, clock, service } = await setup();
  await activate(db);
  await attend(db, "fake_alice", "fake_bob", "fake_eve");
  clock("2026-11-01T06:00:00.000Z");
  const a = await service("alice").command("submit", submission);
  const b = await service("bob").command("submit", {
    ...submission,
    contributions: ["bob", "carol", "dave"].map((n) => ({
      userId: "fake_" + n,
      role: "FAKE contribution",
      codex: "FAKE Codex workflow",
    })),
  });
  for (const judgeId of ["fake_judge", "fake_judge2"])
    for (const teamId of ["fake_team1", "fake_team3"])
      await service("owner").command("assign-judge", {
        judgeId,
        teamId,
        reason: "Rehearsal assignment",
      });
  clock("2026-11-01T11:00:00.000Z");
  const review = (
    teamId: string,
    versionId: unknown,
    astra = 20,
    falseClaims = 0,
  ) => ({
    teamId,
    versionId,
    eligibility: "eligible",
    astra,
    codex: 4,
    diversity: 6,
    falseClaims,
    evidence: "FAKE evidence reviewed by a human.",
    reason: "Rehearsal review",
  });
  for (const judge of ["judge", "judge2"])
    for (const teamId of ["fake_team1", "fake_team3"])
      await service(judge).command("judge-score", {
        teamId,
        rating: 8,
        notes: "Fake independent score",
      });
  await assert.rejects(
    service("admin").command("review", review("fake_team1", a.id, 20, 1)),
    /NO_UNCLAIMED_API_PENALTIES/,
  );
  await service("admin").command("review", review("fake_team1", a.id));
  await service("admin").command("review", review("fake_team3", b.id));
  clock("2026-11-01T13:00:00.000Z");
  await assert.rejects(
    freezeResults(service("owner"), { reason: "Rehearsal freeze" }),
    /Owner must record/,
  );
  await assert.rejects(
    service("admin").command("resolve-tie", {
      teamIds: ["fake_team3", "fake_team1"],
      reason: "test",
    }),
    /OWNER_REQUIRED/,
  );
  await service("owner").command("resolve-tie", {
    teamIds: ["fake_team3", "fake_team1"],
    reason:
      "FAKE approved tie procedure: panel adjudication for this exact breakdown.",
  });
  await service("admin").command("review", review("fake_team1", a.id, 21));
  await service("admin").command("review", review("fake_team3", b.id, 21));
  await assert.rejects(
    freezeResults(service("owner"), { reason: "Rehearsal freeze" }),
    /Owner must record/,
  );
  await service("owner").command("resolve-tie", {
    teamIds: ["fake_team3", "fake_team1"],
    reason: "FAKE re-adjudication after score correction.",
  });
  const snapshot = await freezeResults(service("owner"), {
    reason: "Rehearsal freeze after adjudication",
  });
  await assert.rejects(
    service("owner").command("publish-results", {
      snapshotId: snapshot.snapshotId,
      reason: "FAKE reveal",
    }),
    /USE_STAGED_SCORE_REVEAL/,
  );
  const pub = await service("alice").view("/winners");
  assert.equal((pub.items as unknown[]).length, 0);
  const privateSnapshot = await one<{ payload: string }>(
    db,
    "SELECT payload FROM result_snapshots WHERE id=?",
    snapshot.snapshotId,
  );
  assert.equal(JSON.parse(privateSnapshot!.payload)[0].name, "Common Ground");
  db.close();
});
test("snapshot revision guard and request throttle fail closed", async () => {
  const { db, service } = await setup();
  const rev = (await one<{ version: number }>(
    db,
    "SELECT version FROM scoring_revision WHERE id=1",
  ))!.version;
  await assert.rejects(
    batch(db, [
      [
        "INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)",
        "stale",
        1,
        rev - 1,
        "[]",
        "2026-11-01T13:00:00.000Z",
        "fake_owner",
      ],
    ]),
    /SCORING_CHANGED_RETRY/,
  );
  const outcomes = await Promise.allSettled(
    Array.from({ length: 121 }, () =>
      service("alice").command("profile", { bio: "FAKE throttle rehearsal" }),
    ),
  );
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 120);
  assert.equal(outcomes.filter((o) => o.status === "rejected").length, 1);
  db.close();
});
