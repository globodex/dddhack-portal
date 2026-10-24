# Mobile landing audit

Source: `696b125f9711a4fd6e02c3ece3adadb18b83cba7`. Read-only local Next.js development runtime with disposable synthetic backend. No source changes, auth/provider requests, production mutations or image generation.

## Captured and viewed

- 390 × 844, normal and reduced motion: `hero-390x844-{no-preference,reduce}.png`
- 390 × 480, normal and reduced motion: `hero-390x480-{no-preference,reduce}.png`
- 768 × 1024, normal and reduced motion: `hero-768x1024-{no-preference,reduce}.png`
- 1440 × 900, normal and reduced motion: `hero-1440x900-{no-preference,reduce}.png`

`report.json` contains computed styles, geometry, hit probes, console errors and request boundaries. Its `dots` array includes chapter decorations after the first eight entries; only the first eight belong to the main hero.

## Findings

1. **Main mobile dots settle behind the opaque foreground.** At 390 × 844 the hero stage is 390 × 780 at y98, but all eight main hero dot bounds are between viewport y147 and y399. The copy block is white at y122..489 with z-index1. Thus the entire main composition is covered by the foreground after the falling entrance. The faint circles visible at the bottom are the separate 25%-opacity portrait backdrop.
2. **The bottom composition is disabled.** The final <=999px CSS override makes `.hero-art` absolute `inset:0` behind the copy and sets `.home-motion-strip { display:none }`. The animation measures dot home positions by width/480 in both axes, independent of the stage's available height. This produces a top cluster rather than a reserved area below the action.
3. **The CTA follows the content immediately.** Its 390 × 844 position is x20, y437..489, width350, height52.4. There are roughly354px below it. It is placed by normal content rhythm, with no lower thumb-zone allocation. At 390 × 480 it retains y437..489 and is partly below the initial viewport. Natural vertical scrolling remains available.
4. **Decoration currently does not block the CTA center.** Center probes hit the expected portal link on every captured viewport; all decorative layers inspected have pointer-events:none. Bounding-box corner probes hit the hero-actions background because the link is a rounded pill, which is expected rather than evidence of obstruction. No horizontal overflow or page errors were observed.
5. **Tablet reproduces the overlap.** At768 × 1024 the black/purple circles peek from beneath the CTA while most of their bodies are hidden behind the copy. Desktop uses the separate right composition and a visible bottom strip, so this defect is concentrated in the compact layout.

## Fix boundaries pending the selected mobile mockup

Reserve real layout space for three independent areas: hero identity/metadata, unobstructed lower CTA, and visible settling space beneath it. Compute the compact composition within its own measured stage rather than placing width-scaled desktop coordinates beneath foreground content. Keep decoration pointer-inert, safe-area padding, reduced-motion settling, offscreen pause and natural overflow for short screens. Reuse the existing eight-dot assets, approved Delhi artwork and static Metro. No new layout has been implemented while the mockup target is pending.

## Limits

Additional instrumented browser check: at390 ×844 and390 ×480, trusted touch and Enter activations reached the expected portal href; default navigation was prevented to avoid auth requests. Touch pause and keyboard resume changed the actual aria-pressed state. See `interaction-report.json`. This check was run later against the shared parent development runtime and is separate from the immutable baseline captures.

The local-only fixture banner adds34px between navbar and hero; measurements above include it. Captures are browser emulations, not physical devices or production timing. Chromium's native sandbox could not start in this container, so the installed container-compatible browser mode was used in fresh contexts with writes and external requests blocked.

