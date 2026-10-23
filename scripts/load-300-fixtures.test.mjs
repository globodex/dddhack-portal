import assert from "node:assert/strict";
import {
  makeLoad300,
  defaultSeed,
  projectPayload,
} from "./load-300-fixtures.mjs";
const first = makeLoad300(),
  repeat = makeLoad300(defaultSeed),
  different = makeLoad300(defaultSeed + 1);
assert.deepEqual(first, repeat);
assert.notEqual(
  first.summary.assignmentSHA256,
  different.summary.assignmentSHA256,
);
assert.equal(first.participants.length, 300);
assert.equal(first.teams.length, 90);
assert.equal(new Set(first.participants.map((p) => p.id)).size, 300);
assert.equal(new Set(first.participants.map((p) => p.email)).size, 300);
assert(
  first.teams.every(
    (team) => team.members.length >= 1 && team.members.length <= 5,
  ),
);
assert.equal(first.teams.flatMap((t) => t.members).length, 300);
assert.equal(new Set(first.teams.flatMap((t) => t.members)).size, 300);
assert.equal(
  Object.values(first.summary.teamSizeDistribution).reduce((a, b) => a + b, 0),
  90,
);
assert.equal(
  Object.entries(first.summary.teamSizeDistribution).reduce(
    (a, [size, count]) => a + Number(size) * count,
    0,
  ),
  300,
);
for (const team of first.teams) {
  assert(team.members.includes(team.leaderId));
  for (const id of team.members)
    assert.equal(
      first.participants.find((p) => p.id === id).teamIndex,
      team.index,
    );
}
assert(
  first.operations.every(
    (person) =>
      person.role === "admin" &&
      !first.participants.some((p) => p.id === person.id),
  ),
);
assert.equal(
  projectPayload(first.teams[0], 1).logo.startsWith("data:image/png;base64,"),
  true,
);
console.log(JSON.stringify({ passed: true, summary: first.summary }, null, 2));
