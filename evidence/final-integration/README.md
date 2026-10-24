# Integrated portal screenshot review

Runtime source344334b220472641a07f1832485a6a387f9b8915, actual production Next.js app with a disposable synthetic backend. Four viewports:1440×900,768×1024,390×844 and390×480. Touch is emulated on390-wide contexts. Every request is restricted to the local origin and read-only methods. No mutation, external request, production account or deployment is involved.

The initial56 native PNGs cover11 routes at all four viewports plus Settings Results/Access/Content panels. Review includes participant/admin identity rows, team cards, private scoring, credit upload/inventory, settings, owner-only logs, grouped Rules, public projects/detail and leaderboard. Page-owned evidence covers deeper state/permission/control interactions.

Two findings were corrected after actual rendered inspection:

1. A legacy `:has(...) details.panel` selector overrode the intended admin disclosure height. The final scoped selector now wins without `!important`; native summary is at least52px high and text/actions align20px inside the card.
2. Rules ordinal text had4:1 contrast. It now uses the readable muted ink token color and the new scan reports zero contrast violations.

Final correction sourcef62d345238d28276b9a51785d1e0d1e571c12d76. See `../final-integration-corrections/report.json`:12 fresh native PNGs,12 passing route/geometry checks, no errors. Use those submissions/rules files instead of this directory's superseded versions. All other application runtime files are unchanged between these sources.

Selected final originals:

- `participants-390x844.png`, `teams-1440x900.png`, `review-390x844.png`
- `credits-390x844.png`, `settings-content-390x844.png`, `logs-390x844.png`
- `projects-390x844.png`, `project-1440x900.png`, `leaderboard-390x844.png`
- `../final-integration-corrections/submissions-expanded-1440x900.png`
- `../final-integration-corrections/submissions-expanded-390x844.png`
- `../final-integration-corrections/rules-390x844.png`

The actual selected PNGs were opened and inspected. The original report deliberately retains four failed sizing assertions and the earlier Rules contrast finding; they are not unhandled application exceptions. Four initial sampled route accessibility scans and the corrected Rules scan have zero violations. This is sampled WCAG testing, not a compliance guarantee.

The local fixture badge and solid green project media are synthetic test data, not proposed new branding or real participant content. The Next development overlay is hidden in captures. PNGs use native browser viewport pixels, scale1, caret:'initial', reduced motion and hydrated application state. They do not establish hosted speed, real-login success or physical-device behavior.
