import { projectMediaPolicy } from "../../lib/project-media-policy";
/** Largest canonical image, never an original-file upload limit. */
export const MAX_IMAGE_BYTES = projectMediaPolicy.banner.canonicalMaxBytes;
export const UPLOAD_URL_TTL_SECONDS = 90;
export const FINALIZE_TTL_MS = 5 * 60 * 1000;
export const RECEIPT_TTL_MS = 30 * 60 * 1000;
export const FINALIZE_LEASE_MS = 60 * 1000;

export type MediaKind = "logo" | "banner";
export type ImageContentType = "image/png" | "image/jpeg";
export type MediaScope = { teamId: string; revision: number };
export type UploadInput = MediaScope & {
  kind: MediaKind;
  contentType: ImageContentType;
  byteLength: number;
};
export type ValidatedImage = {
  bytes: Uint8Array;
  contentType: ImageContentType;
  byteLength: number;
  width: number;
  height: number;
  sha256: string;
};
export type MediaUpload = UploadInput & {
  id: string;
  actorId: string;
  bucket: string;
  stagingKey: string;
  expiresAt: string;
  state: "pending" | "finalizing" | "ready" | "consumed";
  claimToken: string | null;
  claimExpiresAt: string | null;
  objectKey: string | null;
  image: Omit<ValidatedImage, "bytes"> | null;
  versionId: string | null;
};
export type MediaReceipt = MediaScope & {
  receiptId: string;
  kind: MediaKind;
  expiresAt: string;
  image: Omit<ValidatedImage, "bytes">;
};

/** The application must provide a durable implementation; never use process memory in Functions. */
export interface MediaRepository {
  insert(upload: MediaUpload): Promise<void>;
  find(id: string): Promise<MediaUpload | undefined>;
  claim(
    id: string,
    token: string,
    now: string,
    until: string,
  ): Promise<boolean>;
  complete(
    id: string,
    token: string,
    objectKey: string,
    image: Omit<ValidatedImage, "bytes">,
    now: string,
    expiresAt: string,
  ): Promise<boolean>;
  release(id: string, token: string): Promise<void>;
}

export interface MediaObjectStore {
  signPut(input: {
    bucket: string;
    key: string;
    contentType: ImageContentType;
    byteLength: number;
    expiresIn: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  read(
    bucket: string,
    key: string,
    maxBytes: number,
  ): Promise<{
    bytes: Uint8Array;
    contentType: string | undefined;
    contentLength: number | undefined;
  }>;
  write(bucket: string, key: string, image: ValidatedImage): Promise<void>;
}

/** Rechecks current leadership, attendance, removal, draft revision and submission access. */
export type MediaAuthorizer = (
  actorId: string,
  scope: MediaScope,
) => Promise<void>;
