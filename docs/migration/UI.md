# UI motion migration

Source baseline: `dc92672c0e9a50ebcfe458f2e7c692058a1483b7`. This work preserves the current v7 landing composition, responsive geometry, wording, Lucide icons, original organizer photos and approved Delhi v3 assets. It imports no artwork previews. `home.tsx`, `portal.tsx`, package files and shared runtime wiring are outside this change.

## Before and after

| Behavior                     | Baseline                                                                                                                           | Migration change                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dot entrance                 | Measuring a new size or rebuilding an effect after Pause/Resume could replay the fall.                                             | One entrance per mounted field. Subsequent resize and Pause/Resume use the same neutral composition.                                                                            |
| Hidden or offscreen entrance | rAF stopped, but the entrance used wall-clock time and could skip ahead on return. Fields initially assumed visibility.            | Wait for intersection and accumulate only visible animation time. Cancel rAF and touch timers while hidden or offscreen.                                                        |
| Pointer interaction          | Cached document bounds could become stale as sticky chapters moved. Repulsion could remain after scrolling or leaving the browser. | Read current viewport bounds for visible fields. Clear pointer effects on scroll, blur, cancellation and browser exit. Pointer events outside an idle field schedule no frame.  |
| Compositor hint              | Every public dot retained `will-change: transform` at rest.                                                                        | Apply the hint only while the field has scheduled animation work. The decorative scroll cue pauses when its hero field is offscreen or the document is hidden.                  |
| Delhi fill                   | Hero-level pause handled offscreen behavior, but the component did not check its own intersection or document visibility.          | Check the wordmark's own visibility before loading or revealing motion. Reset on scroll, blur and pointer cancellation; hidden/offscreen states show the exact static fallback. |

The spring constants, travel distances, dot colors/counts/size tiers, 850ms dot entrance and organizer entry timings are unchanged. The Delhi mask and Metro remain stationary. Only the overscanned interior fill moves opposite to the pointer within the existing ±6/±4 source-pixel limits and 160ms transition. Its exact fallback, lossless WebPs, PNG recovery and decode-before-reveal behavior remain intact. Reduced-motion and coarse-pointer Delhi modes request only the static fallback. No new helper copy, overlays or decoration is introduced.

## Runtime and performance

The owned files contain no `import.meta.env` references, framework-specific imports, server-only APIs or package additions. React effects, IntersectionObserver, ResizeObserver, requestAnimationFrame, Pointer Events and CSS already cover these interactions. An animation library would increase download and lifecycle cost without supplying a required capability.

The v7 asset/request budgets in [V7_PERFORMANCE.md](../V7_PERFORMANCE.md) remain the reference. This patch adds no asset or network request and does not change image dimensions or bytes. No hosted latency or timing improvement is claimed. The narrower visibility and frame scheduling should reduce unnecessary work; browser checks must establish behavior, not infer a percentage gain from source inspection.

## Verification

Passed locally on 24 October 2026:

- 12 existing tests across `approved-home-interaction`, `delhi-conditional-loading`, `delhi-mask`, `delhi-lossless` and `organizer-motion`. These verify SSR fallbacks/content, original asset hashes and identical decoded WebP pixels, conditional image loading/recovery, mask lifecycle, stage bounds and organizer geometry.
- Strict isolated TypeScript check of all owned TS/TSX components against the frontend worktree's installed dependencies, without Vite ambient types.
- Prettier and `git diff --check` for changed implementation files.
- The [portable effect runner](../../scripts/qa-migration-motion.mjs) passes nine Dots and eight Delhi checks against the actual bundled components with mocked hooks/browser primitives. These cover the changed lifecycle semantics, including visible elapsed time and first-intersection loading. They are separate from browser results.
- The [actual Chromium motion report](../../evidence/migration/next-home-hydrated-motion/report.json) passes nine checks: settled rAF release, no entrance replay after Pause/Resume or resize, pointer return, stationary Metro/mask with moving fill, controlled hidden-state fallback, actual offscreen pause and no moving-art requests with reduced/coarse input. Controlled visibility events do not prove physical-device background-tab behavior.

QA captured hydrated source and actual Next.js development runtimes at matching 1440×900 and 390×844 viewports with reduced motion. Both source and Next originals were visually inspected: hero typography, approved Delhi artwork and static Metro registration, header, date, scroll/pause placement and compact portrait backdrop preserve the current layout. The separate auth integration intentionally changes the primary CTA to “Continue to portal.” The [pixel comparison](../../evidence/migration/home-comparison.json) reports 1.3151% changed desktop pixels (CTA and dot-edge raster differences) and 0.2585% mobile (all within the CTA rectangle; every pixel outside it matches). This is a source comparison, not a claim of pixel-identical desktop rendering or acceptance of previously unavailable mockups.

Actual captures and provenance:

- [Next desktop](../../evidence/migration/next-home-hydrated/home-1440x900-viewport.png) and [Next mobile](../../evidence/migration/next-home-hydrated/home-390x844-viewport.png), with the [Next report](../../evidence/migration/next-home-hydrated/report.json).
- [Source desktop](../../evidence/migration/v7-home-hydrated/home-1440x900-viewport.png) and [source mobile](../../evidence/migration/v7-home-hydrated/home-390x844-viewport.png), with the [source report](../../evidence/migration/v7-home-hydrated/report.json).

These are localhost development snapshots with disposable synthetic fixtures, a local fixture banner and development tooling hidden. The report records a runtime fingerprint and uncommitted integration changes; these captures do not identify a final production build. The browser ran in a restricted localhost-only harness because the container could not start its native sandbox. The full integrated production build remains a separate gate. Historical v7 screenshots in [V7_SCREENSHOTS.md](../V7_SCREENSHOTS.md) remain separate source-bound evidence.

## Narrow inherited accessibility fixes

The integrator separately assigned `participant-ui.css` and `admin-credit-batches.css` after QA found issues inherited by both source and Next. Readonly email text changes from `#778594` to the existing `#526079` text color on `#edf2f5`, raising calculated contrast from 3.34:1 to 5.63:1. The selected sex option uses white on `#008656` instead of `#008d66`, raising contrast from 4.19:1 to 4.62:1. Field layout, options, values and copy stay unchanged.

Credits overflow was traced in the actual 1440px browser to the visually hidden native CSV file input: a full-width visible-input rule gave it a 1440px box starting at x=289 and ending at x=1729. The table/container already fit x=264 through x=1408 with horizontal scrolling available. The fix restores only the hidden input's 1×1px size, zero minimum height and zero padding; it preserves the native picker and visible page geometry. No document overflow clipping or table redesign is used.

Candidate validation injected the exact changed CSS rules into the actual local Next browser at 1440×900 and 390×844: Profile has zero axe color-contrast violations, Credits document width equals each viewport, the hidden input measures 1×1px, and Upload CSV still activates the native file chooser. No file was selected or uploaded. This candidate check is separate from QA's pending recheck after the CSS commit is integrated into the running source.
