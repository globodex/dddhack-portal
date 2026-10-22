# DevDay Exchange v1 product plan

Event: 1 November 2026, Asia/Kolkata. Up to 160 participants. Independent community event; no OpenAI endorsement claim.

Participant flow: public landing → top-level ChatGPT sign-in → registered email match → private profile and consent → team creation/request/invite → leader idea → idea lock → membership freeze → approval/check-in → own credit vault → leader submission (3 committed versions) → project discovery/feedback → published results.

Staff flow: verified owner → registered-account review → admin/judge assignments → roster/credit CSV previews → approve/Luma confirmation → check-in desk → submissions and review queue → judge ratings → staging results → owner snapshot and reveal.

Routes: `/`, `/rules`, `/teams`, `/teams/:id`, `/projects`, `/projects/:id`, `/leaderboard`, `/winners`; `/dashboard`, `/dashboard/profile`, `/dashboard/team`, `/dashboard/credits`, `/dashboard/submission`; `/judge`, `/judge/:teamId`; `/admin`, `/admin/participants`, `/admin/teams`, `/admin/check-in`, `/admin/credits`, `/admin/submissions`, `/admin/astra`, `/admin/judging`, `/admin/votes`, `/admin/feedback`, `/admin/results`, `/admin/settings`, `/admin/permissions`, `/admin/audit`.

Design: one-viewport mint/ink landing with large editorial type, compact navigation, event metadata and falling interactive dots. Warm off-white workspaces with accessible cards, strong status text, mobile navigation, and precise IST timestamps. All details use dedicated routes. Overflow remains available at tiny heights and zoom. Original dot variants are labelled as original, never official.

Architecture: Vinext App Router and server API, D1-compatible SQL and batch operations, schema constraints/triggers, per-request server RBAC, append-only audit and immutable result snapshots. Local rehearsal uses explicitly isolated SQLite and fake identity fixtures. Browser storage is never the system of record.

Draft policy gates: submission cutoff null; diversity, vote normalization, AI fallback, tie breaks, engagement windows, feedback threshold and other unresolved policies unconfirmed. Live activation, scoring and publication fail closed until owner approvals. No demographic scoring.

Integration blockers: current Sites skill is readable, but installed Sites starter/plugin helpers and server auth helper source are unavailable in this environment. Do not claim the standalone Vinext build is a packaged Sites build. Hosting manifest is an integration draft requiring reconciliation with the current Sites starter before future deployment. Both design reference URLs return network access errors; no reference screenshots or verified official assets are available. No software-engineering skill is installed. No hosted resources, production identities, credits, external API calls or emails will be created.

Source: complete Library specification `libfile_bd214a1c69088191a4cfe3505bceb900` (81,047 bytes), read via Library in three windows, all 1,336 lines. Library signed download failed; text reconstruction retained outside source checkout.
