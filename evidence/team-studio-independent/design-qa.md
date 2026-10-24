# Independent TeamStudio design QA

**final result: passed**

This result covers the selected TeamStudio dashboard/team workspace and the bounded responsive/dialog checks below. All five confirmed P2s are closed by rendered evidence and the targeted interaction repeat. No application source was edited by this reviewer. All browsers are closed.

## Exact source and implementation

- Selected visual: [original1487×1058 PNG](selected-source.png), Library `libfile_f7d0d261d73c8191bb726a86f2f1a0df`, SHA256 `324ffc5d15ab19a0bd59e380f88c30fb3d21c5ddee186369971b0347414e2f3f`.
- First render: `9e6091e67148b17804845c602cb29406cc39184c`, captured by the implementing owner on isolated Next3003. [Original capture manifest](first/report.json).
- Visual correction: `c1ad8d3f945c431677101e7a8cf35323a6508b6a`. [Owner behavior/target-size report](after-c1ad8d3/report.json).
- Final visual/appearance/contrast source: `7d226314e4bc3140623d0d77074a66973ceb8329`. [Final screenshot/fixture/Axe/native metrics](final-7d22631/report.json).
- Final dialog interaction source: **`927845c5a3cf6755f94a219d8c9cf0060774fd58`**. This changes only the Studio dialog lifetime to lock/restore background overflow. [Independent13/13 read-only checks](read-only/report.json), [owner internal-scroll/restoration/native report](scroll-fix-927845c/report.json).

The visual and interaction source SHAs are deliberately distinguished. The final desktop gallery was captured at7d226; final320 interaction screenshots and corrected native lower frames were captured at927845. No assertion that all files were captured at one source is made.

## Closed findings and comparison history

| Finding                                                   | First actual evidence                                                                                                                                                                                                                                                                                                                        | Correction and after evidence                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P2 TS-01: idea hierarchy too small**                    | [Focused first idea/card comparison](first/focused-idea-next.png): idea heading/body underscaled, identical description wrapped later despite narrower actual column.                                                                                                                                                                        | Owner increased desktop editorial scale. [Final source/actual pair](final-7d22631/comparison-1487-normalized-local-banner.png) shows restored title/body hierarchy and description wrapping. Mobile rules remain separate and readable. **Closed.**                                                                                                                                                    |
| **P2 TS-02: Next mark/CTA/card too small**                | Same focused comparison: genuine expression ink about88px versus145px reference, CTA about64px versus78px, card390px versus roughly412px.                                                                                                                                                                                                    | Owner scaled the supplied expression and CTA/card proportions. The final combined frame shows the larger genuine mark and prominent full-width button. [Short390 Next](final-7d22631/next-short-390x480.png) and [native200 Next](scroll-fix-927845c/next-native200.png) remain reachable. **Closed.**                                                                                                 |
| **P2 TS-03: timeline markers/labels drift**               | [First focused timeline](first/focused-timeline.png): markers at0/25/50/75%, long trailing track, labels sitting on track and no visible forming accent.                                                                                                                                                                                     | Final paired frame shows full-width marker distribution, labels below track and current accent. [Final768 full](final-7d22631/team-768x1024-full.png) and [native200 progress](scroll-fix-927845c/progress-native200.png) show accurate0/3 team check-in without a false completed milestone. **Closed.**                                                                                              |
| **P2 TS-04: appearance modal inherited a cramped layout** | [Actual short390 before](after-c1ad8d3/identity-orange-preview-short-390x480.png): legacy form grid pushed compact picker into an awkward column.                                                                                                                                                                                            | [Final320 palette](final-7d22631/identity-palette-short-320x480.png), [390 palette](final-7d22631/identity-palette-short-390x480.png) and [native200 appearance](final-7d22631/identity-native200.png) viewed. Eight accessible44px-or-larger controls,4×2 at320, preview and reachable Save after body scroll. **Closed.**                                                                            |
| **P2 TS-05: backdrop touch scroll moved background page** | Independently reproduced on7d226 at320×480: touch-open identity, drag actual backdrop x4/y420→180; page scrollY0→951 while modal stayed fixed. [Exact failed report](read-only-before-scroll-lock/report.json), [before](read-only-before-scroll-lock/02-identity-320-short.png), [after](read-only-before-scroll-lock/FAIL-current-ui.png). | Owner scoped body/html overflow locking to Studio dialog lifetimes. Exact927 repeat confirms0→0 under the same gesture, unchanged background x16/width288, Escape/Back route and focus restoration. [Independent final report](read-only/report.json). Owner additionally verified internal scroll0→170 and exact prior overflow/scroll restoration, including nested confirmation Cancel. **Closed.** |

All source and implementation images used above were opened. Full-view source/actual images were inspected together, then important regions were examined at readable scale. This review did not infer the findings from code alone.

## Full and focused visual evidence

- [First native1487 source/actual](first/comparison-1487x1058.png) and [first proportional1440×1024](first/comparison-1440x1024.png).
- [Final raw1487 source/actual](final-7d22631/comparison-1487x1058.png) and [final1440×1024](final-7d22631/comparison-1440x1024.png).
- [Final comparison with only the local banner removed](final-7d22631/comparison-1487-normalized-local-banner.png). This is an explicitly labeled comparison derivative, not an app capture. It removes the44px local rehearsal banner at y88–132 from actual full-page pixels, preserving the rest of the original content pixels and revealing the real lower timeline. The CDP full-page capture is1472px wide (scrollbar excluded); this comparison-only canvas pads the15px right scrollbar area with white to match the1487px reference frame. [Unmodified full screenshot](final-7d22631/team-1487x1058-full.png) remains available.
- First focused [hero](first/focused-hero.png), [members](first/focused-members.png), [idea/Next](first/focused-idea-next.png), [timeline](first/focused-timeline.png). Region alignment and original full frames are preserved.

The selected image is1487×1058 at1x. Actual desktop images use the same CSS viewport and1x density. Native vertical scrollbar occupies15px, so actual available content width is1472; both source and implementation retain about44px side gutters within available width. At1440, the source comparison is scaled to1440×1025 and bottom1px cropped; actual remains1440×1024. CDP full-page images use content width rather than viewport width:1472px at desktop1487,753px at tablet768,375px at mobile390 and305px at mobile320. Normal viewport screenshots preserve the full declared viewport. Every original/derived PNG dimension is recorded in [the image manifest](image-dimensions.json). The32px comparison labels sit outside app pixels. The local rehearsal banner adds44px before tabs/hero and is classified as a fixture artifact, not a production spacing regression. No app CSS was injected to remove it.

## Five required fidelity surfaces

- **Typography:** the large team title, revised idea heading/body and prominent next-action heading now preserve the selected hierarchy and wrapping. Exact source font family cannot be identified reliably from pixels; the actual installed app typefaces render consistently without an observed fallback/font-loading mismatch. Member labels are slightly denser than the mock, a non-blocking P3. No speculative font replacement was made.
- **Spacing/layout:**150px initials, horizontal desktop members, warm open canvas and60/40 idea/Next split remain. The timeline correction is visible. Desktop gaps differ slightly after the real contact/remove controls and local banner are accounted for, without changing the major composition. Mobile320/390 and tablet768 use normal scrolling and readable stacked regions. No control is clipped in the inspected frames.
- **Colors/tokens:** warm paper, ink, restrained separators and pale-green next-action surface are coherent. Actual Orange team state is the existing selected palette, not the peach artwork swatch; root explicitly accepted dynamic team color as intentional. The human color name replaces the reference's hex string. No new decorative artwork or dependency was introduced for this lane.
- **Images/assets:** actual brand and social imagery stay sharp; the genuine expression was scaled rather than replaced with a drawn approximation. Existing fixture members share blue/squeezed avatars; this is data, not evidence that persisted choices are lost. Missing GitHub handles correctly produce no fabricated links. WhatsApp/phone/remove controls shown to current members/leaders are authorized domain features absent from the static mock.
- **Copy/content/state:**3/5 and112/500 come from actual data; the mock's109 is not copied. Dirty idea hides Saved and disables lock, Cancel restores112 without saving. Lock state changes the icon/detail and removes editing controls. Team check-in remains0/3 while personal Going is distinct; no check-in or submission milestone is invented. No prompt text leaked into the product.

## Responsive and interaction evidence

Viewed final [768 full](final-7d22631/team-768x1024-full.png), [390 full](final-7d22631/team-390x844-full.png), [320 short full page](final-7d22631/team-320x480-full.png), [390×480 idea](final-7d22631/idea-short-390x480.png) and [390×480 Next](final-7d22631/next-short-390x480.png). First1440×900 and final1487/1440 target frames were also inspected. The final gallery captures the resting state after dismissing the prior success toast; the earlier gallery keeps real invite/save/lock feedback as behavior evidence.

Native Chrome200% was obtained through Chrome's actual default zoom setting, with outerWidth1440, innerWidth720, DPR2 and visualViewport.scale1. Correct physical1440×757 no-clip viewport screenshots were viewed: [team top](final-7d22631/team-native200-1440.png), [idea](scroll-fix-927845c/idea-native200.png), [Next](scroll-fix-927845c/next-native200.png), [progress](scroll-fix-927845c/progress-native200.png), [appearance](final-7d22631/identity-native200.png). The owner's earlier explicitly clipped native-full artifact is excluded and is not delivered as accepted evidence.

The reviewer independently ran13/13 checks on the actual app at320×480 using Chromium touch emulation, **not a physical device**:

- Real local unlocked leader payload and no horizontal overflow.
- Touch-open identity with unchanged underlying horizontal geometry.
- Backdrop touch drag leaves background scroll fixed.
- Identity Escape and browser Back restore opener focus and dashboard route.
- Invite Escape restores actual opener focus.
- Client-only dirty idea hides Saved/disables lock; Cancel restores persisted112/count.
- Lower Next/timeline remain inside320.
- Keyboard ArrowRight/ArrowLeft switch Team/Credits and return.
- Twelve visible controls measured44px minimum in both dimensions.
- No domain POST, external request or page error occurred.

[Final independent320 top](read-only/01-team-320-short.png), [identity](read-only/02-identity-320-short.png), [invite](read-only/03-invite-320-short.png), [Next](read-only/04-next-320-short.png).

The implementing owner's separately reviewed report records actual synthetic invitation200, idea-save200, lock200, immutable locked leader view and Carol's current-member read-only view with authorized contacts. Corresponding [dirty editor](after-c1ad8d3/idea-dirty-mobile-390x844.png), [lock confirmation](after-c1ad8d3/lock-confirmation-short-390x480.png), [locked leader](after-c1ad8d3/leader-locked-1440x900-full.png) and [locked member](after-c1ad8d3/member-locked-mobile-390x844-full.png) were opened by this reviewer. These are owner-performed mutation checks, not falsely described as independent writes. The final owner Axe report contains zero violations; the independent lane did not rerun Axe or the app build.

## Harness correction and remaining limits

The first927 interaction repeat passed Playwright `toBeFocused()` for Invite, then a bookkeeping helper incorrectly demanded an aria-label on its text-named button. [That attempt](read-only-focus-harness-attempt/report.json) and [visible focused trigger](read-only-focus-harness-attempt/FAIL-current-ui.png) are preserved and classified as a harness error, not a second app defect. The corrected helper checks actual node identity; the complete13-check repeat passes.

No production or shared-root fixture data was mutated here. The only independent form changes were client-local dirty text followed by Cancel. Team-owner mutations used a separate disposable synthetic backend. This lane does not claim physical-device/IME coverage, native PostgreSQL deployment proof, hosted performance improvement or a new whole-portal readiness result. Very long names/URLs were not newly stress-tested in this bounded repeat; the actual500-character idea editor/counter was verified in the owner's final checks. Existing server permission and role tests remain separately owned.

## Follow-up polish and checklist

- Shared desktop brand-mark sizing is P3 and deliberately deferred under the parent's scope freeze. The approved existing asset remains.
- Original five P2s: closed with before/after evidence.
- Primary responsive/zoom/dialog and read-only controls in this lane: complete.
- Application source files edited by this reviewer: none; only QA scripts, reports and original evidence files.

**final result: passed**
