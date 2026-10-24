import { createHash } from "node:crypto";
import sharp from "sharp";
import { validateProjectImage } from "../../lib/project-media";
import { demand, PortalError } from "../../lib/security";
import {
  MAX_IMAGE_BYTES,
  type ImageContentType,
  type MediaKind,
  type ValidatedImage,
} from "./types";

export async function validateUploadedImage(
  bytes: Uint8Array,
  contentType: ImageContentType,
  kind: MediaKind,
  options: { preserveOriginal?: boolean } = {},
): Promise<ValidatedImage> {
  demand(
    bytes.byteLength >= 32 && bytes.byteLength <= MAX_IMAGE_BYTES,
    422,
    "IMAGE_SIZE",
  );
  // Preserve the portal's dimensions, ratios, signatures and trailing-byte restrictions.
  const original = validateProjectImage(
    `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
    kind,
  );
  let canonical: Buffer;
  try {
    const decoder = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: 4096 * 4096,
    });
    const metadata = await decoder.metadata();
    demand(
      metadata.format === (contentType === "image/png" ? "png" : "jpeg") &&
        (metadata.pages ?? 1) === 1 &&
        metadata.width === original.width &&
        metadata.height === original.height,
      422,
      "INVALID_RASTER_IMAGE",
    );
    // Fully decode; metadata() alone does not detect truncated pixel data.
    if (options.preserveOriginal) {
      await decoder.raw().toBuffer();
      canonical = Buffer.from(bytes);
    } else {
      // Signed uploads strip metadata and encode a single raster.
      canonical = await (
        contentType === "image/png"
          ? decoder.png({ compressionLevel: 9, adaptiveFiltering: true })
          : decoder.jpeg({ quality: 90 })
      ).toBuffer();
    }
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError(422, "INVALID_RASTER_IMAGE");
  }
  demand(canonical.byteLength <= MAX_IMAGE_BYTES, 422, "IMAGE_SIZE");
  return {
    bytes: canonical,
    contentType,
    byteLength: canonical.byteLength,
    ...original,
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}
