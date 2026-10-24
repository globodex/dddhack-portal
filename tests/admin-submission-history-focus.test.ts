import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";

test("authorized review selects one saved version belonging to the project without expanding all payloads", async () => {
  const { db, service } = await setup();
  try {
    await seedRichVisual(db);
    const current = await service("admin").view("/admin/submissions/visual_project_alice") as any;
    assert.equal(current.version.id, "visual_alice_v2");
    assert.equal(current.currentVersionId, "visual_alice_v2");
    assert.equal(current.selectedIsCurrent, true);
    const previous = await service("admin").view("/admin/submissions/visual_project_alice", { focus: "visual_alice_v1" }) as any;
    assert.equal(previous.version.id, "visual_alice_v1");
    assert.match(previous.version.payload.description, /^Synthetic local version 1\./);
    assert.doesNotMatch(previous.version.payload.description, /Synthetic local version 2/);
    assert.equal(previous.currentVersionId, "visual_alice_v2");
    assert.equal(previous.selectedIsCurrent, false);
    assert.equal(previous.versions.length, 2);
    assert.ok(previous.versions.every((version: any) => !Object.hasOwn(version, "payload")));
    assert.equal(previous.evaluationControl.allowed, false);
    await assert.rejects(service("admin").view("/admin/submissions/visual_project_alice", { focus: "visual_eve_v3" }), { code: "SUBMISSION_NOT_FOUND" });
    await assert.rejects(service("stranger").view("/admin/submissions/visual_project_alice", { focus: "visual_alice_v1" }), (error: any) => error.status === 403);
  } finally { db.close(); }
});
