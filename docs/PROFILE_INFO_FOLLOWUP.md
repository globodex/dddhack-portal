# Isolated participant profile-info follow-up

Base: `b9850d06`. This local follow-up is excluded from the frozen current release. It adds no roster-removal command, migration, auth/provider configuration or production data change.

## Profile-info behavior

Admin participant account rows and team-member rows have labeled info controls. Admin submission detail shows current members with the existing personal-status computation and info controls. Public project detail receives only allowlisted member IDs, names and saved avatar choices; anonymous readers get a sign-in link. Empty member collections and idless roster rows omit controls cleanly.

One provider owns the selected native `DiscoveryProfile` dialog. Clicking requests the existing authenticated `/discover/participants?person=...` projection once with `limit=1`, no-store and same-origin credentials. Private details are never preloaded into these row/public project payloads. Closing, changing targets, changing accounts or refreshing the access snapshot aborts the pending request and discards stale responses. Loading, retry and sign-in states remain in a fixed dialog frame. Existing Escape/focus/Back behavior is reused; outside dismissal and paired body/html scroll restoration are included.

The selected endpoint still rereads the authenticated actor and membership. Owner/admin may inspect existing incomplete or recoverably removed accounts through the explicit selected lookup; directory cards remain unchanged. Public selected gender stays within the existing signed-in audience. OpenAI organization ID remains admin-only. Phone/WhatsApp remain admin/current-participating-teammate only. Raw email, status and private profile details are not added to anonymous public member payloads. Assigned judges do not receive the new administrative member-status array.

## Verification at the source checkpoint

- 28 focused SQLite/component tests passed, including 11 new follow-up cases; typecheck passed.
- A strengthened cross-privacy run passed17 cases. Contrary to its intended selection filter, it executed one existing PostgreSQL/PGlite test for5.7seconds; the fixture closed. That selection error was reported immediately. No additional PostgreSQL process was started.
- Meaningful cases cover anonymous full-response privacy, member-status audience, incomplete administrative accounts, role/member revocation, public gender, soft/terminal selection boundaries, idless/anonymous controls, all four insertion surfaces, optional facts, a single request per read, stale-response cancellation and actionable authorization errors.
- Browser proof at source `c322c6d697ed916594755c9093832696e025553b`:10 grouped checks passed,19 native screenshots saved outside Git at `/tmp/ddd-profile-info-evidence`,0 page errors. Actual desktop1440, mobile390 and anonymous320×480 frames cover all four requested surfaces. Tests verified one selected GET per open,44px touch targets, fixed loading/loaded dialog bbox, Escape/Back/outside dismissal with focus return, background touch lock/internal scroll,503Retry,401sign-in and an actual account-cookie switch with existing focus-refresh cancellation.
- Native desktop admin and mobile/short admin dialog, scrolled contact/org facts, Viewer profile, anonymous320 member block and admin member-status rows were viewed. One initial top-of-page Review screenshot does not show its below-fold members; explicit1440/390 member-block captures close that evidence gap and the report labels the initial frame limitation.
- Browser requests were restricted to loopback GET/HEAD. This uses a new disposable SQLite fixture, no shared/recovered/hosted data. Chromium touch emulation is not a physical-device or real OAuth claim. New project-member SQL still needs the later PostgreSQL integration gate before this follow-up is published; no production build/full suite is claimed for this isolated follow-up.
- Both owned browser jobs closed. Next3012 and backend8852 were stopped; listeners verified absent. Generated next-env development paths were restored. No screenshot is tracked in Git.

## Reversible roster removal: read-only findings, implementation held

The parent approved reversible removal for both never-signed-in roster emails and existing participants, preserving account/history and requiring explicit admin restoration. No removal implementation is included here while the current release publishes and derived-state details are coordinated.

Existing `participant-deactivate` stores a recoverable user-ID `record_removals` entry. It preserves memberships, occupied slots, team/idea/submission/credit records and approval state, and blocks removal of an active team leader until a successor is explicitly transferred. Owner/staff/self are protected. Existing restore clears the user-ID tombstone. Sessions/login do not remove it; roster import skips known removed accounts. Never-signed-in emails lack a user ID, so existing controls cannot remove them.

`record_removals.target_id` has no target-user foreign key, but its kind enum excludes a new email kind. A namespaced `roster-email:<normalized-email>` participant tombstone could avoid a schema migration. Legacy trusted Sites identities accept arbitrary ID strings, so the source does not globally guarantee absence of reserved-prefix collisions. A safe implementation must reject collisions without changing auth identities, normalize emails centrally, never accept arbitrary target kinds, read both user-ID and email tombstones across every participation/projection/import path, and clear both only through explicit authorized restoration. No namespace reservation or identity-policy change is implemented here.

A separate derived-state concern was reported before editing: `teamFacts` currently counts retained memberships and approved registrations without a participant-removal predicate. A removed Going member can therefore leave `allApproved=true`, while attendance is revoked. Preserving occupied slots/history but excluding inactive members from computed active readiness is a proposed correction, pending parent coordination; this follow-up does not silently rewrite approvals or change that derivation. An admin member display may also need an explicit Removed label instead of implying that the retained prior status means active participation.

No permanent deletion, cascade, credit retirement, role change, team deletion, leader auto-selection or automatic re-enrollment is proposed by the reversible-removal request.
