# Publication update

The tested core and subsequent session/reveal/policy extension are now public version 4. See [CORE_PUBLICATION.md](CORE_PUBLICATION.md). Older local-only statements below are historical.

# Current extension to this checkpoint

See [SESSION_AND_REVEALS.md](SESSION_AND_REVEALS.md) for the subsequent session/logout, mandatory confirmations, manual staged reveals, confirmed event choices and global policy controls. Earlier statements below about unresolved capacity/deadline/reveal order are superseded. Publication is tracked in CORE_PUBLICATION.md when completed.

# Local portal revision — 23 October 2026

Status: implemented and functionally verified locally; not published. Visual acceptance remains blocked. The live public Site remains version 3; this revision does not change hosted data, role grants, policies, credentials or runtime configuration.

## Implemented behavior

- Inline profile completion precedes the participant dashboard. Display name, bio, skills and an explicit self-reported gender choice are required. Existing profile values survive updates. Prefer not to say remains valid; gender is never included in public project/profile projections.
- Registered people can create teams or request membership. Sixteen original geometric avatar presets and seven contrast-tested palettes provide a shared team accent. Going is derived from a nonempty joined roster with every member individually approved. Attendance and submission remain separate facts.
- A shared project draft commits immutable submission versions, with required square logo, 16:9 banner and per-member contribution. Raster media is bounded and served separately; uncommitted media stays private. Policy and deadline gates remain server-side.
- Eligible committed projects appear without a separate publication/moderation gate. The public searchable list orders upvotes descending, immutable first-submission time ascending and stable internal ID for exact ties. There are no numeric ranks or evaluation messages. Signed-in people, including admins, may upvote and comment. Own ineligible projects show the team a private reason and remain off the public list. Dashboard links highlight the project and select its containing page.
- Public comments and team-visible private advice are separate records. Judges score only assigned projects; mentors advise only assigned teams/projects. Volunteers have participant lookup/check-in capabilities. Admins manage participants, teams and submissions. Owner-only settings include roles, Logs and explicit final score reveal. Server authorization is re-read per request; no live permissions were granted.
- Owner Settings edits draft/published agenda, FAQ, rules, general venue and validated Google Maps links. Exact venue and directions have separate storage/projections and are visible only to Going team members, owner or explicitly authorized operational admins. Approval/membership/permission revocation takes effect on the next request. Exact venue values do not enter public HTML/API, exports, audit payloads or client code.
- The revised home uses the requested exact title, upright highlighted New Delhi, four compact host badges, scroll chapters and horizontal agenda progression with normal-list/button alternatives. Decorative geometric motion has pause, reduced-motion and offscreen handling. Neither rejected backdrop nor unapproved landmark word art is integrated.

## Verification

| Check                 | Result and scope                                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript            | Pass                                                                                                                                                                                                                                                                                    |
| Regression tests      | 33 passed, 0 failed; SQLite plus real local D1 migration/atomicity tests, required gender, role/assignment boundaries, roster readiness, venue revocation, media/version isolation, content CAS, leaderboard ordering/pagination, immutable timestamps and explicit score reveal        |
| Production build      | Official Sites helper passed; artifact gate inspected 127 files; no affected advisory package, compiler entry, unresolved dependency or dynamic expression is reachable in the generated runtime                                                                                        |
| Compiled Worker smoke | Pass in an isolated synthetic Dispatch/D1 harness: anonymous/private boundaries, standalone forged identity rejection, dashboard without bootstrap/credit key, Registered team creation, required gender, draft save, private venue exposure/revocation and public evaluation exclusion |
| Static UI checks      | Server rendering, original preset uniqueness, palette text contrast and selected markup safeguards passed; these are not browser visual/accessibility checks                                                                                                                            |
| Browser QA            | Blocked: local computer/browser inventory returned no apps or browsers. No headless/browser-policy workaround used; no visual comparison or interactive ChatGPT login success claimed                                                                                                   |

Fresh evidence: `evidence/ux-v3-tests.log`, `evidence/ux-v3-typecheck.log`, `evidence/ux-v3-build.log`, `evidence/ux-v3-production.log`, `evidence/sites-production-smoke.json` and `evidence/sites-artifact-reachability.json`. Earlier browser/a11y evidence belongs to the old UI and does not validate this revision.

## Remaining decisions and release gates

1. Visual browser QA and user review of the revised pages are outstanding. The new Delhi word art is still pending approval.
2. Host images/names: the event-linked Luma profiles verify Parampreet Singh (param302), Shivay L (howdevelop), Nikhil Shukla (nikhils) and Shresth Shukla (thisisshresth). Their verified linked X references are Param3021, nikhilsbuilds and callmeshuklaji; no X handle is supplied for Shivay. Each of those three X page reads returned HTTP 403. The four verified Luma avatar downloads also returned HTTP 403 (one attempt per image, no bypass or alternate transfer route). Initials remain. Shivay’s complete surname remains unresolved; no invented names/faces were added. This is an asset-fetch blocker, not a reason to hold the tested core release.
3. IIIT Delhi is user-supplied general venue. The public Luma page still hides the exact address and exposes no Google Maps link. Both map fields and private location remain unset until the host supplies them.
4. Capacity 150 versus 160, event-day team formation versus the earlier freeze, submission cutoff variants, scoring/engagement implications and other outstanding policy confirmations remain draft. Tests use explicitly synthetic policies and do not resolve live policy choices.
5. AI evaluation remains Not configured. The new command rejects execution before any provider invocation, and participants/public receive no internal evaluation progress. Durable run records and a uniqueness guard are structural only: no supported durable queue/cron consumer has been verified. No waitUntil/fire-and-forget reliability claim, paid API call or fabricated result exists.
6. Credential chat reports OPENAI_API_KEY is a secret in runtime config revision 3; live version 3 uses config revision 1. No value was read here. A later reviewed **new-source publication** must apply current config without overwriting the secret. It requires the then-applicable fresh source-write credential approval; none was requested/created in this implementation turn.
7. Existing dependency audit findings remain 6 high and 4 moderate in inherited build tools. The artifact reachability mitigation passed; findings were not suppressed or represented as patched. See DEPENDENCY_REACHABILITY.md.

## Additive migration plan

Local migration ledger now upgrades an existing database without reset. Existing rows are preserved; no data imports or destructive resets are part of this revision. Hosted Drizzle append-only migrations 0002–0007 add shared projects, engagement, assignments, profiles, roles, content, guards and explicit gender confirmation. Local D1 parity/constraint tests pass. Hosted migration application and live review have not occurred. Legacy submissions lacking mandatory media remain private until reconciled by their team; eligibility and new media are never fabricated.
