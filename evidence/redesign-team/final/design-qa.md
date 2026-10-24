# Team and discovery visual QA

Source visual truth: `/workspace/reference-evidence/accepted/02-dashboard-team-credits-project.png` and `03-discover-and-profile.png`, both materialized from confirmed Library IDs and viewed. Latest implementation spec: `docs/REDESIGN_SPEC_2026_10_24.md` in the integration branch.

Implementation source: `6a65f391aa0f6ad30ee7b34b2c6662baf541ec35`. Browser render: `team-locked-1440x900.png`, `participants-1440x900.png`, corresponding768x1024,390x844 and390x480 PNGs, and `create-team-picker-short390x480.png`.

Full-view comparison: `dashboard-reference-comparison.png`. Source1774x887 composite and implementation1440x900 CSS/pixel viewport are shown together with their scale/state differences named. Focused inspection: actual native-size desktop member/idea regions; mobile card typography; short mobile picker, swatch focus, preview and visible action; loading/error cards. No source image content was regenerated.

## Findings and iteration

- Initial short-mobile creation render put its action below the modal's visible region. Fixed with a scrollable form body and separate visible action area. The final390x480 capture shows the action fully within the viewport, with the initials preview and selected Purple swatch visible.
- Initial loading placeholders inherited generic card columns. Fixed by explicitly placing avatar, name, bio and membership shapes in the same content regions. Final loading capture shows the corrected geometry without another request.
- Final accepted captures use fresh contexts and settled top-of-page scroll. Intermediate files outside this final folder are excluded from handoff. One local navigation timeout was retried successfully; the failure receipt is retained separately.
- Private profiles initially used a larger empty layout. They now show a compact identity and real team state, without invented bios or empty social sections.

## Required fidelity surfaces

- Typography: self-hosted DM Sans retained. Page titles, member names, descriptions and actions have distinct weight/size; native screenshots show no clipping. Small state badges remain intentionally compact.
- Spacing/layout:24px desktop regions,20px mobile regions and consistent14px containers. Desktop members/idea columns follow the latest spec; tablet/mobile stack. The short modal preserves its action.
- Colors/tokens: integration-owned paper/surface/ink tokens, restrained lines and existing expressive palette. No new gradients or animation dependency.
- Assets: existing expression avatars, separate team initials and actual social SVGs including WhatsApp. No project logos substituted for team badges.
- Copy/content: repeated Optional text and four large settings labels removed. Actual safe public content drives cards. Real errors keep recovery controls. Private fields are supplied only by the existing authorized backend projection.

No actionable P0/P1/P2 issue remains within this component slice. Source state and viewport differences from the illustrative board are intentional under the newer written spec. Remaining integration checks, real login and physical-device behavior are outside this scoped result.

final result: passed
