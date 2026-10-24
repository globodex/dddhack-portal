# Independent TeamStudio design QA

Source visual truth: [original selected image](selected-source.png), Library `libfile_f7d0d261d73c8191bb726a86f2f1a0df`, native **1487×1058**, SHA256 `324ffc5d15ab19a0bd59e380f88c30fb3d21c5ddee186369971b0347414e2f3f`.

Implementation iteration1: `9e6091e67148b17804845c602cb29406cc39184c`, actual Chromium screenshots supplied by the implementing agent from isolated Next3003 and synthetic `/tmp/ddd-team-studio.sqlite`. The implementing agent's [capture manifest](first/report.json) records closed browser, no page errors, viewport and element geometry. This independent pass opened the source and every supplied original screenshot, and inspected source/actual together in combined full-view and focused images. No application source edits, database writes or browser sessions were performed by this reviewer.

## Findings

- **[P2 TS-01] Private-idea typography loses the selected editorial hierarchy.** At1487 the target title is about50px and description28px; the actual title is about44px and body24px. In the actual narrower idea column, identical description text still fits through “Find” on its first line; the target wraps after “small”. This is visible in [the aligned idea/card comparison](first/focused-idea-next.png), not an inference from code. Increase the desktop idea title/body optical scale and preserve the selected line height and title-to-divider rhythm. Keep smaller mobile rules separate.
- **[P2 TS-02] Next-action mark and CTA are materially smaller than the target.** The genuine expression's visible ink is roughly88px wide in the first render versus145px in the source. The button is approximately64px high versus78px, and the rendered card is390px high versus about412px. The [same comparison](first/focused-idea-next.png) shows the card has a small mark above comparatively large empty padding. Scale the actual supplied expression asset, then align card/button dimensions and internal spacing. Do not draw a replacement mark or add decoration.
- **[P2 TS-03] Timeline spacing and label baselines drift.** Actual markers begin at0/25/50/75% of the track, leaving a long trailing segment; target checkpoints span the width. Actual small label surfaces sit over the track, whereas selected labels sit beneath it. The active forming segment has no visible accent. See [the focused timeline comparison](first/focused-timeline.png). Spread stage markers across the track, align label baselines beneath it, and style the current forming segment without falsely marking lock/check-in/submission complete. Keep actual team check-in counts.

These findings were sent directly to the Team owner and parent before this report. They remain open until a revised capture at the same viewport is viewed and compared.

## Comparison evidence and normalization

- [Native1487×1058 full comparison](first/comparison-1487x1058.png): both original artifacts shown together, source left and actual right. A32px label strip is outside app pixels.
- [Proportional1440×1024 comparison](first/comparison-1440x1024.png): source scaled to1440×1025 and bottom1px cropped, actual retained at1440×1024. No implementation screenshot rescaling.
- Focused [hero](first/focused-hero.png), [members](first/focused-members.png), [idea/Next](first/focused-idea-next.png) and [timeline](first/focused-timeline.png). These are region-aligned crops, with original full images preserved. Hero/member actual crops are shifted44px down to account for the local rehearsal banner. Idea and timeline crops align their actual region tops and do not conceal global position differences.
- Actual originals: [1487×1058](first/team-1487x1058.png), [1440×1024](first/team-1440x1024.png), [1440×900](first/team-1440x900.png), [390×844](first/team-390x844.png), [390×480](first/team-390x480.png).

The source is a design image without a scrollbar. Actual desktop has a15px native vertical scrollbar, so available content width is1472 at a1487 viewport. Both use44px gutters within their available width. The local rehearsal banner adds44px before tabs/hero and is not production design drift. No CSS was injected to hide it. Density is1x in the supplied screenshots. Native/mobile screenshot sizes match their CSS viewports.

## Five fidelity surfaces

- **Fonts/typography:** the overall grotesk display hierarchy is recognizable; team title has similar scale and weight. TS-01 is actionable. Member names are somewhat smaller/denser than selected, a P3 after the primary idea/card fixes. Shared header brand/logo appear smaller than the source, but their global owner should decide after measuring the common-shell surface; this review makes no unsupported font-family identification from pixels.
- **Spacing/layout:** 150px team initials, horizontal members,44px gutters and60/40 split are structurally faithful. TS-02/03 remain. No repeated Dashboard title/sidebar appears. First mobile top regions stack with normal page scrolling, not clipping. Lower mobile regions,320px and768px are not captured in iteration1 and are not passed.
- **Colors/tokens:** warm paper, ink, restrained separators and pale green Next surface are close. Actual team green is existing fixture state, not a styling defect. The owner will set the fixture through its real Appearance UI before final capture. Human color name instead of a hex string is an intentional product choice. Reassess accent consistency after that selected state is rendered.
- **Image/asset quality:** supplied expression assets and actual brand/social images remain sharp. The Next mark needs scaling (TS-02). All three current fixture members share blue/squeezed avatars; this is fixture data and not evidence that distinct persisted choices are lost. Missing GitHub icons correspond to missing fixture handles, so do not add fake links. Actual phone/remove controls are required authorized leader features that the mock omits.
- **Copy/content/state:** actual3/5 count and112/500 character count are correct for the fixture. The screenshot's109 is not copied. Saved reflects persisted idea in this initial frame; dirty-state behavior remains to test. The unlocked Next-detail icon is correctly open even though the mock pairs a closed icon with “Team not locked”. Team check-in count0/3 and separate personal Going state preserve actual semantics rather than copying an ambiguous static milestone.

## Open checks and questions

- Capture and view full/scrolled390,320,390×480 and768 regions including idea, Next, timeline and controls.
- Record actual44px square touch targets for member links/remove and edit/invite buttons. Owned CSS suggests40×44 social and36×44 remove targets, but this reviewer has not opened a browser to measure them, so this is a validation candidate rather than a confirmed runtime finding.
- Independently inspect dirty/cancel behavior, keyboard/touch dialog closure and current leader/member controls with actual payloads. Do not submit mutations in this read-only lane.
- Common-header logo/font sizing belongs to root. Compare actual computed and rendered sizes before changing global shell.

## Implementation checklist

1. Resolve TS-01 idea typography.
2. Resolve TS-02 actual expression and CTA/card proportions.
3. Resolve TS-03 timeline layout while retaining computed state.
4. Capture revision at the same desktop viewports and compare both artifacts together again.
5. Complete remaining responsive, hit-target and read-only interaction evidence.

## Comparison history

Iteration1 is the first actual rendered comparison. No implementation fixes have been made by this reviewer. Earlier source measurements are [recorded separately](source-measurements.json). No final-ready statement follows from typecheck, compilation or screenshots existing.

**final result: blocked**

Blocked by the three actionable P2 differences and missing lower-mobile/responsive/control evidence listed above, pending implementing-owner fixes and subsequent rendered comparison.
