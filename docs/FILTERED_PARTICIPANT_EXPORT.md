# Filtered participant export follow-up

Isolated branch `fix/filtered-participant-export`, worktree `.worktrees/participant-export`, based on published source `f1a4b3d`. The frozen core release/build was not changed and this follow-up is not deployed.

The Participants table and CSV now use one shared filter/order function: individual status, team lifecycle/lock state, individual name/email search, team-name search and active/removed/all records. Locked awaiting review follows the existing earliest lock order. The link is **Export filtered participants (N)** and requests all matches, not only a displayed slice. Server state is read afresh; if another admin edits a record after the table loaded, CSV count may legitimately change. `X-Total-Count` and `X-Exported-Count` describe the export request's actual selection.

Default UI remains Registered + Locked + active. The old bare export URL remains an explicit all-records export for backward compatibility. Explicit `scope=page&page=0&pageSize=50` uses the same stable order; page size1–250, zero-based pages and bounds are validated. All-matching mode never silently truncates to page size. Empty selections return the same column header without data. Unknown or duplicate filter values fail rather than broadening the result.

Search is only over the intended operational name/email/team-name fields, never serialized private/nested row content. CSV is a positive allowlist of id/name/email/status/team identity/name/status/lock metadata/check-in indication/submission count/removal state. It excludes phone, sex, organization/OpenAI IDs, private ideas/venue/reviews/scores and all credit values/ciphertext. Every cell uses existing spreadsheet-formula neutralization and CSV escaping. Authenticated owner/admin access is enforced at HTTP and service-list boundaries, and rechecked before export. Volunteers, judges, participants, Viewers and anonymous users cannot export participants. Audit records contain counts/scope only, not query strings or exported row values.

Regression coverage checks table/CSV parity across combinations, active/removal filters, search intersections, order/count/pagination/empty pages, positive field projection, formula safety, authenticated permission boundaries and safe audit/cache headers. No real participant export/import/removal or live settings operation was performed.

See OWNER_OPERATIONAL_SETUP.md for honest owner UI steps and the separate operational-confirmation UI gap.

Verification: full regression/local-D1 suite118/118 passed, including6 new export/security tests;23 focused export/admin checks passed; TypeScript passed. This follow-up remains separate and undeployed.
