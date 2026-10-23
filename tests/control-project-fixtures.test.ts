import { test } from "node:test";
import assert from "node:assert/strict";
import { batch, one } from "../lib/db";
import {
  seedControlProjects,
  controlProjectIds,
} from "../scripts/control-project-fixtures";
import { setup, activate, attend, submission } from "./helpers";

test("optional control fixtures add25 public entries without altering rich source or settings", async () => {
  const { db, service } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice");
    const payload = JSON.stringify(submission);
    await batch(db, [
      [
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('visual_project_alice','fake_team1','synthetic-alice',?,2,'2026-11-01T03:00:00.000Z')",
        payload,
      ],
      [
        "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES('visual_alice_v2','fake_team1',2,?,'2026-11-01T03:00:00.000Z')",
        payload,
      ],
      [
        "UPDATE projects SET published_version_id='visual_alice_v2' WHERE id='visual_project_alice'",
      ],
    ]);
    const before = await one(
      db,
      "SELECT * FROM projects WHERE id='visual_project_alice'",
    );
    const settings = await one(db, "SELECT * FROM event_settings");
    const seeded = await seedControlProjects(db);
    assert.equal(seeded.added, 25);
    assert.deepEqual(
      await one(db, "SELECT * FROM projects WHERE id='visual_project_alice'"),
      before,
    );
    assert.deepEqual(await one(db, "SELECT * FROM event_settings"), settings);
    const first: any = await service("stranger").view("/projects", { page: 0 });
    const second: any = await service("stranger").view("/projects", {
      page: 1,
    });
    assert.equal(first.items.length, 24);
    assert.equal(first.hasMore, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
    const target: any = await service("bob").view(
      "/projects/" + controlProjectIds[0].slug,
    );
    assert.equal(target.items[0].upvoted, false);
    assert.equal(target.items[0].upvotes, 0);
    assert.equal(target.items[0].canUpvote, true);
    assert.equal(target.items[0].comments, 0);
    await assert.rejects(seedControlProjects(db), /fresh disposable database/);
  } finally {
    db.close();
  }
});

test("control helper rejects a database without rich seed before creating any users", async () => {
  const { db } = await setup();
  try {
    await assert.rejects(seedControlProjects(db), /Seed --rich/);
    assert.equal(
      (
        await one<{ n: number }>(
          db,
          "SELECT count(*) n FROM users WHERE id LIKE 'fake_control_user_%'",
        )
      )?.n,
      0,
    );
  } finally {
    db.close();
  }
});
