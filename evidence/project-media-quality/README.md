# Synthetic raster quality evidence

Raster normalization source: `695b2d5f521d82d3d25784656193332d235fa365` (the image implementation is unchanged in `8c9b968`). Generated with `scripts/qa-project-media-quality.ts`. All four original/optimized comparison PNGs were opened and visually inspected. These are raster-fixture comparisons, not browser screenshots or real event uploads.

| Fixture                   | Original              | Optimized          |
| ------------------------- | --------------------- | ------------------ |
| Typography logo           | 1024×1024,54,914 B    | 512×512,37,931 B   |
| Synthetic landscape JPEG  | 2048×1280,679,744 B   | 1600×1000,93,376 B |
| Transparent ultrawide PNG | 2048×128,5,580 B      | 1600×100,906 B     |
| High-entropy alpha PNG    | 1024×1024,4,202,841 B | 335×335,388,287 B  |

The typography remained readable at the equal512×320 preview size. Landscape geometry, ultrawide proportions and alpha remain intact. The high-entropy fixture loses fine noise detail as its dimensions shrink to meet384KiB; it demonstrates the explicit complexity/size tradeoff. No crop, stretch or substitute artwork is used. Full source and optimized PNG/JPEG bytes are preserved alongside the previews. `report.json` records actual dimensions, byte counts, alpha flags, policy and optimized SHA256 hashes.
