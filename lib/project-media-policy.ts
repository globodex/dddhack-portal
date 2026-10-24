export type ProjectMediaKind = "logo" | "banner";
export type ProjectImageContentType = "image/png" | "image/jpeg";
export type ProjectImageStage = "source" | "canonical";

/** Original file limits are decimal MB; saved web images have separate byte budgets. */
export const projectMediaPolicy = {
  logo: {
    sourceMaxBytes: 1_000_000,
    canonicalMaxBytes: 128 * 1024,
    optimizationMaxEdge: 512,
    dataUriMaxChars: 180_000,
  },
  banner: {
    sourceMaxBytes: 5_000_000,
    canonicalMaxBytes: 384 * 1024,
    optimizationMaxEdge: 1600,
    dataUriMaxChars: 525_000,
  },
} as const;

export const PROJECT_MEDIA_CONTENT_TYPES = ["image/png", "image/jpeg"] as const;
export const PROJECT_MEDIA_SOURCE_MIN_DIMENSION = 64;
// Optimization may make the short edge thin; aspect is never padded or cropped.
export const PROJECT_MEDIA_CANONICAL_MIN_DIMENSION = 1;
export const PROJECT_MEDIA_MAX_DIMENSION = 4096;
export const PROJECT_MEDIA_MAX_PIXELS = 4096 * 4096;
export const PROJECT_MEDIA_MAX_PROJECT_JSON_BYTES = 1_000_000;
export const PROJECT_MEDIA_DEFAULT_JSON_BYTES = 600_000;
export const PROJECT_MEDIA_JPEG_QUALITIES = [0.86, 0.8, 0.76] as const;
export const PROJECT_MEDIA_RESIZE_FACTOR = 0.8;
export const PROJECT_MEDIA_MAX_OPTIMIZATION_STEPS = 24;

export function projectImageByteLimit(
  kind: ProjectMediaKind,
  stage: ProjectImageStage = "canonical",
) {
  return stage === "source"
    ? projectMediaPolicy[kind].sourceMaxBytes
    : projectMediaPolicy[kind].canonicalMaxBytes;
}

export function isProjectMediaCommand(action: unknown) {
  return (
    action === "save-project" ||
    action === "submit-project" ||
    action === "submit"
  );
}
