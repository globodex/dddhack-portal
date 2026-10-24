import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "evidence/viewer-registration";
let files = [];
for (const phase of ["before", "after"])
  for (const f of readdirSync(root + "/" + phase))
    if (f.endsWith(".png")) files.push(root + "/" + phase + "/" + f);
const inventory = [];
for (const file of files) {
  const bytes = readFileSync(file),
    img = sharp(bytes);
  const meta = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  inventory.push({
    file,
    width: meta.width,
    height: meta.height,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    pixelSHA256: createHash("sha256").update(raw).digest("hex"),
  });
}
const groups = Object.values(
  Object.groupBy(inventory, (r) => r.pixelSHA256),
).map((rows) => ({
  representative: rows[0].file,
  width: rows[0].width,
  height: rows[0].height,
  files: rows.map((r) => r.file),
}));
writeFileSync(
  root + "/screenshots.json",
  JSON.stringify({ inventory, groups }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      count: inventory.length,
      uniquePixels: groups.length,
      normalGroups: groups
        .filter((g) =>
          g.files.some((f) => f.includes("/viewer-") && /\d+x\d+.png$/.test(f)),
        )
        .map((g) => ({
          representative: g.representative,
          duplicates: g.files.length,
        })),
    },
    null,
    2,
  ),
);
