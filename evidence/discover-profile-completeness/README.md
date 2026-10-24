# Selected profile completeness

**Current approved role evidence is in `public-gender/`.** The user explicitly changed the initial self/admin gender decision to a saved gender chip visible to the existing signed-in profile audience. The earlier `after/` and `final/` images are historical and retain the earlier restriction.

Local-only worktree `/workspace/ddd-discover-profile-completeness`, branch `feat/discover-profile-completeness`, based on integrated root c1c4b3a. No push, hosted request, provider change, migration or new PII storage.

## Source provenance

- API `bed01517d6741cdb6942932eaa64465c5f432382`: selected-person authorization; the existing call-site passes its freshly read actor. Directory pages/search stay on their existing public allowlist.
- UI `64384172ff0f4ec4ef7972eedf38d8f8935069bd`: one existing person lookup per explicit open, followed by a complete modal. Shows authorized saved fields; no post-open data insertion or modal resizing. Errors are contextual and retryable.
- UI `92f167936cd0fe68344b85282881bc1ab262afcd`: reachable sticky 44px close in short modal scrolling, no duplicate fact/Team divider.
- API `5499601997f81993bc0a0ffac893d165908c176b`: user-approved saved gender value in selected-profile response for the existing authorized audience. No gender in paginated items or public-cache payloads.
- UI `420e69990eb9ed87661a15243e98cf93cc0b4e3c`: compact neutral saved-gender chip.
- Disclosure `2328410acb66f0e01750d7a894d4919ca6bd88c6`: privacy visibility paragraph names signed-in gender discovery and admin-only OpenAI organization IDs. No other promises changed.

Each source commit explicitly verified BOTH author and committer as Parampreet Singh <rubercuber.30@gmail.com>. Root integrates these onto its latest source. The parent reports the final production build includes the integrated source; this lane does not claim its local capture is a hosted deployment.

## Final visibility contract

| Field | Selected profile visibility |
| --- | --- |
| Saved name/avatar/team | Existing directory audience |
| Bio/socials | Existing public flag for other people; actual saved values for self/admin |
| Profession/organization | Self/admin, pending any broader consent decision |
| Saved gender chip | Existing signed-in profile audience, explicitly approved by user |
| Freeform gender description | Self/admin |
| Phone/WhatsApp | Actual current teammate/admin only |
| OpenAI organization ID | Admin only; key-shaped/non-org values are not projected |

No new fields are added to paginated cards. Anonymous direct helper calls receive no selected private facts; the actual endpoint retains authentication and its existing private/no-store response headers. A fresh service actor and current membership are read for each selected lookup. Role revocation, membership removal and participant removal apply on the next request. Only the modal owns selected extra values; no new shared/public cache or storage was introduced. Existing bio/social consent is preserved; the current profile form only preserves its saved public flag and has no editable public toggle. No checkbox was invented.

## Current native images

The 7 images in `public-gender/` were captured with profile UI source 420 and API source 549. Commit 232 changes the separate privacy route only; git diff confirms the profile UI and API files are identical between 420 and 232.

- `admin-bob-1440x900.png`, `admin-bob-390x844.png`: actual saved private bio/socials, profession, building-icon organization, public gender chip, restricted phone/WhatsApp and admin ID.
- `bob-bob-390x844.png`: self sees actual saved metadata and gender description, without admin-only organization ID.
- `carol-bob-390x844.png`: current teammate sees public gender and authorized contact, without private bio/profession/organization/description/ID.
- `stranger-bob-390x844.png`, `stranger-bob-320x480.png`: Viewer sees the saved gender chip and existing identity/team only. Private bio/socials and contact/admin fields remain absent.
- `stranger-alice-390x844.png`: Viewer retains consented bio/social icon plus the approved gender chip.

Every current role frame was opened and inspected as actual pixels. The short Viewer modal reaches its last section and keeps touch Close reachable. Native PNGs remain individual files with SHA256, dimensions, bytes and source in `png-manifest.json`.

`before/` captures baseline c1 UI at 1440/390 against the new bed API, before the UI consumed selected-person facts. The 390 baseline uses default Chromium pointer/scrollbar behavior; final mobile contexts use touch/mobile behavior. These are screenshot-first hierarchy evidence, not a claim of pixel-identical device emulation or a numerical performance comparison.

`after/` source 643 has 80 passing interaction checks; `final/` source 92 has 81 passing checks, including sticky touch Close. These older runs prove complete data before opening, stable geometry, org-ID copy feedback without outer modal resize, short-scroll access to the last team section, focus containment/return, Escape/Back, scroll lock with unchanged document width, and contextual 503 Retry. Their gender audience is superseded; use only `public-gender/` to assess final gender visibility.

## Checks and preserved failures

- Current public-gender role matrix: 48 checks PASS, 7 native images, 0 page exceptions. One selected lookup per explicit open; remaining metadata/contact/ID scopes, viewport bounds and focus return verified.
- 8 API/privacy/pagination tests PASS after the gender decision, including actual PostgreSQL/PGlite queries. They cover unchanged list payloads, authenticated roles, cross-team and Viewer denial of other facts, current-member revocation, role/removal freshness, public consent and key-shaped ID suppression.
- 17 focused privacy/UI/dialog tests PASS; 14 affected UI/disclosure/SEO tests PASS. Counts overlap and are not summed.
- Typecheck PASS after public-gender code. Earlier UI/dialog runs also passed; exact outputs are preserved.

The first test fixture omitted required role-grant columns, then attempted a roster deletion correctly blocked by the add-only invariant. The receipts remain as `api-tests-fixture-setup-failure.txt` and `api-tests-roster-fixture-failure.txt`. The fixture was corrected using existing grant columns and participant-removal semantics; no invariant was weakened or bypassed. An initial UI typecheck found nullable error state and was corrected before source 643; raw output remains in `typecheck-ui-initial-failure.txt`.

All browser traffic is restricted to GET/HEAD at the owned localhost origin. Copy uses a recorded device-clipboard stub; no actual calls, WhatsApp/social sends, OpenAI request or login send occurred. Fixtures use a new copy at `/tmp/ddd-discover-selected-profile.sqlite`; originals remain unchanged. No frontend speed claim from concurrent development-mode capture.

Cleanup: owned Next 3009 and backend 8854 were stopped after each capture phase. Final PIDs 234281 and 234253 and both listeners verified absent; all browsers closed. Full integrated tests/build and publication belong to the parent. No push.
