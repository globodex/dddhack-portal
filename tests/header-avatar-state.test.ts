import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers";
import { batch } from "../lib/db";

test("saved expression and color remain available for every profiled role", async () => {
  const { db, service } = await setup();
  try {
    for (const name of ["owner", "admin", "alice", "stranger"]) {
      await batch(db, [[
        "INSERT INTO profile_details(user_id,avatar_color,avatar_expression) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_color=excluded.avatar_color,avatar_expression=excluded.avatar_expression",
        "fake_" + name, "purple", "mixed-plus",
      ]]);
      const actor = await service(name).actor();
      assert.equal(actor.hasProfileAvatar, true);
      assert.equal(actor.avatarColor, "purple");
      assert.equal(actor.avatarExpression, "mixed-plus");
    }
  } finally {
    db.close();
  }
});

test("default avatar values do not pretend an unfinished profile selected them", async () => {
  const { db, service } = await setup();
  try {
    await batch(db, [[
      "DELETE FROM participant_profiles WHERE user_id='fake_admin'",
    ]]);
    const actor = await service("admin").actor();
    assert.equal(actor.hasProfileAvatar, false);
    assert.equal(actor.role, "admin");
    assert.equal(actor.mode, "staff");
  } finally {
    db.close();
  }
});
