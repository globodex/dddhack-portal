# Submission controls and committed history

Implemented from `f54306b76c17f5dc5b101354c17142583b3efe09` in an isolated worktree. Integrate **3afbc0b** and **dd448de**. The local branch also contains **7144ede**, a cherry-pick of the coordinator's shared confirmation commit **55e13a2**; do not apply that shared change twice. Both stylesheet imports must remain in `app/layout.tsx`.

Final captures ran against `dd448de` with the shared compact confirmation present. The fixture was freshly seeded, not copied from another SQLite database: frontend `localhost:3013`, backend `127.0.0.1:8858`, database `/tmp/ddd-submission-consent-8858.sqlite`. Browser mutation requests were blocked. No live data, authentication code, or credentials were changed.

The accuracy checkbox is a native 44 × 44 px control in a full-width row below both media columns. The whole row toggles it. Submit uses green `#08783e`, with white-text contrast **5.58:1**, explicit keyboard focus, disabled styling, and a submitting label. Media limits and preview handling are unchanged.

The final-step decoration is outside the form and actions. It reuses `DotAvatar`, has no pointer hit surface, clips only its own region, renders four static dots on compact screens, and runs no idle animation. Fine-pointer movement repels the dots; they settle afterward. Offscreen and reduced-motion checks pass. Headless Chromium reports all tabs visible, so the `document.hidden`/`visibilitychange` pause check uses a controlled browser API event and is labeled that way in the report.

Project history uses existing attempt metadata for immediately visible closed native accordions. First expansion makes one cached GET for all saved snapshots. Each row has a submission number, IST timestamp, and a Current chip only when its ID matches `published_version_id`. Expanded media stays compact. The toolbar sits above the rows with read-only upvotes, feedback count from the same visible feedback collection, a real eligible public link, and one primary Update action under the existing gates. Feedback remains below. The Team header retains one colored initials badge and its edit control, without the extra eyebrow, color name, or swatch.

Validation:

- `npm run typecheck`: passed on the final branch.
- `tests/combined-flow-v7.test.ts`, `tests/project-form-privacy.test.ts`, `tests/submission-tool-controls.test.ts`: **16 passed**. Covers draft attempts, idempotent commits, immutable history, third-attempt lock, media/form privacy and tool controls.
- `tests/concise-confirmations.test.ts`: **3 passed** against the shared confirmation change.
- `tests/dashboard-v6.test.ts`, `tests/latest-permissions.test.ts`, `tests/participant-ui.test.ts`: **27 passed, 1 obsolete shared-copy assertion failed**. The remaining assertion expects “Imports cannot restore” from the coordinator's intentionally shortened participant-removal confirmation. The coordinator was notified; it is outside this lane's shared-confirmation ownership. The dashboard and permission assertions pass, including a Current chip on version 2 when version 3 also exists.
- `QA_PHASE=after node scripts/qa-submission-consent-row.mjs`: **7 checks, 13 captures, 0 browser errors, 0 writes**. Actual 1440 × 900, 390 × 844 and 320 × 480 views cover row geometry, focus, keyboard, full-row clicks, validation, cancellation without attempt use, button contrast and motion behavior.
- `node scripts/qa-submission-history.mjs`: **6 checks, 12 captures, 0 browser errors, 0 writes**. Covers saved version contents, cached lazy loading, keyboard/touch, compact media, responsive toolbar placement, clean Team identity, third-attempt lock, teammate read-only history, and a controlled HTTP 503 with successful retry.

Start with `after/step3-1440x900.png`, `after/step3-320x480.png`, `after/confirmation-320x480.png`, `history/closed-390x844.png`, and `history/expanded-1440x900.png`. The before directory contains the actual original final step at all three requested sizes. Full-page captures can include the existing fixed navigation at its scrolled position; viewport captures show the actual control interaction state. Navigation integration belongs to the coordinator's separate lane.

No branch was pushed or deployed.
