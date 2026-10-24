# Projects, submission and Rules: rendered QA

Feature branch: `feat/projects-rules-experience`. This lane changes the existing Next.js UI in `SharedRules` through `Projects`; it does not change server permissions, event policy, scoring, production data, authentication or deployment settings. Profile, Team, Discover, admin and landing are owned by the other integration lanes and are not certified by this report.

## Source and design decisions

The before source is `e2d6149b7513e0a12644d59f69e2bc4c042ee532`. The accepted source boards actually opened and viewed were `04-projects-list-detail.png`, `06-submission-three-step-wizard.png` and `08-team-rules-owner-logs.png`, materialized by the parent in `/workspace/reference-evidence/accepted`. No inaccessible page is claimed as inspected here.

The final composition uses the centralized DM Sans typography and warm tokens: paper `#f8f7f3`, surface `#fffefa`, ink `#202320`, quiet border `#e3e4db`, green actions `#006b43`, and blue visible focus `#006aff`. Desktop headings are 36px, mobile headings 28px; normal content uses 14–15px with generous line height. Project rows use 64px desktop logos and 52px mobile logos, with distinct identity and engagement zones. Touch controls are at least 44px. Rules use numbered groups with restrained dividers, rather than repeated cards. Submission uses one focused form surface, 24px field gaps and normal document scrolling. Original supplied project logos and 16:9 banners are preserved. Existing expression assets provide restrained headings; this lane adds no animation library or decorative requests.

The latest explicit user direction takes precedence over the illustrative boards: all five authoritative Rules groups remain visible and every approved rule string is preserved exactly. The sample boards' abbreviated policy text is not substituted. Public project metadata only shows an authoritative supplied team name; it does not invent a caption when that name is absent.

Source-to-render review images are under `evidence/projects-rules-comparisons`. These are comparison sheets only; native originals remain unchanged. The source boards are multi-panel illustrations with unknown CSS viewport dimensions, so the normalized side-by-side images are not a pixel-perfect same-viewport claim. The project fixture uses deliberately plain green image files. These prove raster placement and aspect ratio, not fidelity to a real submitted project's artwork.

## Evidence map

| Evidence                                          | Source               | Coverage                                                                                                                                                                                                 |
| ------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evidence/projects-rules-before/index.json`       | `e2d6149`            | Reconciled hash index for 29 native before captures: Rules, Projects, detail, leaderboard and project panel at four sizes; wizard at desktop/mobile/short mobile.                                        |
| `evidence/projects-rules-after-first/report.json` | first implementation | Four-viewport rendered audit used to refine the result. Earlier shared menu treatment is superseded by selected captures.                                                                                |
| `evidence/projects-rules-selected/report.json`    | `c7f2336`            | Eight selected native viewport captures: Rules, Projects, detail, leaderboard at 1440×900 and 390×844.                                                                                                   |
| `evidence/projects-rules-verified/report.json`    | `2f63e9c`            | 13 passing browser checks, 30 captures, zero page errors. All three wizard steps, field error/focus, history Escape/Back/opener, clear search, submit cancellation and JavaScript-disabled form privacy. |
| `evidence/projects-rules-polish/report.json`      | `c7f2336`            | Four passing checks, eight captures: inactive empty-state pagination removed and compact history Close activation/focus restoration.                                                                     |
| `evidence/projects-rules-states/report.json`      | `d257e61`            | Eight passing state checks, 24 captures: search loading/error/manual retry; committed-history loading/loaded/error/empty. Exact source and measured geometry are in the receipt.                         |
| `evidence/projects-rules-positive/report.json`    | `2d051fd`            | Three actual permitted writes against the separate disposable local DB only: draft save, one vote, one public comment, all HTTP 200.                                                                     |

The four checked viewport sizes are 1440×900, 768×1024, 390×844 and 390×480. Mobile contexts emulate touch and use actual tap activation. Desktop controls use keyboard focus and Enter. This is headless Chromium with reduced motion, not a physical-device claim. The Next development overlay is hidden only in screenshots. The application content and layout are not altered for capture.

The before index records two capture corrections explicitly: an initial uncached navigation timeout, and a desktop Rules file accidentally overwritten during a repeat capture. The latter was recaptured from the exact immutable before commit in a separate baseline worktree, opened and verified. The reconciled index, not an earlier failed attempt report, is authoritative.

## Behavior and accessibility

- Rules: every authoritative category and every rule string is checked by rendered tests. At mobile widths all groups stay in ordinary document flow; there are no hidden policies or clipped accordion panels.
- Projects: contextual no-match state has a working Clear search action. Search failure remains actionable with an explicit Retry search. The state test observes one original GET and one manually requested retry, with no automatic extra requests. Two loading placeholders follow loaded row geometry; mobile logo/text columns and lower action position are asserted.
- Detail: supplied banner/logo URLs and descriptions remain intact. Vote buttons preserve one vote per person/project. Comments retain existing permission and confirmation behavior. A missing team name omits the caption. Timestamp contrast was corrected after the actual accessibility scan identified a borderline ratio.
- Submission: exactly three existing project steps and original required fields remain. Invalid fields expose `aria-invalid`, associated messages and focus on the first error. All six ecosystem choices remain. Save draft increments only the draft revision and consumes no committed attempt; committed history stays immutable. The third-step submit confirmation can be cancelled with Escape without a write.
- Privacy before hydration: server-rendered Submission and public-comment forms use `method="post"`, remain inert and disable controls until handlers are attached. A JavaScript-disabled browser receives the actual server-rendered Submission markup and proves an attempted native submit cannot issue a GET containing private sentinel values. Project search also waits for hydration before accepting input.
- History: the original authorized bounded GET remains. Escape, browser Back and Close dismiss the dialog and restore the opener without changing the dashboard route. The frame now measures exactly the same before and after records load at all four sizes: 0px height change and 0px y movement. On the 390×480 viewport it is 350×432 at x20/y24. Contents scroll within that stable frame.
- Axe: zero WCAG A/AA violations on the desktop project detail and short-mobile wizard step 3 in the recorded control matrix. This is scoped automated evidence, not an all-pages accessibility certification.

## Validation and limits

`npm run typecheck` passed after the final application logic and history-frame changes. The focused relevant suite passed 23/23 with zero skipped tests: project form privacy, grouped Rules, submission tools, project timestamps and admin integration. The final CSS-only placeholder alignment is additionally covered by the browser state geometry assertion.

All captures and reads use synthetic local fixtures. The three positive writes were directed only to `/tmp/ddd-projects-controls.sqlite` on port 8795. The shared reference backend remained read-only. No external requests or writes were allowed by the screenshot/control/state scripts. No credential, Google callback, provider, hosted origin, production DB or storage setting was changed.

No frontend speed improvement is claimed: this lane did not perform a comparable hosted production performance measurement. Production build, complete cross-lane test suite, privacy-role matrix, physical devices, real full Google login, award-reveal fixtures and end-to-end final committed submission are integration responsibilities still requiring evidence. A pre-existing Team text assertion expecting `12/500 characters` was reported to its owner; this lane did not change that unrelated component or assertion. Native Library upload was unavailable to the parent helper with HTTP 401; original PNG files are committed as accessible repository evidence instead.

Local outcome: the owned rendered surfaces and tested behavior pass the stated fixture checks. This does not label every page or the published site ready.
