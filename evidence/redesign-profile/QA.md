# Profile redesign evidence

Primary screenshot source: `ee7a1593e99a87aee5cdd8bf1c96a133cc7b9321`, real Next.js app on the disposable main fixture backend. No stylesheet injection. Every selected screenshot was opened and visually reviewed. Later profile focus and hydration safety changes are bound to `4c5fbf298d89a398ceab90dbdd5e0f5433235fe4` on `feat/profile-experience` and have independent browser evidence.

## Reviewed screens

- Desktop 1440×900: [step 1](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-1-1440x900.png), [step 2](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-2-1440x900.png), [step 3](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-3-1440x900.png).
- Mobile 390×844: [step 1](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-1-390x844.png), [step 2](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-2-390x844.png), [step 3](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-step-3-390x844.png).
- [Mobile navigation](https://github.com/Param302/dddhack-portal/blob/bddb869f3209adcb6cc4ea6161014d51f340cd96/evidence/redesign-profile/profile-mobile-navigation-390x844.png) shows Lucide icons, black close control, red Log out and one item per row.
- Tablet 768×1024 and short mobile 390×480: all three steps captured and viewed; paths and geometry are in [report.json](report.json). The short viewport uses normal document scrolling and retains every required field.

## Source comparison

Accepted source: Library `libfile_d5422b4a7efc819197fed4e02c871b30`, materialized and viewed as `/workspace/reference-evidence/accepted/01-profile-three-steps.png` (1408×1117 pixels). Its first mobile panel was cropped at 155,547 to 323×548 and normalized to 390 pixels wide for [this combined source and implementation comparison](comparison-profile-mobile-source-implementation.png). The mock's original CSS viewport/density is unknown; this supports composition review, not an exact pixel match. Actual implementation captures use device scale 1 and CSS width390.

[Short mobile before and after](comparison-profile-short-before-after-fixed.png) places actual same-viewport captures together. The baseline clipped bio and sex inside a fixed scrolling field region. The implementation exposes the complete form through document scrolling.

The user's latest instruction explicitly overrides the mock's multicolor expression previews: all eight expressions use the currently selected single color, followed by one compact eight-color picker. Native radio inputs retain their semantics and are visually hidden. No profile upload or extra decorative dots were introduced.

## Fidelity surfaces

- Typography: existing self-hosted DM Sans; desktop title36px, mobile28px, labels13px and inputs16px. No extra heading captions or duplicated optional prose.
- Layout: desktop fields left and avatar right; mobile avatar first; balanced form columns, one-row eight-color picker and a footer aligned to the actual step2/3 fields. The 390×844 Next button ends at841px including the fixture banner. Small screens retain page scrolling.
- Colors: warm paper/ink tokens and existing approved dot palette. The organization link was darkened from inherited `#008d66` (3.91:1 on paper) to `#006b43`; subsequent automated contrast checks pass.
- Assets: existing Codex logo, expression component, platform SVGs and Lucide controls are reused. No substitute logos, generated faces, uploads or fake eye drawings.
- Copy and behavior: exactly Next, Next, Save. All existing required fields and imported/stored values remain. Required fields have red asterisks. Errors identify fields and focus the first invalid input; successful Save proceeds straight to teams without a review or confirmation screen.

## Verification and corrected findings

1. Fixed the baseline's clipped short-mobile required fields by removing the nested fixed-height scrolling region.
2. Fixed detached desktop actions by aligning step2/3 footer actions with their620px form.
3. Fixed insufficient organization-link contrast; both desktop and touch step3 Axe scans now report zero violations.
4. Fixed invalid-input focus beneath the sticky mobile header by centering the focused field; step changes reset document scrolling. Actual geometry evidence is in [focus-report.json](supporting/focus-report.json).
5. Found a real early-interaction privacy issue: before hydration, a native form could place profile values in a GET URL. Profile now uses `method="post"`, and fields/Next remain disabled until client handlers attach. [The scripts-disabled regression](supporting/hydration-guard-report.json) records only the initial GET with an empty query after physical tap and Enter attempts.

[Final controls report](controls-report.json):24 passed checks across keyboard1440×900 and touch390×480, two exactly-once committed profile Saves, API persistence of every field, direct `/teams` navigation, optional social add/select/remove, back/next state preservation, all expression/color choices, single-color preview updates, no visible native radios, accessible field errors, saving-disabled state, zero page errors and two Axe scans with zero violations. Typecheck and13 focused tests passed.

The main127.0.0.1 preview rejected Save with403 `ORIGIN_NOT_ALLOWED` because the existing local NextRequest URL normalizes loopback to localhost. No main profile persisted. Actual positive writes used localhost3001 with a matching disposable synthetic backend origin; production origin guards were unchanged. The original failure report is preserved separately.

Limitations: local development and touch emulation, not physical-device or hosted performance evidence. Full real Google login remains unverified. The screenshot fixture banner is absent in production. No deployment, provider settings, credentials, production data or backend deletion changed. Native Library transfer is owned by the parent; PNG originals remain in repository evidence.

final result: passed
