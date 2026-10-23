# Local Team control fixture

`team-controls-fixtures.ts` is an opt-in helper for the coordinator's fresh disposable local D1 write-phase database. It is never imported by production code, opens no database, makes no requests, and performs no writes at import.

After migrations and the ordinary local seed, call once:

```ts
import { seedTeamControls } from "./team-controls-fixtures";
const fixture = await seedTeamControls(db, {
  scope: "fresh-disposable-local",
});
```

Do not call it against the current clean screenshot database or hosted infrastructure. The mandatory scope, seed/settings check, reserved-row collision check and atomic insertion prevent accidental replay or overwrite; these guards do not independently detect remote bindings. The harness must supply a fresh local binding. No policy, existing row or trigger is modified. All normal membership, profile and idea constraints remain active.

| Purpose | User ID | Email |
| --- | --- | --- |
| Forming leader | `fake_teamqa_leader` | `teamqa_leader@portal.test` |
| Existing forming member | `fake_teamqa_member` | `teamqa_member@portal.test` |
| Pending request to accept | `fake_teamqa_accept` | `teamqa_accept@portal.test` |
| Pending request to decline | `fake_teamqa_decline` | `teamqa_decline@portal.test` |
| Sole unlocked leader | `fake_teamqa_solo` | `teamqa_solo@portal.test` |

- Forming team: `fake_teamqa_forming`, name `Synthetic Green Loop`, two members.
- Solo team: `fake_teamqa_solo_team`, name `Synthetic Solo Team`, one member.
- Pending accept request: `fake_teamqa_request_accept`.
- Pending decline request: `fake_teamqa_request_decline`.

All five people have completed profiles, roster membership, pending registrations, reserved synthetic phones, two synthetic social URLs and valid expression/color selections. There are no check-ins, approvals, locks, venue values, projects or submission versions. Both saved ideas begin empty so the UI can prove the saved-idea prerequisite before locking. The seed timestamp is `2026-10-23T09:00:00.000Z`, and the helper rejects policies whose idea/membership deadlines already precede it. Actual write-phase runtime must also remain before the configured freeze.

Suggested UI order: local invalid idea validation, fill/save and reload, rename/reload, eight palette choices/style save, accept one request, decline the other, remove the accepted member, then lock and prove editing is frozen. Use the separate solo team for named recoverable deletion and audit/history checks. Permission failures should use the existing forming member. Do not enable Leave/Transfer commands; no supported implementation is established.

Verification performed without ports or shared output: `node --import tsx tests/team-control-fixtures.test.ts` passes in a new in-memory SQLite DB. It proves additive seeding, replay rejection, Forming/Registered projections, two pending requests, lock-before-idea denial, member rename denial, saved idea/name/style writes, request accept/decline, removal, lock freeze and recoverable solo deletion without erasing the team snapshot. This is not rendered UI write acceptance.
