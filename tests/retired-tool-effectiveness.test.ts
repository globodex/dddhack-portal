import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, activate, attend, submission } from "./helpers";
import { one, rows } from "../lib/db";

test("legacy submission omits retired tool narrative and ignores supplied narrative before retry identity without inferred scores", async () => {
  const { db, service, clock } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    clock("2026-11-01T04:00:00.000Z");
    const {
      toolEffectiveness: _narrative,
      contributions: _contributions,
      commitSha: _hash,
      ...project
    } = submission;
    const first = await service().command("submit", project);
    const retried = await Promise.all(
      [
        null,
        "RETIRED-NARRATIVE-MARKER",
        { retired: "RETIRED-NARRATIVE-MARKER" },
      ].map((toolEffectiveness) =>
        service().command("submit", { ...project, toolEffectiveness }),
      ),
    );
    for (const result of retried) assert.equal(result.id, first.id);
    const versions = await rows<{ payload: string }>(
      db,
      "SELECT payload FROM submission_versions",
    );
    assert.equal(versions.length, 1);
    const payload = JSON.parse(versions[0].payload);
    assert.equal(payload.toolEffectiveness, "");
    assert.equal(
      versions[0].payload.includes("RETIRED-NARRATIVE-MARKER"),
      false,
    );
    assert.equal(payload.openaiClaim, false);
    assert.equal(payload.cerebrasClaim, false);
    assert.equal((await rows(db, "SELECT * FROM reviews")).length, 0);
    const job = await one<{ state: string; report: string | null }>(
      db,
      "SELECT state,report FROM astra_jobs",
    );
    assert.equal(job?.state, "pending");
    assert.equal(job?.report, null);
  } finally {
    db.close();
  }
});
