import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "./helpers";
import { createPGliteFixture } from "./neon-db-fixture";
import { seedLocal, fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { handlePortal } from "../lib/http";

for (const engine of ["sqlite", "postgres"] as const) {
  test(`${engine}: actual personal-credit GET gives removed self actionable403 without exposing credits`, async () => {
    const context =
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
    const { db, service } = context;
    try {
      await service("admin").command("quick-check-in", {
        emails: ["carol@portal.test"],
      });
      const csv = "Private removal pool\nFAKE-REMOVAL-PRIVATE-CREDIT";
      const prepared = await service("admin").command("preview-credit-batch", {
        csv,
      });
      await service("admin").command("publish-credit-batch", {
        csv,
        digest: prepared.digest,
        confirmation: "PUBLISH_CREDIT_BATCH",
      });
      const request = () =>
        new Request(
          "https://portal.test/api/portal?view=%2Fpersonal%2Fcredits",
        );
      const runtime = { db, identity: fixtures.carol, key: LOCAL_CREDIT_KEY };
      const before = await handlePortal(request(), runtime);
      assert.equal(before.status, 200);
      await service("admin").command("participant-deactivate", {
        userId: "fake_carol",
        confirmation: "REMOVE_PARTICIPANT",
      });
      const response = await handlePortal(request(), runtime),
        body = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 403);
      assert.equal(body.code, "PARTICIPANT_REMOVED");
      assert.match(String(body.message), /Contact an organizer/);
      assert.ok(
        !("credits" in body) && !("items" in body) && !("value" in body),
      );
      assert.ok(!JSON.stringify(body).includes("FAKE-REMOVAL-PRIVATE-CREDIT"));
      assert.match(response.headers.get("cache-control") || "", /no-store/);
    } finally {
      await db.close();
    }
  });
}
