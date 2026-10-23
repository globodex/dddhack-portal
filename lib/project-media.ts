import { demand, PortalError } from "./security";
// Raster-only, bounded images. Never accept SVG, remote fetch URLs or executable markup.
export function validateProjectImage(value: string, kind: "logo" | "banner") {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value,
  );
  demand(match, 422, "PROJECT_MEDIA_REQUIRED", `Upload a PNG or JPEG ${kind}.`);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  } catch {
    throw new PortalError(422, "INVALID_IMAGE_ENCODING");
  }
  demand(
    bytes.length >= 32 && bytes.length <= 131072,
    422,
    "IMAGE_SIZE",
    "Each image must be at most 128 KB.",
  );
  const data = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  if (match[1] === "png") {
    demand(
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
        String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" &&
        String.fromCharCode(...bytes.slice(-8, -4)) === "IEND",
      422,
      "INVALID_PNG",
    );
    width = data.getUint32(16);
    height = data.getUint32(20);
  } else {
    demand(
      bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217,
      422,
      "INVALID_JPEG",
    );
    let p = 2;
    while (p + 8 < bytes.length) {
      demand(bytes[p] === 255, 422, "INVALID_JPEG");
      const marker = bytes[p + 1];
      p += 2;
      if (marker === 218 || marker === 217) break;
      if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215))
        continue;
      const length = data.getUint16(p);
      demand(length >= 2 && p + length <= bytes.length, 422, "INVALID_JPEG");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        height = data.getUint16(p + 3);
        width = data.getUint16(p + 5);
        break;
      }
      p += length;
    }
  }
  demand(
    width >= 64 && height >= 64 && width <= 4096 && height <= 4096,
    422,
    "IMAGE_DIMENSIONS",
  );
  demand(
    kind === "logo"
      ? width === height
      : Math.abs(width / height - 16 / 9) < 0.015,
    422,
    "IMAGE_RATIO",
    kind === "logo"
      ? "Project logo must be square (1:1)."
      : "Project banner must be 16:9.",
  );
  return { width, height };
}
