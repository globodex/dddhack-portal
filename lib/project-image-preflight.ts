import {
  PROJECT_MEDIA_CANONICAL_MIN_DIMENSION,
  PROJECT_MEDIA_MAX_DIMENSION,
  PROJECT_MEDIA_SOURCE_MIN_DIMENSION,
  projectImageByteLimit,
  type ProjectImageStage,
  type ProjectMediaKind,
} from "./project-media-policy";

export class ProjectImageValidationError extends Error {
  readonly status = 422;
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ProjectImageValidationError";
  }
}
function demand(
  condition: unknown,
  _status: number,
  code: string,
  message?: string,
): asserts condition {
  if (!condition) throw new ProjectImageValidationError(code, message);
}

/** Bounded, dependency-free header preflight. A full raster decode must follow. */
export function inspectProjectImageBytes(
  bytes: Uint8Array,
  contentType: string,
  kind: ProjectMediaKind,
  stage: ProjectImageStage = "source",
) {
  demand(
    contentType === "image/png" || contentType === "image/jpeg",
    422,
    "PROJECT_MEDIA_REQUIRED",
    `Choose a PNG or JPEG ${kind}.`,
  );
  demand(
    bytes.byteLength >= 32 &&
      bytes.byteLength <= projectImageByteLimit(kind, stage),
    422,
    "IMAGE_SIZE",
    stage === "source"
      ? `${kind === "logo" ? "Logo" : "Banner"} must be at most ${kind === "logo" ? "1" : "5"} MB.`
      : `The optimized ${kind} is too large. Choose another image.`,
  );
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  if (contentType === "image/png") {
    demand(
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
      422,
      "INVALID_PNG",
    );
    let offset = 8;
    let sawHeader = false;
    let sawPixels = false;
    let sawEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = data.getUint32(offset);
      demand(length <= bytes.length - offset - 12, 422, "INVALID_PNG");
      const chunk = String.fromCharCode(
        ...bytes.subarray(offset + 4, offset + 8),
      );
      if (!sawHeader) {
        demand(chunk === "IHDR" && length === 13, 422, "INVALID_PNG");
        width = data.getUint32(offset + 8);
        height = data.getUint32(offset + 12);
        sawHeader = true;
      } else demand(chunk !== "IHDR", 422, "INVALID_PNG");
      demand(chunk !== "acTL", 422, "INVALID_RASTER_IMAGE");
      if (chunk === "IDAT") sawPixels = true;
      offset += length + 12;
      if (chunk === "IEND") {
        demand(length === 0 && offset === bytes.length, 422, "INVALID_PNG");
        sawEnd = true;
        break;
      }
    }
    demand(sawHeader && sawPixels && sawEnd, 422, "INVALID_PNG");
  } else {
    demand(
      bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217,
      422,
      "INVALID_JPEG",
    );
    let offset = 2;
    while (offset + 1 < bytes.length) {
      demand(bytes[offset++] === 255, 422, "INVALID_JPEG");
      while (offset < bytes.length && bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      demand(marker !== 0 && marker !== 216, 422, "INVALID_JPEG");
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      demand(offset + 2 <= bytes.length, 422, "INVALID_JPEG");
      const length = data.getUint16(offset);
      demand(
        length >= 2 && offset + length <= bytes.length,
        422,
        "INVALID_JPEG",
      );
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        demand(length >= 8 && width === 0, 422, "INVALID_JPEG");
        height = data.getUint16(offset + 3);
        width = data.getUint16(offset + 5);
      }
      offset += length;
    }
  }
  const minimum =
    stage === "source"
      ? PROJECT_MEDIA_SOURCE_MIN_DIMENSION
      : PROJECT_MEDIA_CANONICAL_MIN_DIMENSION;
  demand(
    width >= minimum &&
      height >= minimum &&
      width <= PROJECT_MEDIA_MAX_DIMENSION &&
      height <= PROJECT_MEDIA_MAX_DIMENSION,
    422,
    "IMAGE_DIMENSIONS",
    stage === "source"
      ? "Choose an image with each side between 64 and 4096 pixels."
      : undefined,
  );
  return { width, height };
}
