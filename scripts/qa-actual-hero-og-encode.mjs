import sharp from "sharp";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const input = "evidence/actual-hero-og/hero-native-1440x756.png";
const output = "public/og/devday-new-delhi-home.jpg";
const source = await sharp(input).metadata();
if (source.width !== 1440 || source.height !== 756)
  throw new Error("EXPECTED_NATIVE_SCREENSHOT_DIMENSIONS");
const buffer = await sharp(input)
  .resize(1200, 630, { fit: "fill" })
  .jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: "4:4:4" })
  .toBuffer();
await writeFile(output, buffer);
await writeFile("evidence/actual-hero-og/asset.json", JSON.stringify({
  input, output, width: 1200, height: 630, format: "jpeg", bytes: buffer.length,
  sha256: createHash("sha256").update(buffer).digest("hex"),
  conversion: "Exact proportional5/6 downscale1440x756→1200x630, JPEGquality86/mozjpeg/4:4:4, no crop/composition/art change",
}, null, 2) + "\n");
