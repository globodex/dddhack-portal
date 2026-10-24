# Redesign coverage ledger

This is an evidence ledger for the feature branch, not a blanket completion claim. Local screenshots and browser interactions use disposable synthetic identities only. Main and the live site are not changed.

## Shared system and priority pages

| Surface | Owner | Implemented work | Evidence / remaining gate |
| --- | --- | --- | --- |
| Shell, mobile menus, feedback, dialogs | Integration | Warm paper/ink, compact contextual errors, success/error toast, black circular menu buttons, destination icons, red Logout, native dialog Back/focus support | Profile menu source ee7a159 captured; final combined cross-page menu check pending |
| Profile, all three steps | Profile | Normal document scrolling, balanced desktop columns, avatar first mobile, single selected preview color, eight swatches, accessible errors, Next/Next/Save | Six latest captures + menu in evidence/redesign-profile; keyboard12/touch12 checks, two persisted synthetic Saves, zero step3 Axe issues; short-screen focus refinement under verification |
| Team/create/detail/invitations | Team | Roster/idea grid, one settings group, invitation controls using existing API, preview-driven swatches, compact mobile create dialog with visible action | Twelve real synthetic browser groups passed, including create/join/remove/save/lock; root source 3c0441f capture underway |
| Discovery | Team | Compact public cards, actual paginated hook/search, safe public detail, empty/loading/error/retry states | Real 24+13 unique profiles and one cursor request verified in isolated fixture; shared rich screenshot fixture has13 complete profiles, not pagination evidence |
| Dashboard credits/project | Team | Separate Team/Credits/Project panels, personal recipient credit controls, published project/history | Rich root captures include checked-in credit and two-version project; read-only counts and member privacy preserved |

## Remaining page/card inventory

| Surface | Owner | Work and required evidence |
| --- | --- | --- |
| Admin Participants/import/status/export | Admin | Purposeful toolbar, All initial filters, result count, mobile identity/status rows, exact target confirmations; read/cancel62 captures and16 groups passed, positive writes being completed |
| Admin Teams/crown/private idea | Admin | Team list/member hierarchy; idea override gap found and being added using existing server contract; crown/override populated captures required |
| Admin submissions/review/eligibility/scoring | Admin | Distinct review hierarchy; remove unconditional ineligible evidence noise, preserve scoring and eligibility contracts; populated review and positive write evidence pending |
| Admin Credits | Admin | Populated batch editor and published provider cards require specific composition; work expanded after inventory rather than claiming generic token coverage |
| Settings | Admin | Event/Results/Access/Content panels, Agenda/FAQ/Rules editor subtabs, preserved mounted form state and confirmations | Native Escape/Back/focus passed4 viewports; final combined source capture pending |
| Owner Logs | Admin | Owner-only history, distinct actor/action/time hierarchy; populated synthetic screenshot required |
| Rules | Projects/Rules | One grouped essentials surface, exact approved categories and rule strings retained | Before/reference pixels opened; implementation and responsive QA underway |
| Project list/detail/leaderboard | Projects/Rules | Constrained public list and editorial detail; clear engagement controls and meaningful hidden/empty states | Preserve server reveal/sort policy and one-person/project vote; implementation and screenshot QA underway |
| Submission wizard/history/version/recovery | Projects/Rules | Three-step responsive field/media hierarchy, attempts and immutable history retained | No retired fields or server contract changes; behavior and screenshot QA pending |
| Landing hero | Landing | Approved mobile mock libfile_5c3333ebe2d881919233264ca1a2c7ea, existing Delhi/static Metro, lower thumb CTA and visible settled dots | Actual before geometry captured; implementation and motion-rest QA underway |
| Agenda/venue/rules/FAQ/organizers/footer | Landing | Readable timeline, appropriate grouped content, preserve approved text/time and original portrait cylinders | Every chapter/card to receive screenshot evidence; no invented event details |
| Sign-in | Landing | Branded form, actual Google logo, clear compact feedback and same shared menu treatment | Empty/error/loading before screenshots captured; UI work underway, no real Google/magic sends in tests |
| Sign-in email | Email | Responsive inline HTML, plaintext/fallback parity, same-browser and expiry, explicit sender preserved + plain default name | Synthetic placeholder preview and escaping tests pending; rebuilt backend ZIP required; no send |
| Metadata, sitemap, robots | SEO | APP_ORIGIN canonical, public SSR metadata, no private index leakage; Google official-doc check | Existing metadata audited before change; implementation lane pending profile closure |
| Privacy/Terms/contact | SEO | Factual draft: Parampreet Singh, hey@itsparam.in, unnecessary private data90 days post-event; category limits transparent | No automatic deletion claim or invented compliance. Public showcase and owner-log retention distinct. Draft review remains owner responsibility |

## Limits and publication

- Existing real Google login is not verified by local UI tests. User-managed custom hostname returned Cloudflare1010 to the parent's client; no security bypass or provider change was attempted.
- Library upload helper failed HTTP401 before preparation. Native PNG originals are preserved in committed repo evidence; no new Library IDs are invented.
- Browser uses the executor's container-compatible Chromium mode. Public reference captures ignored its certificate-store issue. Local browser contexts deny external requests and bound synthetic mutations.
- Development-server timing is diagnostic. Before/after measurements must use matching webpack mode, cold browser contexts and the same synthetic data. No hosted speed/capacity claim follows.
- Every new commit's author and committer are verified as Parampreet Singh <rubercuber.30@gmail.com>. Feature branches only. No main push, merge, deploy, provider setting or production data change.

