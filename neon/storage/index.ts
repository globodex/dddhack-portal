import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { demand, PortalError } from "../../lib/security";
import { validateUploadedImage } from "./image";
import {
  FINALIZE_LEASE_MS,
  FINALIZE_TTL_MS,
  MAX_IMAGE_BYTES,
  RECEIPT_TTL_MS,
  UPLOAD_URL_TTL_SECONDS,
  type MediaAuthorizer,
  type MediaObjectStore,
  type MediaReceipt,
  type MediaRepository,
  type MediaScope,
  type MediaUpload,
} from "./types";
export * from "./types";
export type { StorageEnvironment } from "./s3";
export { createNeonStorageClient, createS3ObjectStore } from "./s3";
export {
  createDatabaseMediaRepository,
  mediaConsumeStatements,
  mediaTableDDL,
} from "./repository";
export { createPortalMediaAuthorizer } from "./authorization";
export { createStorageApiHandler } from "./http";
export { createMediaDatabase } from "./database";

export const scopeSchema = z.object({
  teamId: z.string().min(1).max(200),
  revision: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
});
export const issueUploadSchema = scopeSchema
  .extend({
    kind: z.enum(["logo", "banner"]),
    contentType: z.enum(["image/png", "image/jpeg"]),
    byteLength: z.number().int().min(32).max(MAX_IMAGE_BYTES),
  })
  .strict();
export const finalizeUploadSchema = scopeSchema
  .extend({
    uploadId: z.string().uuid(),
  })
  .strict();

const receipt = (upload: MediaUpload): MediaReceipt => {
  demand(upload.image && upload.objectKey, 409, "UPLOAD_NOT_READY");
  return {
    receiptId: upload.id,
    teamId: upload.teamId,
    revision: upload.revision,
    kind: upload.kind,
    expiresAt: upload.expiresAt,
    image: upload.image,
  };
};
const partition = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 32);

export function createProjectMediaStorage(options: {
  objectStore: MediaObjectStore;
  repository: MediaRepository;
  authorize: MediaAuthorizer;
  mediaBucket?: string;
  now?: () => Date;
  uuid?: () => string;
}) {
  const { objectStore, repository, authorize } = options;
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const bucket = options.mediaBucket ?? "project-media";
  demand(
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket),
    503,
    "STORAGE_BUCKETS_INVALID",
  );

  async function ownedUpload(
    actorId: string,
    input: { uploadId: string } & MediaScope,
  ) {
    demand(actorId, 401, "SIGN_IN_REQUIRED");
    await authorize(actorId, input);
    const upload = await repository.find(input.uploadId);
    demand(
      upload &&
        upload.actorId === actorId &&
        upload.teamId === input.teamId &&
        upload.revision === input.revision,
      404,
      "UPLOAD_NOT_FOUND",
    );
    demand(
      Date.parse(upload.expiresAt) > now().getTime(),
      410,
      "UPLOAD_EXPIRED",
    );
    return upload;
  }

  return {
    async issueUpload(actorId: string, value: unknown) {
      const input = issueUploadSchema.parse(value);
      demand(actorId, 401, "SIGN_IN_REQUIRED");
      await authorize(actorId, input);
      const clock = now();
      const id = uuid();
      const extension = input.contentType === "image/png" ? "png" : "jpg";
      const kindPrefix = input.kind === "logo" ? "logos" : "banners";
      const stagingKey = `${kindPrefix}/staging/teams/${partition(input.teamId)}/actors/${partition(actorId)}/r${input.revision}/${id}.${extension}`;
      const upload: MediaUpload = {
        ...input,
        id,
        actorId,
        bucket,
        stagingKey,
        expiresAt: new Date(clock.getTime() + FINALIZE_TTL_MS).toISOString(),
        state: "pending",
        claimToken: null,
        claimExpiresAt: null,
        objectKey: null,
        image: null,
        versionId: null,
      };
      // Persist before signing; a presigner failure leaves only an expiring unused intent.
      await repository.insert(upload);
      const signed = await objectStore.signPut({
        bucket: upload.bucket,
        key: stagingKey,
        contentType: input.contentType,
        byteLength: input.byteLength,
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      });
      return {
        uploadId: id,
        url: signed.url,
        method: "PUT" as const,
        headers: signed.headers,
        expiresAt: new Date(
          clock.getTime() + UPLOAD_URL_TTL_SECONDS * 1000,
        ).toISOString(),
        finalizeBefore: upload.expiresAt,
      };
    },

    async finalizeUpload(
      actorId: string,
      value: unknown,
    ): Promise<MediaReceipt> {
      const input = finalizeUploadSchema.parse(value);
      const upload = await ownedUpload(actorId, input);
      if (upload.state === "ready") return receipt(upload);
      demand(upload.state !== "consumed", 409, "RECEIPT_ALREADY_CONSUMED");
      const token = uuid();
      const clock = now();
      demand(
        await repository.claim(
          upload.id,
          token,
          clock.toISOString(),
          new Date(clock.getTime() + FINALIZE_LEASE_MS).toISOString(),
        ),
        409,
        "UPLOAD_FINALIZING",
      );
      try {
        const source = await objectStore.read(
          upload.bucket,
          upload.stagingKey,
          MAX_IMAGE_BYTES,
        );
        demand(
          source.contentType === upload.contentType,
          422,
          "UPLOAD_CONTENT_TYPE_MISMATCH",
        );
        demand(
          source.contentLength === upload.byteLength &&
            source.bytes.byteLength === upload.byteLength,
          422,
          "UPLOAD_LENGTH_MISMATCH",
        );
        const image = await validateUploadedImage(
          source.bytes,
          upload.contentType,
          upload.kind,
        );
        // Never CopyObject from the signed source: a still-valid PUT could replace it
        // between validation and copy. Write the bytes we actually decoded instead.
        const extension = image.contentType === "image/png" ? "png" : "jpg";
        const kindPrefix = upload.kind === "logo" ? "logos" : "banners";
        const objectKey = `${kindPrefix}/objects/teams/${partition(upload.teamId)}/r${upload.revision}/${uuid()}.${extension}`;
        await objectStore.write(upload.bucket, objectKey, image);
        await authorize(actorId, input);
        const { bytes: _bytes, ...metadata } = image;
        const completedAt = now();
        demand(
          await repository.complete(
            upload.id,
            token,
            objectKey,
            metadata,
            completedAt.toISOString(),
            new Date(completedAt.getTime() + RECEIPT_TTL_MS).toISOString(),
          ),
          409,
          "UPLOAD_CHANGED_RETRY",
        );
        return receipt({
          ...upload,
          state: "ready",
          objectKey,
          image: metadata,
          expiresAt: new Date(
            completedAt.getTime() + RECEIPT_TTL_MS,
          ).toISOString(),
        });
      } catch (error) {
        await repository.release(upload.id, token).catch(() => undefined);
        throw error;
      }
    },

    async resolveReceipt(actorId: string, value: unknown) {
      const input = finalizeUploadSchema
        .extend({ kind: z.enum(["logo", "banner"]) })
        .parse(value);
      const upload = await ownedUpload(actorId, input);
      demand(
        upload.state === "ready" && upload.kind === input.kind,
        409,
        "RECEIPT_SCOPE_MISMATCH",
      );
      return receipt(upload);
    },

    /** Transitional server-only adapter: existing draft/published payloads keep data URIs. */
    async receiptDataUri(actorId: string, value: unknown) {
      const input = finalizeUploadSchema
        .extend({ kind: z.enum(["logo", "banner"]) })
        .parse(value);
      const upload = await ownedUpload(actorId, input);
      demand(
        upload.state === "ready" &&
          upload.kind === input.kind &&
          upload.objectKey &&
          upload.image,
        409,
        "RECEIPT_SCOPE_MISMATCH",
      );
      const stored = await objectStore.read(
        upload.bucket,
        upload.objectKey,
        MAX_IMAGE_BYTES,
      );
      const actual = createHash("sha256").update(stored.bytes).digest("hex");
      demand(
        stored.contentType === upload.image.contentType &&
          stored.contentLength === upload.image.byteLength &&
          stored.bytes.byteLength === upload.image.byteLength &&
          actual === upload.image.sha256,
        422,
        "STORED_IMAGE_CHANGED",
      );
      return `data:${upload.image.contentType};base64,${Buffer.from(stored.bytes).toString("base64")}`;
    },
  };
}

export type ProjectMediaStorage = ReturnType<typeof createProjectMediaStorage>;
