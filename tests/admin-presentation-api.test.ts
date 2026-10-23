import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { handlePortal, type Runtime } from "../lib/http";
import { PortalService } from "../lib/service";
import { fixtures, LOCAL_CREDIT_KEY, seedLocal } from "../scripts/fixtures";
import type { Database } from "../lib/db";
import {
  AdminPresentationCache,
  AdminPresentationCacheMiss,
} from "../lib/admin-presentation";

const options = { search: "", page: 0, focus: "" };
const path = "/admin/participants";

test(
  "actual D1 API Admin deltas keep fresh status and locked ideas, invalidate labels and reauthorize every actor",
  { timeout: 30_000 },
  async () => {
    const mf = new Miniflare({
      modules: true,
      script:
        'export default {fetch(){return new Response("synthetic admin cache test")}}',
      compatibilityDate: "2026-07-01",
      cf: false,
      d1Databases: { DB: "admin-presentation-test" },
    });
    try {
      const db: Database = await mf.getD1Database("DB");
      const directory = new URL("../drizzle/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        for (const statement of readFileSync(new URL(file, directory), "utf8")
          .split("--> statement-breakpoint")
          .filter((value) => value.trim()))
          await db.prepare(statement).all();
      }
      await seedLocal(db);
      await db
        .prepare(
          "INSERT INTO registrations(email,status,luma_confirmed) VALUES('never_signed_in@portal.test','pending',1)",
        )
        .all();
      const runtime = (who: string | null): Runtime => ({
        db,
        identity: who ? fixtures[who] : null,
        key: LOCAL_CREDIT_KEY,
      });
      const read = async (
        who: string | null = "admin",
        view = path,
        presentation?: string,
        search = "",
      ) => {
        const params = new URLSearchParams({
          view,
          q: search,
          page: "0",
          focus: "",
        });
        if (presentation) params.set("presentation", presentation);
        const response = await handlePortal(
          new Request(`https://portal.test/api/portal?${params}`),
          runtime(who),
        );
        assert.match(
          response.headers.get("cache-control") || "",
          /private, no-store/,
        );
        return {
          response,
          body: (await response.json()) as Record<string, any>,
        };
      };
      const cache = new AdminPresentationCache();
      const first = await read();
      assert.equal(first.response.status, 200);
      assert.equal(first.body.adminPresentation.unchanged, false);
      await cache.merge(first.body, path, options);
      const version = await cache.knownVersion(path, first.body.me, options);
      assert.equal(version, first.body.adminPresentation.version);
      const unsigned = first.body.items.find(
        (row: any) => row.email === "never_signed_in@portal.test",
      );
      assert.equal(unsigned.id, null);

      // Fixture-only durable change; next authorized API read must carry it despite an exact version match.
      await db
        .prepare(
          "UPDATE registrations SET status='pending' WHERE email='alice@portal.test'",
        )
        .all();
      const delta = await read("admin", path, version);
      assert.equal(delta.body.adminPresentation.unchanged, true);
      assert.equal(
        delta.body.items.find((row: any) => row.id === "fake_alice").name,
        undefined,
      );
      assert.equal(
        delta.body.items.find((row: any) => row.id === "fake_alice").status,
        "Registered",
      );
      assert.equal(
        delta.body.items.find(
          (row: any) => row.email === "never_signed_in@portal.test",
        ).name,
        unsigned.name,
      );
      const fullCurrent = await read();
      assert.ok(
        Buffer.byteLength(JSON.stringify(delta.body)) <
          Buffer.byteLength(JSON.stringify(fullCurrent.body)),
      );
      assert.deepEqual(
        (await cache.merge(delta.body, path, options)).items,
        fullCurrent.body.items,
      );

      await db
        .prepare(
          "UPDATE participant_profiles SET display_name='Synthetic Override' WHERE user_id='fake_alice'",
        )
        .all();
      const renamed = await read("admin", path, version);
      assert.equal(renamed.body.adminPresentation.unchanged, false);
      assert.notEqual(renamed.body.adminPresentation.version, version);
      assert.equal(
        renamed.body.items.find((row: any) => row.id === "fake_alice").name,
        "Synthetic Override",
      );
      await cache.merge(renamed.body, path, options);
      await db
        .prepare(
          "UPDATE profile_details SET avatar_color='purple' WHERE user_id='fake_alice'",
        )
        .all();
      const avatar = await read(
        "admin",
        path,
        renamed.body.adminPresentation.version,
      );
      assert.equal(avatar.body.adminPresentation.unchanged, false);
      assert.equal(
        avatar.body.items.find((row: any) => row.id === "fake_alice")
          .avatarColor,
        "purple",
      );

      await db
        .prepare(
          "INSERT INTO team_locks(team_id,locked_by,locked_at) VALUES('fake_team1','fake_alice','2026-10-23T08:00:00.000Z')",
        )
        .all();
      const teams = await read("admin", "/admin/teams");
      const lockBefore = teams.body.items.find(
        (row: any) => row.id === "fake_team1",
      ).lockedAt;
      const admin = new PortalService(
        db,
        fixtures.admin,
        LOCAL_CREDIT_KEY,
        () => "2026-10-23T08:01:00.000Z",
      );
      await admin.command("admin-idea-override", {
        teamId: "fake_team1",
        title: "LOCKED PRIVATE IDEA OVERRIDE",
        description: "Synthetic authorized locked override",
        reason: "Synthetic presentation cache test",
        confirmation: "OVERRIDE_TEAM_IDEA",
      });
      const ideaDelta = await read(
        "admin",
        "/admin/teams",
        teams.body.adminPresentation.version,
      );
      assert.equal(ideaDelta.body.adminPresentation.unchanged, true);
      const changedTeam = ideaDelta.body.items.find(
        (row: any) => row.id === "fake_team1",
      );
      assert.equal(changedTeam.name, undefined);
      assert.equal(changedTeam.idea.title, "LOCKED PRIVATE IDEA OVERRIDE");
      assert.equal(changedTeam.locked, true);
      assert.equal(changedTeam.lockedAt, lockBefore);
      const teamCache = new AdminPresentationCache();
      await teamCache.merge(teams.body, "/admin/teams", options);
      assert.equal(
        (
          await teamCache.merge(ideaDelta.body, "/admin/teams", options)
        ).items.find((row: any) => row.id === "fake_team1").idea.title,
        "LOCKED PRIVATE IDEA OVERRIDE",
      );

      const owner = await read(
        "owner",
        path,
        avatar.body.adminPresentation.version,
      );
      assert.equal(owner.response.status, 200);
      assert.equal(owner.body.me.owner, true);
      assert.equal(owner.body.adminPresentation.unchanged, false);
      assert.notEqual(
        owner.body.adminPresentation.scope,
        avatar.body.adminPresentation.scope,
      );
      await cache.merge(owner.body, path, options);
      await assert.rejects(
        cache.merge(delta.body, path, options),
        AdminPresentationCacheMiss,
      );
      const differentQuery = await read(
        "admin",
        path,
        avatar.body.adminPresentation.version,
        "different",
      );
      assert.equal(differentQuery.body.adminPresentation.unchanged, false);
      const anonymous = await read(
        null,
        path,
        avatar.body.adminPresentation.version,
      );
      assert.equal(anonymous.response.status, 401);
      assert.equal(anonymous.body.adminPresentation, undefined);
      await db
        .prepare("UPDATE users SET role='participant' WHERE id='fake_admin'")
        .all();
      const revoked = await read(
        "admin",
        path,
        avatar.body.adminPresentation.version,
      );
      assert.equal(revoked.response.status, 403);
      assert.equal(revoked.body.items, undefined);
      assert.equal(revoked.body.adminPresentation, undefined);
      cache.clear();
      assert.equal(
        await cache.knownVersion(path, owner.body.me, options),
        undefined,
      );
    } finally {
      await mf.dispose();
    }
  },
);
