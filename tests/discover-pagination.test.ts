import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalDatabase } from "../lib/local-test/sqlite";
import {
  discoverParticipants,
  participantPagingFromParams,
} from "../lib/discover-participants";
import { makeLoad300, seedLoad300 } from "../scripts/load-300-fixtures.mjs";
import { draftPolicy } from "../lib/policy";
import { handlePortal } from "../lib/http";

test("Discover traverses the whole synthetic directory without overlap and searches beyond page one", async () => {
  const db = new LocalDatabase(":memory:");
  db.migrate();
  const fixture = makeLoad300();
  await seedLoad300(db, fixture, draftPolicy, new Date("2026-11-01T04:00:00Z"));
  try {
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = await discoverParticipants(db, { cursor, limit: 24 });
      assert.ok(page.items.length <= 24);
      ids.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor || undefined;
      assert.equal(page.hasMore, !!cursor);
      assert.ok(ids.length <= 302);
    } while (cursor);
    assert.equal(ids.length, 300);
    assert.equal(new Set(ids).size, 300);
    const target = ids.at(-1)!;
    const name = db.raw
      .prepare("SELECT display_name FROM participant_profiles WHERE user_id=?")
      .get(target) as { display_name: string };
    const search = await discoverParticipants(db, {
      search: name.display_name,
    });
    assert.ok(search.items.some((p) => p.id === target));
    const full = await discoverParticipants(db, { person: target, limit: 1 });
    assert.equal(full.focusedPerson?.id, target);
    const serialized = JSON.stringify(full);
    for (const privateValue of [
      "@load300.test",
      "+12025550100",
      "Synthetic private core",
      "Synthetic private description",
    ])
      assert.ok(!serialized.includes(privateValue));
    const first = await discoverParticipants(db, { limit: 1 });
    await assert.rejects(
      discoverParticipants(db, {
        cursor: first.nextCursor!,
        search: "another",
      }),
      { code: "INVALID_DIRECTORY_CURSOR" },
    );
    await assert.rejects(
      discoverParticipants(db, {
        cursor: first.nextCursor!,
        membership: "out",
      }),
      { code: "INVALID_DIRECTORY_CURSOR" },
    );
    const inTeam = await discoverParticipants(db, {
      membership: "in",
      limit: 48,
    });
    assert.ok(inTeam.items.every((p) => p.teamStatus === "In a team"));
    const solo = await discoverParticipants(db, {
      membership: "out",
      limit: 48,
    });
    assert.ok(solo.items.every((p) => p.teamStatus === "Not in a team"));
    await db
      .prepare(
        "INSERT INTO record_removals(kind,target_id,active,reason,actor_id,updated_at) VALUES('participant',?,1,'Synthetic removal',?,?)",
      )
      .bind(target, fixture.operations[0].id, "2026-11-01T04:00:00Z")
      .all();
    const removed = await discoverParticipants(db, { person: target });
    assert.equal(removed.focusedPerson, null);
  } finally {
    db.close();
  }
});

test("Discover rejects invalid paging and HTTP slash aliases retain validation", async () => {
  for (const limit of ["0", "49", "NaN", "1.2", "-1", "99999999999999999999"])
    assert.throws(
      () => participantPagingFromParams(new URLSearchParams({ limit })),
      { code: "INVALID_DIRECTORY_LIMIT" },
    );
  const db = new LocalDatabase(":memory:");
  db.migrate();
  const fixture = makeLoad300();
  await seedLoad300(db, fixture, draftPolicy, new Date("2026-11-01T04:00:00Z"));
  try {
    const runtime = {
      db,
      identity: { ...fixture.operations[0], source: "sites" as const },
      key: undefined,
    };
    const r = await handlePortal(
      new Request(
        "http://localhost/api/portal?view=//discover//participants/&limit=49",
      ),
      runtime,
    );
    assert.equal(r.status, 422);
    const page = await handlePortal(
      new Request(
        "http://localhost/api/portal?view=/discover/participants&limit=2",
      ),
      runtime,
    );
    assert.equal(page.status, 200);
    assert.match(page.headers.get("Cache-Control")!, /no-store/);
    assert.equal(((await page.json()) as { items: unknown[] }).items.length, 2);
    await assert.rejects(discoverParticipants(db, { cursor: "%%%" }), {
      code: "INVALID_DIRECTORY_CURSOR",
    });
  } finally {
    db.close();
  }
});
