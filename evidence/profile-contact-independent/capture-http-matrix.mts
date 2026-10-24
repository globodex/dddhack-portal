// Local-only diagnostic: dynamically load the pinned source's actual HTTP and
// in-memory fixture helpers. No env file, listener, real data or hosted DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [root, expected, output] = process.argv.slice(2);
assert.ok(root && expected && output);
assert.ok(["86862c722233bbd6776f1e2672d78b41fa808a52", "f1b8f39ed383bc20f80b1295b3aa0bf056ee1cdc"].includes(expected));
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), expected);
const load = (path: string) => import(pathToFileURL(resolve(root, path)).href);
const { setup } = await load("tests/helpers.ts");
const { createPGliteFixture } = await load("tests/neon-db-fixture.ts");
const { seedLocal, fixtures, LOCAL_CREDIT_KEY } = await load("scripts/fixtures.ts");
const { batch } = await load("lib/db.ts");
const { handlePortal } = await load("lib/http.ts");
const result = [];
const phone = "+12025550991", org = "org-independent-private-bob";
for (const engine of ["sqlite", "postgres"]) {
  const pg = engine === "postgres" ? await createPGliteFixture() : null;
  const local = pg ? null : await setup();
  const db = pg?.db || local.db;
  try {
    if (pg) await seedLocal(db);
    await batch(db, [
      ["UPDATE profiles SET public=0,gender='woman' WHERE user_id='fake_bob'"],
      ["UPDATE profile_details SET phone=?,openai_org_id=? WHERE user_id='fake_bob'", phone, org],
    ]);
    for (const who of ["owner", "admin", "bob", "carol", "alice", "stranger", null]) {
      for (const route of ["/discover/participants", "/profile", "/dashboard/team"]) {
        const response = await handlePortal(new Request("http://localhost/api/portal?" + new URLSearchParams({ view: route, person: "fake_bob", teamId: "fake_team3" })), { db, identity: who ? fixtures[who] : null, key: LOCAL_CREDIT_KEY, localTest: true });
        const body = await response.json();
        const serialized = JSON.stringify(body);
        result.push({ engine, who, route, status: response.status, code: body.code || null, privateNoStore: response.headers.get("cache-control") === "private, no-store, max-age=0", focusedOrg: body.focusedPerson?.details?.openaiOrgId === org, focusedPhone: body.focusedPerson?.details?.phone === phone, focusedGender: body.focusedPerson?.details?.gender || null, ownProfileOrg: body.profile?.openai_org_id === org, ownProfilePhone: body.profile?.phone === phone, teamHasBobPhone: body.members?.some((member: any) => member.id === "fake_bob" && member.phone === phone) || false, anyBobOrg: serialized.includes(org), anyBobPhone: serialized.includes(phone) });
      }
    }
  } finally { if (pg) await pg.pool.end(); else local.db.close(); }
}
writeFileSync(output, JSON.stringify({ source: expected, syntheticOnly: true, hostedDatabase: false, realPrivateValues: false, rows: result }, null, 2) + "\n");
console.log(JSON.stringify({ source: expected, rows: result.length, engines: ["sqlite", "postgres"], privateNoStore: result.every(row => row.privateNoStore), hostedDatabase: false }));
