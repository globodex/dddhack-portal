import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { seedRichVisual } from "../scripts/visual-rich-fixtures";
import { handlePortal } from "../lib/http";
import { rows,one,batch } from "../lib/db";

test("public comment posts without a confirmation token while content validation and authentication remain enforced", async () => {
  const f = await setup();
  try {
    await seedRichVisual(f.db);
    const policy=JSON.parse((await one<any>(f.db,'SELECT policy FROM event_settings WHERE id=1'))!.policy);policy.submissionClose=new Date(Date.now()-1000).toISOString();await batch(f.db,[["UPDATE event_settings SET policy=? WHERE id=1",JSON.stringify(policy)]]);
    const post = (body: string, identity = fixtures.alice) =>
      handlePortal(
        new Request("https://portal.test/api/portal", {
          method: "POST",
          headers: {
            origin: "https://portal.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "comment-project",
            data: { projectId: "visual_project_alice", body },
          }),
        }),
        { db: f.db, identity, key: LOCAL_CREDIT_KEY },
      );
    const before = (await rows(f.db, "SELECT id FROM project_comments")).length;
    for (const body of ["", "short", "x".repeat(1501)]) {
      const r = await post(body);
      assert.equal(r.status, 422);
    }
    const signedOut = await post(
      "A valid synthetic comment from a signed-out visitor.",
      null as any,
    );
    assert.equal(signedOut.status, 401);
    assert.equal(
      (await rows(f.db, "SELECT id FROM project_comments")).length,
      before,
    );
    const body =
      "Synthetic public feedback stays literal: <b>do not render HTML</b>.";
    const result = await post(body);
    assert.equal(result.status, 200);
    assert.equal(((await result.json()) as any).message, "Comment posted.");
    const saved = await rows<{ body: string }>(
      f.db,
      "SELECT body FROM project_comments WHERE body=?",
      body,
    );
    assert.equal(saved.length, 1);
    assert.equal(saved[0].body, body);
  } finally {
    f.db.close();
  }
});
