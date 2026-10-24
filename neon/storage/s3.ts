import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { demand, PortalError } from "../../lib/security";
import type { MediaObjectStore } from "./types";

export type StorageEnvironment = {
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_ENDPOINT_URL_S3?: string;
  AWS_REGION?: string;
  NEON_MEDIA_BUCKET?: string;
};

export function createNeonStorageClient(env: StorageEnvironment) {
  demand(
    env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY &&
      env.AWS_REGION &&
      env.AWS_ENDPOINT_URL_S3,
    503,
    "STORAGE_NOT_CONFIGURED",
  );
  let endpoint: URL;
  try {
    endpoint = new URL(env.AWS_ENDPOINT_URL_S3);
  } catch {
    throw new PortalError(503, "STORAGE_NOT_CONFIGURED");
  }
  demand(
    endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
    503,
    "STORAGE_NOT_CONFIGURED",
  );
  return new S3Client({
    endpoint: endpoint.toString(),
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  });
}

/** Injection keeps SDK requests and presigning testable without any cloud credentials. */
export function createS3ObjectStore(
  client: Pick<S3Client, "send">,
  presign: typeof getSignedUrl = getSignedUrl,
): MediaObjectStore {
  return {
    async signPut({ bucket, key, contentType, byteLength, expiresIn }) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: byteLength,
      });
      const url = await presign(client as S3Client, command, {
        expiresIn,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      // The browser supplies Content-Length from the Blob; JS cannot set this forbidden header.
      return { url, headers: { "Content-Type": contentType } };
    },
    async read(bucket, key, maxBytes) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          Range: `bytes=0-${maxBytes}`,
        }),
      );
      const body = result.Body;
      demand(body, 422, "UPLOAD_NOT_FOUND");
      const fullLength = result.ContentRange
        ? Number(/\/(\d+)$/.exec(result.ContentRange)?.[1])
        : result.ContentLength;
      if (
        !Number.isSafeInteger(fullLength) ||
        fullLength! > maxBytes ||
        fullLength! < 1
      ) {
        (body as { destroy?: () => void }).destroy?.();
        throw new PortalError(422, "IMAGE_SIZE");
      }
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const value of body as AsyncIterable<Uint8Array>) {
        length += value.byteLength;
        if (length > maxBytes) {
          (body as { destroy?: () => void }).destroy?.();
          throw new PortalError(422, "IMAGE_SIZE");
        }
        chunks.push(value);
      }
      demand(length === fullLength, 422, "UPLOAD_LENGTH_MISMATCH");
      return {
        bytes: Buffer.concat(chunks),
        contentType: result.ContentType,
        contentLength: fullLength,
      };
    },
    async write(bucket, key, image) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: image.bytes,
          ContentType: image.contentType,
          ContentLength: image.byteLength,
          CacheControl: "private, no-store",
          ContentDisposition: "inline",
          Metadata: { sha256: image.sha256 },
        }),
      );
    },
  };
}
