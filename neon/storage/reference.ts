import { createHash } from "node:crypto";
import { z } from "zod";
import { validateProjectImage } from "../../lib/project-media";
import { demand } from "../../lib/security";
import { MAX_IMAGE_BYTES, type MediaKind } from "./types";

export const projectMediaMarker = "neon-project-media";
export const projectMediaReferenceSchema = z
  .object({
    storage: z.literal(projectMediaMarker),
    version: z.literal(1),
    bucket: z.string().min(3).max(63),
    key: z.string().min(1).max(512),
    kind: z.enum(["logo", "banner"]),
    contentType: z.enum(["image/png", "image/jpeg"]),
    byteLength: z.number().int().min(32).max(MAX_IMAGE_BYTES),
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(4096),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type ProjectMediaReference = z.infer<typeof projectMediaReferenceSchema>;

/** Validates persisted metadata without downloading private object bytes. */
export function parseProjectMediaReference(
  value: unknown,
  kind: MediaKind,
  options: {
    mediaBucket?: string;
    teamId?: string;
  } = {},
): ProjectMediaReference {
  const parsed = projectMediaReferenceSchema.safeParse(value);
  demand(parsed.success, 422, "INVALID_STORED_MEDIA_REFERENCE");
  const reference = parsed.data;
  const prefix = kind === "logo" ? "logos" : "banners";
  const extension = reference.contentType === "image/png" ? "png" : "jpg";
  const teamPartition =
    options.teamId === undefined
      ? "[a-f0-9]{32}"
      : createHash("sha256").update(options.teamId).digest("hex").slice(0, 32);
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  const keyPattern = new RegExp(
    `^${prefix}/objects/teams/${teamPartition}/(?:d${reference.sha256}|r[0-9]+)/${uuid}\\.${extension}$`,
  );
  demand(
    reference.bucket === (options.mediaBucket ?? "project-media") &&
      reference.kind === kind &&
      keyPattern.test(reference.key),
    422,
    "INVALID_STORED_MEDIA_REFERENCE",
  );
  demand(
    kind === "logo"
      ? reference.width === reference.height
      : Math.abs(reference.width / reference.height - 16 / 9) < 0.015,
    422,
    "IMAGE_RATIO",
  );
  return reference;
}

/** Publication checks use persisted validated metadata; image responses still verify bytes. */
export function validatePublishedProjectMedia(
  value: unknown,
  kind: MediaKind,
  teamId: string,
  mediaBucket = "project-media",
) {
  demand(
    typeof teamId === "string" && teamId.length > 0 && teamId.length <= 200,
    422,
    "INVALID_STORED_MEDIA_REFERENCE",
  );
  if (typeof value === "string") return validateProjectImage(value, kind);
  const reference = parseProjectMediaReference(value, kind, {
    teamId,
    mediaBucket,
  });
  return { width: reference.width, height: reference.height };
}
