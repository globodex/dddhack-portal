# Projects, Rules and submission redesign

Source before: e2d6149b7513e0a12644d59f69e2bc4c042ee532. Existing production Next.js components, disposable local fixtures only.

## Grounding

Inspected the actual accepted boards 04-projects-list-detail.png, 06-submission-three-step-wizard.png and 08-team-rules-owner-logs.png from confirmed Library IDs. Current browser before captures include Rules, public Projects/detail/leaderboard, Dashboard project panel, and all three submission steps at desktop and mobile. First uncached webpack navigation timed out before capture and was retried; it is not accepted evidence.

## Concrete changes

- Rules expose the same authoritative five groups and exact strings in an editorial essentials grid. No policy, category, date, scoring or eligibility text is rewritten.
- Project listings use compact editorial rows, clear metadata/action zones and contextual empty/search/error states. Existing server pagination and order remain authoritative.
- Desktop project detail gives the project identity/summary and banner balanced columns; mobile keeps the original 16:9 cover before the project identity. The supplied raster is preserved.
- Submission retains all three steps and every requirement, with focused field errors and one contained editing surface. Radio/checkbox controls retain their semantics.
- Committed history retains its existing authorized GET and at most three immutable versions; loading has matching version geometry. Native Escape, browser Back and opener focus are paired.

## Verification

The implementation is not considered visually complete until the actual four-viewport after captures, source comparison, keyboard/touch/error/loading checks and relevant tests are recorded. Production sign-in, hosted performance and physical devices are outside this local fixture evidence.

