import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { validateUploadedImage } from "../neon/storage/image";
import {
  projectMediaPolicy,
  type ProjectMediaKind,
} from "../lib/project-media-policy";

const destination = new URL(
  "../evidence/project-media-quality/",
  import.meta.url,
);
await mkdir(destination, { recursive: true });
process.env.XDG_CACHE_HOME ??= "/tmp/ddd-media-quality-cache";
await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
const typography = await sharp(
  Buffer.from(
    `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="#fff8e7"/><circle cx="512" cy="430" r="300" fill="#f26b4a"/><text x="512" y="470" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="120" fill="#202020">DDD</text><text x="512" y="810" text-anchor="middle" font-family="DejaVu Sans" font-size="72" fill="#202020">HACK · 2026</text><text x="512" y="895" text-anchor="middle" font-family="DejaVu Sans" font-size="34" fill="#202020">Synthetic typography fixture</text></svg>`,
  ),
)
  .png()
  .toBuffer();
const width = 2048,
  height = 1280;
const raw = Buffer.alloc(width * height * 3);
let seed = 123456789;
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const grain = (seed & 255) / 32 - 4;
    const ridge = Math.sin(x / 200) * 80 + Math.cos(x / 90) * 20;
    const landscape = y > 650 + ridge;
    const i = (y * width + x) * 3;
    raw[i] = Math.max(
      0,
      Math.min(
        255,
        (landscape ? 45 + Math.sin(x / 130) * 12 : 180 - y / 20) + grain,
      ),
    );
    raw[i + 1] = Math.max(
      0,
      Math.min(255, (landscape ? 95 + y / 35 : 210 - y / 35) + grain),
    );
    raw[i + 2] = Math.max(
      0,
      Math.min(255, (landscape ? 60 + y / 70 : 240 - y / 80) + grain),
    );
  }
const scene = await sharp(raw, { raw: { width, height, channels: 3 } })
  .jpeg({ quality: 96 })
  .toBuffer();
const transparent = await sharp({
  create: {
    width: 2048,
    height: 128,
    channels: 4,
    background: { r: 237, g: 94, b: 59, alpha: 0.25 },
  },
})
  .png()
  .toBuffer();
const noiseRaw = Buffer.alloc(1024 * 1024 * 4);
for (let i = 0; i < noiseRaw.length; i++) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  noiseRaw[i] = seed & 255;
}
const noise = await sharp(noiseRaw, {
  raw: { width: 1024, height: 1024, channels: 4 },
})
  .png()
  .toBuffer();
const records = [];
for (const fixture of [
  {
    name: "logo-typography",
    kind: "logo",
    type: "image/png",
    bytes: typography,
  },
  {
    name: "banner-synthetic-landscape",
    kind: "banner",
    type: "image/jpeg",
    bytes: scene,
  },
  {
    name: "banner-transparent-ultrawide",
    kind: "banner",
    type: "image/png",
    bytes: transparent,
  },
  {
    name: "banner-alpha-noise",
    kind: "banner",
    type: "image/png",
    bytes: noise,
  },
] as const) {
  const result = await validateUploadedImage(
    fixture.bytes,
    fixture.type,
    fixture.kind,
  );
  const original = await sharp(fixture.bytes).metadata();
  const output = await sharp(result.bytes).metadata();
  const extension = fixture.type === "image/png" ? "png" : "jpg";
  await writeFile(
    new URL(`${fixture.name}-source.${extension}`, destination),
    fixture.bytes,
  );
  await writeFile(
    new URL(`${fixture.name}-optimized.${extension}`, destination),
    result.bytes,
  );
  const originalPreview = await sharp(fixture.bytes)
    .resize(512, 320, { fit: "contain", background: "#eee8da" })
    .flatten({ background: "#eee8da" })
    .png()
    .toBuffer();
  const optimizedPreview = await sharp(result.bytes)
    .resize(512, 320, { fit: "contain", background: "#eee8da" })
    .flatten({ background: "#eee8da" })
    .png()
    .toBuffer();
  const labels = Buffer.from(
    `<svg width="1024" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="42" fill="#fffaf0"/><text x="16" y="27" font-family="DejaVu Sans" font-size="16">Original ${original.width}×${original.height} / ${fixture.bytes.length} B</text><text x="528" y="27" font-family="DejaVu Sans" font-size="16">Optimized ${result.width}×${result.height} / ${result.byteLength} B</text></svg>`,
  );
  await sharp({
    create: { width: 1024, height: 362, channels: 3, background: "#fffaf0" },
  })
    .composite([
      { input: labels, top: 0, left: 0 },
      { input: originalPreview, top: 42, left: 0 },
      { input: optimizedPreview, top: 42, left: 512 },
    ])
    .png()
    .toFile(new URL(`${fixture.name}-comparison.png`, destination).pathname);
  records.push({
    name: fixture.name,
    kind: fixture.kind,
    contentType: fixture.type,
    source: {
      width: original.width,
      height: original.height,
      bytes: fixture.bytes.length,
      hasAlpha: original.hasAlpha,
    },
    canonical: {
      width: result.width,
      height: result.height,
      bytes: result.byteLength,
      hasAlpha: output.hasAlpha,
      sha256: createHash("sha256").update(result.bytes).digest("hex"),
    },
    policy: projectMediaPolicy[fixture.kind as ProjectMediaKind],
  });
}
await writeFile(
  new URL("report.json", destination),
  JSON.stringify(
    {
      syntheticOnly: true,
      visuals:
        "Equal 512×320 contain previews on a neutral background. No crop or stretch.",
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(records));
