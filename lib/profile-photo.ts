import type { Database } from "./db";
import { one } from "./db";
import { demand } from "./security";
// Canonical, bounded PNG: verify CRCs, decompress raster rows with a strict output
// ceiling, validate filter bytes, recompress, and retain no ancillary/EXIF chunks.
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12),
    v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(out.length - 4, crc32(out.slice(4, -4)));
  return out;
}
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
async function transform(
  bytes: Uint8Array,
  stream: DecompressionStream | CompressionStream,
  max: number,
) {
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>])
      .stream()
      .pipeThrough(stream)
      .getReader(),
    parts: Uint8Array[] = [];
  let n = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      n += r.value.length;
      if (n > max) {
        await reader.cancel();
        demand(false, 422, "PHOTO_DECODE_LIMIT");
      }
      parts.push(r.value);
    }
    return concat(parts);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
}
export async function normalizeProfilePhoto(value: string) {
  demand(
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
      value.length <= 180000,
    422,
    "PHOTO_PNG_REQUIRED",
  );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value.split(",")[1]), (c) => c.charCodeAt(0));
  } catch {
    demand(false, 422, "PHOTO_INVALID");
  }
  demand(
    bytes!.length <= 131072 && signature.every((b, i) => bytes![i] === b),
    422,
    "PHOTO_INVALID",
  );
  const view = new DataView(bytes!.buffer);
  let at = 8,
    header: Uint8Array | undefined,
    done = false,
    seenData = false;
  const data: Uint8Array[] = [];
  while (at + 12 <= bytes!.length) {
    const size = view.getUint32(at);
    demand(
      size <= 131072 && at + size + 12 <= bytes!.length,
      422,
      "PHOTO_INVALID",
    );
    const type = String.fromCharCode(...bytes!.slice(at + 4, at + 8)),
      part = bytes!.slice(at + 8, at + 8 + size);
    demand(
      crc32(bytes!.slice(at + 4, at + 8 + size)) ===
        view.getUint32(at + 8 + size),
      422,
      "PHOTO_CRC_INVALID",
    );
    if (type === "IHDR") {
      demand(at === 8 && size === 13, 422, "PHOTO_INVALID");
      header = part;
    } else if (type === "IDAT") {
      demand(!!header && !done, 422, "PHOTO_INVALID");
      seenData = true;
      data.push(part);
    } else if (type === "IEND") {
      demand(size === 0 && seenData, 422, "PHOTO_INVALID");
      done = true;
    } else
      demand(type[0] === type[0].toLowerCase(), 422, "PHOTO_UNSUPPORTED_CHUNK");
    at += size + 12;
    if (done) break;
  }
  demand(header && done && at === bytes!.length, 422, "PHOTO_INVALID");
  const h = new DataView(header.buffer);
  const width = h.getUint32(0),
    height = h.getUint32(4);
  demand(
    width >= 32 &&
      width <= 512 &&
      width === height &&
      header[8] === 8 &&
      header[9] === 6 &&
      header[10] === 0 &&
      header[11] === 0 &&
      header[12] === 0,
    422,
    "PHOTO_DIMENSIONS",
    "Use a square PNG, 32–512 pixels, 8-bit RGBA.",
  );
  const length = height * (1 + 4 * width);
  let raw: Uint8Array;
  try {
    raw = await transform(
      concat(data),
      new DecompressionStream("deflate"),
      length,
    );
  } catch {
    demand(false, 422, "PHOTO_DECODE_INVALID");
  }
  demand(raw!.length === length, 422, "PHOTO_DECODE_INVALID");
  for (let row = 0; row < height; row++)
    demand(raw![row * (1 + width * 4)] <= 4, 422, "PHOTO_FILTER_INVALID");
  const compressed = await transform(
      raw!,
      new CompressionStream("deflate"),
      131072,
    ),
    out = concat([
      signature,
      chunk("IHDR", header),
      chunk("IDAT", compressed),
      chunk("IEND", new Uint8Array()),
    ]);
  demand(out.length <= 131072, 422, "PHOTO_SIZE");
  return (
    "data:image/png;base64," +
    btoa(Array.from(out, (b) => String.fromCharCode(b)).join(""))
  );
}
export async function profilePhotoResponse(
  db: Database,
  userId: string,
  viewerId?: string,
) {
  const p = await one<{ png: string; public: number }>(
    db,
    "SELECT ph.png,p.public FROM profile_photos ph JOIN profiles p ON p.user_id=ph.user_id WHERE ph.user_id=?",
    userId,
  );
  demand(p && (viewerId === userId || p.public === 1), 404, "PHOTO_NOT_FOUND");
  const bytes = Uint8Array.from(atob(p.png.split(",")[1]), (c) =>
    c.charCodeAt(0),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
