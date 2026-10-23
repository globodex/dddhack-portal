// Reproduce lossless derivatives of the accepted originals. No resizing or edits.
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const names = [
  "fallback-approved-v3",
  "delhi-fill-overscan",
  "metro-static",
  "text-mask-alpha",
];
const options = { lossless: true, effort: 6, exact: true };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const files = [];
for (const name of names) {
  const png = readFileSync(`public/art/delhi-v3/${name}.png`);
  const webp = await sharp(png).webp(options).toBuffer();
  const original = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const converted = await sharp(webp)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(converted.info, original.info);
  assert.ok(converted.data.equals(original.data), `${name}: RGBA mismatch`);
  assert.ok(webp.length < png.length, `${name}: not smaller`);
  writeFileSync(`public/art/delhi-v3/${name}.webp`, webp);
  files.push({
    name,
    pngBytes: png.length,
    webpBytes: webp.length,
    savedBytes: png.length - webp.length,
    rgbaExact: true,
    width: original.info.width,
    height: original.info.height,
    channels: 4,
    pngSha256: hash(png),
    webpSha256: hash(webp),
    rgbaSha256: hash(original.data),
  });
}
const totalPngBytes = files.reduce((sum, file) => sum + file.pngBytes, 0),
  totalWebpBytes = files.reduce((sum, file) => sum + file.webpBytes, 0);
mkdirSync("evidence/v7-image-perf", { recursive: true });
writeFileSync(
  "evidence/v7-image-perf/lossless-assets.json",
  JSON.stringify(
    {
      encoder: {
        sharp: sharp.versions.sharp,
        webp: sharp.versions.webp,
        options,
      },
      files,
      originalPngPreserved: true,
      totalPngBytes,
      totalWebpBytes,
      savedBytes: totalPngBytes - totalWebpBytes,
      savedPercent: (100 * (totalPngBytes - totalWebpBytes)) / totalPngBytes,
      browserMetricsMeasured: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    totalPngBytes,
    totalWebpBytes,
    savedBytes: totalPngBytes - totalWebpBytes,
  }),
);
