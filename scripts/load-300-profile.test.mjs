import assert from "node:assert/strict";
import { normalizeSQL } from "./load-300-profile-normalize.mjs";
const sql =
  "SELECT id,email FROM users WHERE email='secret@example.test' AND score>=99.5 /* private note */ AND name='O''Brien' -- private comment\n ORDER BY id LIMIT 24";
const template = normalizeSQL(sql);
assert.equal(
  template,
  "SELECT id,email FROM users WHERE email='?' AND score>=? AND name='?' ORDER BY id LIMIT ?",
);
assert(
  !template.includes("secret") &&
    !template.includes("Brien") &&
    !template.includes("private"),
);
assert.equal(
  normalizeSQL("SELECT * FROM memberships WHERE team_id=? AND user_id=?"),
  "SELECT * FROM memberships WHERE team_id=? AND user_id=?",
);
console.log(
  "SQL-template redaction assertions passed; bind values are never accepted by the normalizer.",
);
