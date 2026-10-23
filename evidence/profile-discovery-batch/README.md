# Profile, Discovery and Rules screenshot batch

Captured 23 October 2026 from the compiled local synthetic preview at `http://127.0.0.1:4173`.

- Source: `0e7756c60e2fff88a4f7fb1e3eca31efc20349d0`.
- Worker SHA-256: `75a667d2c42a821611c3cbbea72447ee464e2ad5f2f6165fbbba647764e69ce6`.
- Official Playwright 1.64.1, Chromium 156.0.8078.4, Chromium sandbox enabled.
- Desktop viewport 1440×900 and mobile viewport 390×844. Full-page images can exceed viewport height; native modal images use viewport captures.
- 20 original screenshots individually opened and inspected; all 20 saved to Library with confirmed per-file success and locally verified identity/version metadata. Exact local paths and Library identifiers are in `library-ledger.json`. PNG files remain local, outside Git.
- Profile batch: 8 images, 10 passing checks. All three steps, selected avatar and open native social platform chooser at each width. No Save action.
- Discovery batch: 12 images, 14 passing checks. Participant/Viewer people and teams, other-person Alice dialog and Rules at each width.
- No application writes, external-origin requests, browser page errors, or private production data. Requests restricted to local GET/HEAD. All browser contexts and processes were closed.

## Native dialog evidence

Alice's dialog shows only avatar, name, bio and safe consented social links. Close and Escape both remove the dialog and restore focus to its opener at both widths. Tab sequence is Close → GitHub → Website → browser chrome (document activeElement BODY) → Close. The dialog remains `:modal`; no background interactive control receives focus. Initial overly strict assertion counted browser chrome as a focus escape; an isolated diagnostic identified the native behavior and the final assertion verifies no background-control escape. No application workaround was added.

## Remaining findings from actual pixels

These screenshots document the current state, not whole-site design acceptance:

1. Viewer Stranger's desktop sidebar labels the role “participant,” although participation actions and own-profile control are absent.
2. Participant directory rows are considerably taller/looser than the compact approved board 04, with large green underlined name links.
3. The one-member team reads “1 members.”
4. Rules still says to supply a full submitted commit SHA and that at least one checked-in team member is needed to access submissions. Reconcile with the no-manual-SHA wizard and personally checked-in leader requirement.
5. Synthetic fixture Rules show a submission close date before the open date. This is local fixture content and is not evidence of production settings.

No application files changed during capture. Browser UI zoom and narrow 320px layout were not tested in this batch. Earlier profile-only evidence is separate.
