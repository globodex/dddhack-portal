# Eligible public project sharing and detail coverage

Local synthetic evidence only. Worktree `/workspace/ddd-public-project-sharing`, branch `feat/public-project-sharing`, based on integrated source `41bea03a79386a8208ac95afe5ea622a0581aa49`. No push, hosted change, reveal command or provider action was performed.

Source:

- `51166b7f982ec6ce04ca0bed9fc67df6b228f81f`: reuse the existing ProjectShare component for supplied public list/leaderboard entries and public detail headers; encode the real server slug. Controls sit outside the card link. The detail keeps its existing content and desktop columns, with the accepted paper/ink/team-wash styling, readable title, and identity before the banner on mobile.
- `68d6c1749983cf88250f2f064e36cc0a4d2344b8`: retain readable 14px leaderboard facts and 44px existing project-link/Share targets inside the new footer.

Both commits explicitly verified author AND committer as Parampreet Singh <rubercuber.30@gmail.com>. No edits to the shared header, ProjectShare component/helper, SEO policy, server eligibility, scoring, votes, comments, permissions or private project fields.

## Actual native pixels

Before detail/leaderboard were captured and viewed at 1440x900 and 390x844 before edits. `before/` is source 41bea.

Current detail/list images are in `after/`, source 51166:

- `1440x900-detail.png`, `390x844-detail.png`, `320x480-detail.png`
- `1440x900-list.png`, `390x844-list.png`, `320x480-list.png`
- `390x844-instagram-copy-feedback.png`

Use `settled/1440x900-share-settled.png`, `390x844-share-settled.png`, `320x480-share-settled.png` and `320x480-share-copy-reachable.png` for final Share pixels. The immediate modal frames in `after/` preceded image decoding; they are preserved, but the settled frames show the actual four decoded repository brand SVGs. The settled check records each natural size, visible 26px rendered size and decoded status. This was screenshot timing, not a component defect; no source workaround was added.

Use `leaderboard-final/1440x900-leaderboard.png`, `390x844-leaderboard.png` and `320x480-leaderboard.png` for final source 68d typography and touch targets. The earlier board frames remain historical. All selected current desktop/mobile/short/detail/modal/list/leaderboard pixels were opened and visually inspected. PNGs remain separate native files with dimensions and SHA256 in `png-manifest.json`.

## Verification and boundaries

- 26 focused tests PASS: embedding privacy, safe share routes/intents/approved caption, existing form privacy, public SSR/projection, eligible metadata, score disclosure/revocation and AI/final release boundaries. See `focused-tests.txt`.
- Typecheck PASS; `typecheck.txt` is empty because tsc exited0.
- 45 after browser checks PASS at 1440x900, 390x844 and 320x480, with 0 page exceptions. They cover 44px icon-only Share, one X plus Facebook/LinkedIn/Instagram, actual existing public URL, copy handler, honest Instagram copy fallback, focus containment/return, Escape/Back and no document overflow.
- 6 settled checks PASS: all four SVGs decode at every tested viewport; URL Copy remains reachable, including short mobile.
- Final leaderboard geometry confirms 14px facts, 44px project-link/Share height and no horizontal overflow at all three viewports.
- Actual HTML GET check selects the versioned public banner for `/projects/synthetic-alice`. A nonexistent project returns 404/noindex and no project OG image. Existing request-scoped eligible public metadata reader and `lib/seo.ts` were inspected and remain unchanged. See `metadata-route-check.json`.

The backend reads a new disposable SQLite copy `/tmp/ddd-public-project-share.sqlite` of this lane's earlier owned synthetic fixture. Its public stage is **community**, final countdown false, zero awards and zero published results. AI/final hidden/revealed browser screenshots were not available from this saved fixture and are NOT claimed. Existing real server tests verify those disclosure states, but are not visual evidence. No score-release commands were issued to manufacture screenshots.

All browser requests are restricted to GET/HEAD at the owned localhost origin. Device clipboard is stubbed to record the actual value; no real social posting or native share sheet was invoked. The Instagram copy fallback and feedback are verified. No new data request was added by the embedding, and no timing/speed claim is made from concurrent development capture. Integration full-suite/build remains with the parent.

Cleanup: owned Next 3009 PID 218924 and synthetic backend 8854 PID 218889 stopped; both PIDs and listeners verified absent. Every browser was closed. The synthetic database and evidence remain for review. No push.
