# Profile breakpoint correction

Before source: `667222d5cd2680ec872860b971f32ecb7be42249`.

Native Chromium 200% zoom was confirmed in a disposable profile: outer width 1440, inner width 720, device-pixel ratio 2 and visual viewport scale 1. The original CDP screenshots cover the whole physical 1440px-wide viewport. Both attached before images were opened and inspected.

At this effective 720px width, profile step 1 stacks the avatar above the fields, but keeps two grid columns and a vertical avatar divider. The fields therefore occupy only the left half of the page. The control/overflow tests pass, but the rendered layout is visibly wrong.

- [Before: avatar area](before-native-200pct-step1.png)
- [Before: half-width fields](before-native-200pct-fields.png)

The legacy stylesheet reorders the avatar and fields at 740px. The later profile stylesheet previously applied its tablet grid from 641px and only switched to a single column below 641px. This two-line CSS correction aligns those ranges: mobile through 740px, tablet from 741px. It changes no form behavior, persistence, field requirements or shared tokens.

After verification is pending integration: native 200% at CSS720px, the 740/741px boundary and a 768px tablet regression check. This source change is not marked visually ready until those actual renders are inspected.
