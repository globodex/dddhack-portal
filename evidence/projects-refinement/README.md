# Public Projects presentation

The before PNGs at 1440x900 and 390x844 were captured and viewed before editing Projects. HEAD was018; only unrelated discovery CSS was then uncommitted. The Projects subtree still matched baseline f543. No claim is made that these are hosted after screenshots.

New source b6 removes search only for a true empty initial collection. A real collection with zero query matches keeps search and Clear search. Empty actions use actual actor capabilities: participant workspace, Viewer team directory, anonymous sign-in with the existing returnTo. No eligible entry is invented to fill a blank collection.

Saved project names, summaries, team identities, logos and team colors form the list cards. Existing detail/comment routes, capability-gated voting, scores, privacy and pagination remain. There are no new HTTP calls. Detail UI and sharing are outside this change.

- `empty/1440x900-projects.png`, `768x1024-projects.png`, `390x844-projects.png`, `320x480-projects.png`: true-empty fixture, source 1f;18 browser checks passed with 0 errors.
- `empty/390x844-home-hashtags.png`: requested two minimal Home footer hashtags, no hero or stack edits.
- `populated/*-projects.png`: two actual eligible synthetic fixture entries, source 1f. These are explicitly disposable fixtures, not actual event entries.
- `populated/390x844-search-loading.png`, `390x844-no-search-matches.png`, `390x844-search-error.png`: held GET, real zero-match query and injected503 with functional Retry.
- `../discovery-refinement/final-supplement/390x844-projects-aligned-footer.png`: final618 mobile alignment, supersedes the legacy66px footer inset in earlier mobile populated frames.
- `../discovery-refinement/final-supplement/320x480-project-first-touch-detail.png`: actual first-touch detail navigation using the corrected exact article assertion; keyboard navigation also passes.

The populated run completed 19 assertions, then stopped because a broad article locator matched both the detail and a comment article. Its raw failure and screenshot remain. Its console503 is the intentionally injected search failure, not an unexpected page exception. The small final supplement passed 7 assertions with 0 page errors, including that exact transition. The earlier empty-tablet run was stopped at an unbounded QA wait; a bounded run subsequently completed 18 checks. Reports retain these distinctions.

Public lists remain empty when server eligibility excludes pending/ineligible submissions. The screenshot fixtures were seeded only into `/tmp/ddd-discover-refinement.sqlite` behind an explicit local-mode/exact-path guard, after empty evidence was complete. No production data was inspected or changed.
