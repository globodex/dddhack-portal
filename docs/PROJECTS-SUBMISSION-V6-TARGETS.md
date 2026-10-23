# Projects and submission visual targets

Source checkpoint: `e0fbc27`. Isolated branch: `fix/v6-project-ui`.

The two original PNGs were opened directly before implementation:

- `design-research/2026-10-23/main-pages-v3/04-projects-list-detail.png`, Library `libfile_39b52e3ca2248191a1ea495d2e61cef3`.
- `design-research/2026-10-23/main-pages-v3/06-submission-three-step-wizard.png`, Library `libfile_6f25977ba4e8819193e89349b95eb934`.

`DELIVERY-INDEX.md` corrections override illustrative content and generated artifacts. No sample project, image, person, contact, vote count or provider content was copied into application data. Existing supplied brand/social SVGs, real project uploads and named Lucide controls are reused.

## Measured layout vocabulary

The Projects board uses a roughly 950px desktop browsing panel beside a narrow approximately 330px detail example. Its list rows are approximately 130px high, with a 72–80px logo slot, 22–24px project name, 16px summary and two 44–48px icon/count controls. The implementation preserves the required 1:1 project upload without imposing the sample's illustrative initial-circle logos. Public list banners are removed; the actual 16:9 upload remains on detail. Search is a single 54px tinted field, heading uses the original purple expression beside strong dark type. Detail uses the banner first, logo/name/by-team hierarchy, actual external links, paired interaction controls and an expression-based public comment composition. No private feedback is introduced into public comments.

The wizard board uses a centered three-segment blue progress indicator, count below, balanced 44px back/title/spacer row, a compact 40px heading expression on desktop and 32px on mobile, 14px labels, 44px fields and black 46px primary controls. Fields are constrained to 800px within the existing shell. On narrow screens controls remain full width and content can scroll without clipping the keyboard/focus/action area.

The functional steps are now:

1. Project name, one-line summary and description.
2. GitHub repository, optional deployment URL, the six agreed OpenAI ecosystem checkboxes and independent project-named Cerebras Yes/No.
3. Required1:1 logo and 16:9 banner, replace/remove upload actions, accuracy checkbox, Save draft and final Submit.

The generated tools catalog and its required marker were not copied. Selection remains optional and is a declaration, not a verified score. No SHA, contribution form, extra tool narrative, AI invocation or policy was added. Draft/navigation do not consume attempts. The root confirmation gate still owns the final submission dialog; step changes never invoke it. Existing server-granted leader/check-in/window/attempt capabilities remain the authority. After editing closes or attempts are exhausted, fields stay disabled and committed history remains available.

## Ownership and checks

Only Submission, public ProjectBody variant and Projects component sections changed in `app/portal.tsx`. The default ProjectBody variant for admin review is retained. New CSS is entirely scoped under `.projects-v6` or `.submission-v6` and imported once from layout. Shared shell/navigation, tokens, schema, backend and confirmation components remain integration-owned. Root was notified that the public Projects board uses top navigation and submission should retain Dashboard as the active item.

Seventeen focused rendering/permissions/tool/timezone regressions passed, including immutable history, read-only actor controls, one pending vote action, optional exact ecosystem choices and stable public timestamps. TypeScript and diff checks pass. No build, browser, mutation, external request or deployment was run from this worktree. The prepared browser runner requires the release owner's matching artifact signal.

## Visual QA status

**Pending matching compiled screenshots and interaction verification.** Source implementation and static checks do not establish pixel fidelity. Root must inspect desktop/tablet/mobile captures against these exact two boards, especially shared-header placement, native input/checkbox metrics, file-input focus, every wizard step, final confirmation cancellation, long text, narrow/short-height scrolling, vote states and comment permissions. Do not mark this visually accepted or release-ready from the mockups or source checks.
