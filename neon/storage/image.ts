import { createHash } from "node:crypto";
import sharp from "sharp";
import { inspectProjectImageBytes } from "../../lib/project-media";
import {
  PROJECT_MEDIA_JPEG_QUALITIES,
  PROJECT_MEDIA_MAX_OPTIMIZATION_STEPS,
  PROJECT_MEDIA_MAX_PIXELS,
  PROJECT_MEDIA_RESIZE_FACTOR,
  projectImageByteLimit,
  projectMediaPolicy,
} from "../../lib/project-media-policy";
import { demand, PortalError } from "../../lib/security";
import type { ImageContentType, MediaKind, ValidatedImage } from "./types";

/**
 * Signed storage accepts bounded original files and normalizes them to web images.
 * The JSON save path has already optimized the image; preserving those bytes keeps
 * existing request hashes/idempotency stable, after the same full raster decode.
 */
export async function validateUploadedImage(
  bytes: Uint8Array,
  contentType: ImageContentType,
  kind: MediaKind,
  options: { preserveOriginal?: boolean } = {},
): Promise<ValidatedImage> {
  const original = inspectProjectImageBytes(
    bytes,
    contentType,
    kind,
    options.preserveOriginal ? "canonical" : "source",
  );
  let canonical: Buffer;
  let dimensions = original;
  try {
    const decoder = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: PROJECT_MEDIA_MAX_PIXELS,
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
    // Metadata alone misses corrupt/truncated pixels. Decode the whole bounded raster.
    if (options.preserveOriginal) {
      await decoder.raw().toBuffer();
      canonical = Buffer.from(bytes);
    } else {
      // Decode once; bounded raw pixels are reused while encoding smaller candidates.
      // Rotation applies EXIF before metadata is stripped; PNG alpha stays intact.
      const decoded = await decoder
        .rotate()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      let edge = Math.min(
        projectMediaPolicy[kind].optimizationMaxEdge,
        Math.max(decoded.info.width, decoded.info.height),
      );
      let candidate: Buffer | undefined;
      for (let step = 0; step < PROJECT_MEDIA_MAX_OPTIMIZATION_STEPS; step++) {
        const qualities =
          contentType === "image/jpeg" ? PROJECT_MEDIA_JPEG_QUALITIES : [1];
        for (const quality of qualities) {
          const image = sharp(decoded.data, {
            raw: {
              width: decoded.info.width,
              height: decoded.info.height,
              channels: decoded.info.channels,
            },
          }).resize({
            width: edge,
            height: edge,
            fit: "inside",
            withoutEnlargement: true,
          });
          candidate = await (
            contentType === "image/png"
              ? image.png({ compressionLevel: 9, adaptiveFiltering: true })
              : image.jpeg({ quality: Math.round(quality * 100) })
          ).toBuffer();
          if (candidate.byteLength <= projectImageByteLimit(kind)) break;
        }
        if (candidate && candidate.byteLength <= projectImageByteLimit(kind))
          break;
        if (edge === 1) break;
        edge = Math.max(1, Math.floor(edge * PROJECT_MEDIA_RESIZE_FACTOR));
      }
      demand(
        candidate && candidate.byteLength <= projectImageByteLimit(kind),
        422,
        "IMAGE_SIZE",
      );
      canonical = candidate;
      dimensions = inspectProjectImageBytes(
        canonical,
        contentType,
        kind,
        "canonical",
      );
    }
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError(422, "INVALID_RASTER_IMAGE");
  }
  demand(
    canonical.byteLength <= projectImageByteLimit(kind),
    422,
    "IMAGE_SIZE",
  );
  return {
    bytes: canonical,
    contentType,
    byteLength: canonical.byteLength,
    ...dimensions,
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}
