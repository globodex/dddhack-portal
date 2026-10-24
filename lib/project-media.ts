import { demand, PortalError } from "./security";
import {
  inspectProjectImageBytes as inspectBytes,
  ProjectImageValidationError,
} from "./project-image-preflight";
import {
  projectImageByteLimit,
  type ProjectImageStage,
  type ProjectMediaKind,
} from "./project-media-policy";

export function inspectProjectImageBytes(
  bytes: Uint8Array,
  contentType: string,
  kind: ProjectMediaKind,
  stage: ProjectImageStage = "source",
) {
  try {
    return inspectBytes(bytes, contentType, kind, stage);
  } catch (error) {
    if (error instanceof ProjectImageValidationError)
      throw new PortalError(422, error.code, error.message);
    throw error;
  }
}

/** Canonical web-image validation; original source files use the explicit source stage. */
export function validateProjectImage(
  value: string,
  kind: ProjectMediaKind,
  options: { stage?: ProjectImageStage } = {},
) {
  const stage = options.stage ?? "canonical";
  // Bound the string before regex/decoding; this is separate from the raw original-file cap.
  demand(
    value.length <= Math.ceil(projectImageByteLimit(kind, stage) / 3) * 4 + 32,
    422,
    "IMAGE_SIZE",
  );
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
  return inspectProjectImageBytes(bytes, `image/${match[1]}`, kind, stage);
}
