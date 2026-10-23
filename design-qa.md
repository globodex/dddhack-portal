# Design QA — portal revision v3

final result: blocked

Reference: ../design-research/2026-10-23/revision-v3/LATEST-UX.md and UX-STUDIES.md; desktop option 1 / mobile option 2 with later voice corrections. Reviewed the selected desktop/mobile home, dashboard, project list/detail, teams and admin mockup pixels before implementation.

Implemented: upright sans title, green New Delhi, four compact host badges, original face-free decorative shapes, stacked content, accessible agenda alternatives, project rows, team avatar/accent picker, private participant/admin shells. Rejected realistic art and unapproved landmark artwork are absent.

Completed checks: TypeScript; 41 server/D1/static-render/controller tests; local production build and artifact gate; compiled Worker HTTP smoke. Static checks cover 16 distinct SVG presets, palette contrast, title/host/venue text and motion safeguards.

Blocker: the local CUA inventory exposes no apps or browsers. No supported rendered-page capture or interactive viewport comparison can run here. Desktop/mobile layout, clipping, interaction focus, touch behavior, motion cadence and accessibility therefore remain unverified in a browser. Earlier screenshots/axe evidence must not be reused as proof of this new UI. No visual acceptance or faithful-image-match completion is claimed.

Next: connect a supported browser surface to this local task, inspect desktop/mobile/reduced-motion states with synthetic data, compare against the selected mockups, fix deviations, and obtain user feedback before release. Pending artwork/photo/policy/API decisions are listed in docs/UX_REVISION_V3.md.

Latest controls: native Cancel-first modal confirmations, managed sign-out, manual award unveiling and owner deadline/weight previews are implemented. Interactive keyboard/focus/session/device checks remain unverified. User explicitly deferred device QA until after the reviewed core publication.

## 23 October approved home/profile implementation checkpoint

The newer ux-restart home/profile studies and Delhi v3 pack supersede the historical face-free/plain-wordmark direction above. Their local implementation includes typographic decorative marks, the actual masked fill with static Metro, public top navigation, organizer section, scroll cue, two-step minimal profile and optional safely normalized photo. Remaining page mockups are not treated as approved. Static/controller/server/Worker tests pass; see docs/OPERATIONAL_RELEASE_2026_10_23.md and current release evidence. The final visual result remains blocked for acceptance: no supported local browser surface exists. Asset-only upstream cloud proof is not proof of the integrated site. No screenshot-match, touch, real sign-in/logout or device acceptance is claimed.

Latest voice correction supersedes participant photos/initials and 16 geometric team shapes: personal symbolic dot expressions, team initials-only circles, exactly three profile steps and same-team phone contacts are implemented locally. Five reference-confirmed non-grey colors are enabled; three additional colors, exact profile-description choices and full CSV mapping remain pending. Supported browser recheck returned apps:[] / browsers:[]. No visual acceptance is claimed; see docs/LATE_PROFILE_ROSTER_2026_10_23.md.
