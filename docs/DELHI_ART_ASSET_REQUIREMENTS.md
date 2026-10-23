# Approved Delhi artwork — layer dependency

Status: **integration blocked by missing layer package**. No application layout, artwork, runtime, credentials or published state changed in this task. Correctness commit f814adf remains the application baseline. Broader homepage mockups still require review.

## Exact approved reference

- Library file: libfile_24a1836818d48191984dc9bc51ea6f93
- Version: 3
- Filename: new-delhi-refined-green-close-metro.png
- Native image: PNG, 2048 × 768, 1,689,967 bytes
- Selected direction from the parent: lighter green, slimmer long Metro, tighter gap.

Library read confirmed the exact file/version metadata. It supplied a raster asset pointer, not an editable layer package. No selected-version local source/mask/layer manifest was found. Existing new-delhi-wordmark files are older static studies and must not be substituted. The existing design chat is actively preparing broader mockups; its available local artifacts do not supply these missing layers. No claim of a visual comparison against the selected PNG is made here.

## Required package before integration

1. **Stationary text mask:** the exact approved NEW DELHI glyph silhouettes, with transparent/alpha or explicit mask semantics; preserve the approved letter shapes, spacing and alignment. Export canvas dimensions and bounds in a manifest.
2. **Independent landmark/city fill scene:** aligned to the mask and extended beyond its visible edges enough to support the intended subtle travel at every responsive size. It must be complete beneath the lettering, rather than a flattened copy already cut to glyph edges.
3. **Static outside-text artwork:** Metro underline and any clouds/decorations intended to remain fixed, with transparent background and matching alignment. Nothing outside the text clip should drift with the pointer.
4. **Exact approved static composite:** retain version 3 as the reference/fallback, with source identity, dimensions and hashes. All layers must recompose to that approved visual; do not regenerate a nearby image or silently approximate the lettering.

The current PNG alone does not provide independently movable under-text content. Moving that image would drift the whole wordmark, while deriving a mask from the flattened composition would risk including the Metro/clouds or exposing missing fill at the edges. Neither is the requested effect.

## Intended implementation/test contract

- Keep the text mask and outside-text layers stationary. Only the scene inside the mask moves slightly opposite to cursor position relative to the artwork bounds.
- Bound translation by the available overscan after responsive scaling; clamp extreme/outside positions. Recompute bounds on resize and prevent blank clipped edges.
- Pause, prefers-reduced-motion, coarse/touch pointer and hidden/offscreen states must render a stable static result. Pointer leave returns the fill to neutral.
- Preserve an accessible New Delhi heading/name; this artwork must not become the only inaccessible source of the location text.
- Test pointer center/corners/outside bounds, degenerate/changed dimensions, resize, pointer leave, pause, media-query changes, reduced motion and touch fallback. Then compare actual rendered pixels against the approved source at desktop/mobile sizes.

No art component was built or inserted because its required assets are absent. Consequently these art-specific interaction/visual tests have **not run**; the existing correctness test results do not verify this effect. Do not report integration complete until the exact layers are present and the tests/visual comparison pass. Local browser QA was already blocked by the unavailable browser surface; that remains a separate verification limit.


23 October update: the approved v3 layered pack is now materialized and integrated locally. See OPERATIONAL_RELEASE_2026_10_23.md and assets/delhi-v3-manifest.json for provenance and bounded motion. The prior missing-layer blocker is resolved. Integrated browser/device QA remains unverified.
