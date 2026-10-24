# Measured error-state movement

Root runtime source `2b35d3e7036a88cf84586dae02ef7b81e39ff9e6`. Synthetic `fake_pending` actor. All POSTs were intercepted in the browser as a held 503; no server mutations occurred.

At both 1440 x 900 and 390 x 844, busy-state outer dialog bounds stayed unchanged. An inline error increased outer height by 31.5 px and moved its top upward by 15.75 px. This is a **verified failure** of the requirement for stable modal geometry, rather than a passed screenshot.

The error screenshots were inspected as actual pixels. Source `12de812a11b3109c96beebddc1dedc1fe204334f` constrains the frame height and gives the child grid its full height so that the scrolling body absorbs the footer's height change. Corrected geometry is verified on integrated root `667222d5cd2680ec872860b971f32ecb7be42249`; see `../stable-geometry.json`, `../geometry-after/` and `../geometry-short/`.
