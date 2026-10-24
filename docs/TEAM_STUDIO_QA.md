# TeamStudio design QA

Scope: selected TeamStudio Team tab, its existing identity/invitation/idea/lock controls, the unchanged Credits/Project tab gates and scoped common-shell integration. The repository-wide design-qa.md remains owned by the integration lane and is not overwritten by this scoped result.

Reference: exact selected Library libfile_f7d0d261d73c8191bb726a86f2f1a0df, native1487x1058, actually viewed before implementation. Source specdf271b7. Final normal/native render7d22631; final scoped dialog lifetime927845c. Native PNGs and request/state reports are in this directory and adjacent team-studio-verified/team-studio-scroll.

## Evidence review

The reference and actual1487x1058 screen were opened together;1440x1024/900,768,390,320, short390x480 and actual native200% were inspected as pixels. Independent Profile review repeated matching-state comparisons and actual read-only touch/keyboard behavior. Differences from the reference are intentional server-driven names/avatar colors/current team palette, accurate112counter, real member-only contacts/removal permissions and the local synthetic banner. No DOM image substitution is used for fidelity captures.

## Closed findings

- Editorial hierarchy was too small: idea title/body corrected to measured50/28 desktop scale.
- Genuine expression asset ink, Next-card region and CTA proportions corrected; CTA is78px desktop and responsive below900px.
- Progress markers now span the whole track; labels sit below it. Team checked-in count0/3 is separate from personal Going and from saved/locked/submitted state.
- Inherited identity form grid replaced by a centered preview and8 compact accessible color choices,4x2 at320/390, with reachable actions and fixed bounded outer geometry.
- Actual Saved/CTA contrast misses4.13:1/4.49:1 fixed to6.12:1/5.25:1. Sampled Team-region WCAG2A/AA scan has zero violations.
- Independent touch testing found backdrop scroll leakage. Final927845c effect locks both document/body only during StudioDialog lifetime, restores previous values, and preserves internal scrolling, StrictMode cleanup and nested-confirmation cancellation. Owner proof and independent13/13 read-only repetition pass with zero POSTs/page errors.

## Functional and technical checks

Actual disposable browser mutations: appearance200, approved independent invitation200, private idea200, lock200. Rejected unregistered invitation422 remains denied; no recipient/history workaround. Dirty idea suppresses Saved and locks the CTA until persisted.500character limit/counter and Cancel were exercised. Leader and member immutable/readonly roles were inspected, as were keyboard tabs and allowed contacts. All12 measured touch controls meet44x44 minimum.

Typecheck passed. Seventeen focused navigation, dashboard and participant tests passed. Production next build --webpack passed on final927845c, including production TypeScript and dynamic personal Credits route. Isolated worktree uses webpack because installed node_modules is a symlink; no project runtime setting was changed. No performance improvement is asserted without a new before/after measurement. No new dependency, animation loop or decorative request was introduced.

The native full-page CDP clip artifact is excluded; correct1440x757 native viewport screenshots cover header, idea, Next, progress and identity at CSS720/DPR2/visualViewport.scale1. Touch is emulated Chromium. Physical-device and real assistive-technology testing are not claimed. Broader integrated tests/build and final publication decisions remain the parent's responsibility; this result does not claim the entire portal is released.

final result: passed
