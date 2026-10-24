# Dashboard performance source audit

The source comparison is baseline `696b125f9711a4fd6e02c3ece3adadb18b83cba7` versus final `2657f26254ed323ca84a167a2f220f05f4ec7cbf`. No production source, permission gate, provider setting, or hosted data was changed. This audit started no browser or server. Production browser measurements remain a separate parent-owned gate.

## Findings

1. **No added Dashboard backend statement count or duplicate Next auth request was found.** A matched synthetic fixture with three team members, two committed versions, personal check-in, one credit category and a project executes **59 application SQL statements in both versions**. Both resolve `actor()` three times and `settings()` twice, with 53 direct statement executions and three two-statement batches. This is a count comparison, not a latency benchmark. Backend session authentication is excluded from those counts. Its production source is unchanged.

2. **The existing backend work is sequential and repeats some facts.** `lib/service.ts:2067` resolves the roster actor, `lib/experience.ts:827` resolves the workspace actor, and `lib/team-access.ts:34` resolves it again for submission access. Repeated actor upserts, roster/removal checks, person status and submission counts appear in both traces. `workspace()` also reads eligibility twice when producing its response. These are existing costs, not an explanation by themselves for the reported redesign regression. Avoid broad actor caching, particularly across commands or requests, because fresh revocation and atomic mutation checks are required.

3. **The one changed Dashboard credit query does more work without adding a query.** `lib/credit-stock.ts:103` adds the stock-availability `EXISTS` projection needed to distinguish waiting from exhausted, and assignment time. The baseline query only selected the allocation flag. This path runs for a personally checked-in user. A native PostgreSQL per-query measurement at representative stock size is needed before attributing TTFB growth to it. The trace fixture contains 21 inventory entries including its explicit synthetic voucher.

4. **The final root layout imports eight additional global stylesheets.** `app/layout.tsx:18` through `:25` adds 156,574 raw source bytes, bringing root CSS imports from 16 to 24. This is not compressed or transferred size; compiled production CSS and its request timing must establish the actual critical-path cost. Admin, profile and discovery presentation remains in the root CSS graph even on Dashboard. This is a new shared frontend cost and a stronger measurement target than altering permission checks.

5. **The extra 900-weight font has a specific new Dashboard trigger.** `app/public-home.css:1` already imported DM Sans 900 in the baseline. New TeamStudio headings request weight800 at `app/team-studio-experience.css:65` and `:416`, while installed font faces are 400,500,700,900. Selecting the900 face for800 is the likely source of the parent's observed extra font request. All four font faces use `font-display: swap`; a font request alone does not establish that it caused the reported FCP increase. The final browser trace should confirm the selected face and font/CSS completion times relative to FCP.

6. **The server/client privacy boundary remains intact.** `app/[[...path]]/page.tsx:30` makes one authorized `readBackendView` call for Dashboard and passes `initialView`. `lib/next-backend.ts:261` caches only within the React render, with upstream `no-store`; it does not create a persistent private Data Cache. `app/portal.tsx:5789` accepts `initialView` without an initial client reload. The existing focus/visibility handler can refresh after two seconds; measurement contexts should avoid focus changes during the navigation sample. Dashboard metadata makes no extra backend read. Protected cold documents await their authorized view in both versions; neither source has an App Router `loading.tsx` boundary.

7. **Hidden tabs still mount their content in both versions.** Team, Credits and Project panels use `hidden`, not conditional mounting, at current `app/portal.tsx:1805` onward. The shared client entry also eagerly imports most feature components. The credit stock table is an explicit lazy exception (`app/admin-credit-batches.tsx:256`). Additional markup/client code can affect parse, hydration and style work even where hidden; compare actual production HTML bytes, DOM count, main-thread tasks and route chunks before proposing a split. Project history itself fetches only after its dialog opens.

## Targeted production measurements

Use the same identity, fixture, backend, viewport and production compiler, with alternating baseline/final order and distinct cold and repeat samples. Record the document's response start and end, SSR backend call count/duration, CSS and font resource start/end/bytes, FCP, long tasks, DOM/HTML size, and route JavaScript. Keep the existing permission and production-local-fixture guards unchanged.

If final backend time grows with unchanged statement count, inspect measured SQL duration and response serialization/media hydration before changing the UI. If browser delay grows after response start, inspect critical CSS and main-thread parse/style/hydration work. Only a controlled production comparison can justify a targeted font-weight or CSS/chunk adjustment; this source audit does not recommend an unmeasured visual change or authentication relaxation.

## Reusable evidence

`scripts/audit-dashboard-query-work.mjs` runs both service versions against one newly created in-memory synthetic database with outbound fetch blocked. Its JSON records statement templates and counts, not bound values or private codes. `evidence/dashboard-performance-source/query-work.json` contains the trace; `source-structure.json` records hashes, raw CSS import sizes and the font findings.

The fixture is synthetic and uses SQLite. Counts exclude internal SQLite trigger statements, `changes()` bookkeeping, transaction SQL and backend session authentication. No native PostgreSQL network/connection latency, production TTFB/FCP, or live-user behavior is inferred from it.
