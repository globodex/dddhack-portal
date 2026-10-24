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

QA is preparing targeted motion lifecycle checks and matching actual browser captures at 1440×900 and 390×844. Reduced-motion captures compare static layout and approved assets against the same baseline source. Matching Next.js browser screenshots, motion assertions and full integrated build remain pending until the frontend runtime and QA harness are ready. Historical v7 screenshots in [V7_SCREENSHOTS.md](../V7_SCREENSHOTS.md) remain source-bound evidence, not screenshots of this migration.
