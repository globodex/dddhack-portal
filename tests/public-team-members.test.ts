import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { batch } from "../lib/db";

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: team discovery supplies current public-directory identities without private fields or per-team queries`, async () => {
    const f =
      engine === "sqlite"
        ? await setup()
        : await (async () => {
            const { db } = await createPGliteFixture();
            await seedLocal(db);
            return {
              db,
              service: (who = "alice") =>
                new PortalService(
                  db,
                  fixtures[who],
                  LOCAL_CREDIT_KEY,
                  () => "2026-10-22T08:00:00.000Z",
                ),
            };
          })();
    try {
      await batch(f.db, [
        [
          "UPDATE profiles SET public=0,bio='PRIVATE-BIO-MARKER',socials='[\"https://private.example.invalid\"]' WHERE user_id='fake_bob'",
        ],
        [
            "UPDATE profile_details SET avatar_color='grey',avatar_expression='cheerful',organization='PRIVATE-ORG-MARKER' WHERE user_id='fake_bob'",
        ],
        [
          "UPDATE participant_profiles SET display_name='Saved Bob' WHERE user_id='fake_bob'",
        ],
      ]);
      const prepare = f.db.prepare.bind(f.db);
      let memberQueries = 0;
      f.db.prepare = (sql) => {
        if (
          sql.includes(
            "FROM memberships m JOIN teams t ON t.id=m.team_id JOIN users u",
          )
        )
          memberQueries++;
        return prepare(sql);
      };
      const view = (await f.service("stranger").view("/discover/teams")) as any;
      assert.equal(memberQueries, 1);
      const team = view.items.find((item: any) => item.id === "fake_team3");
      assert.equal(team.readiness.total, 3);
      assert.deepEqual(
        team.members.map((member: any) => member.id),
        ["fake_bob", "fake_carol", "fake_dave"],
      );
      assert.equal(team.members[0].name, "Saved Bob");
      assert.equal(team.members[0].avatarColor, "grey");
      assert.equal(team.members[0].avatarExpression, "cheerful");
      assert.equal(
        team.members[0].profileUrl,
        "/discover/participants#person-fake_bob",
      );
      for (const member of team.members)
        assert.deepEqual(Object.keys(member).sort(), [
          "avatarColor",
          "avatarExpression",
          "id",
          "name",
          "profileUrl",
        ]);
      for (const secret of [
        "PRIVATE-BIO-MARKER",
        "PRIVATE-ORG-MARKER",
        "private.example.invalid",
        "bob@portal.test",
        "+12025550100",
        "private core idea",
      ])
        assert.ok(!JSON.stringify(view).includes(secret), secret);
      // A complete-looking Viewer must never enter this public identity list.
      await batch(f.db, [
        [
          "INSERT INTO memberships VALUES('fake_stranger','fake_team3','2026-10-22T08:00:00.000Z')",
        ],
      ]);
      const withViewer = (await f
        .service("stranger")
        .view("/teams/fake_team3")) as any;
      assert.equal(withViewer.items[0].readiness.total, 4);
      assert.equal(withViewer.items[0].members.length, 3);
      await f
        .service("admin")
        .command("remove-workspace-member", { userId: "fake_carol" });
      const current = (await f
        .service("stranger")
        .view("/teams/fake_team3")) as any;
      assert.ok(
        !current.items[0].members.some(
          (member: any) => member.id === "fake_carol",
        ),
      );
      await f
        .service("admin")
        .command("participant-deactivate", {
          userId: "fake_dave",
          confirmation: "REMOVE_PARTICIPANT",
        });
      const removed = (await f
        .service("stranger")
        .view("/teams/fake_team3")) as any;
      assert.ok(
        !removed.items[0].members.some(
          (member: any) => member.id === "fake_dave",
        ),
      );
      const first = (await f
        .service("stranger")
        .view("/discover/participants", { limit: 2 })) as any;
      assert.equal(first.items.length, 2);
      assert.ok(first.hasMore);
      const next = (await f
        .service("stranger")
        .view("/discover/participants", {
          limit: 2,
          cursor: first.nextCursor,
        })) as any;
      assert.ok(
        next.items.every(
          (member: any) =>
            !first.items.some((prior: any) => prior.id === member.id),
        ),
      );
      const focused = (await f
        .service("stranger")
        .view("/discover/participants", {
          person: "fake_bob",
          limit: 2,
        })) as any;
      assert.equal(focused.focusedPerson.name, "Saved Bob");
      assert.equal(focused.focusedPerson.bio, "");
      assert.deepEqual(focused.focusedPerson.socials, []);
    } finally {
      await f.db.close();
    }
  });
}
