import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { batch, one } from "../lib/db";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { PortalError } from "../lib/security";
import {
  createDatabaseMediaRepository,
  createNeonStorageClient,
  createPortalMediaAuthorizer,
  createProjectMediaStorage,
  createS3ObjectStore,
  createStorageApiHandler,
  mediaConsumeStatements,
  mediaTableDDL,
  type MediaObjectStore,
  type MediaScope,
  type MediaUpload,
  type ValidatedImage,
} from "../neon/storage";
import { validateUploadedImage } from "../neon/storage/image";
import { activate, attend, setup } from "./helpers";
import { syntheticImage, jpegAtByteLength } from "./fixture-images";
import { projectImageByteLimit } from "../lib/project-media-policy";

const scope = { teamId: "team-a", revision: 0 };
const png = () => Buffer.from(syntheticImage(64, 64).split(",")[1], "base64");
const errorCode = (code: string) => (error: unknown) =>
  error instanceof PortalError && error.code === code;

function fixture() {
  const db = new LocalDatabase(":memory:");
  db.raw
    .exec(`CREATE TABLE users(id text PRIMARY KEY); CREATE TABLE teams(id text PRIMARY KEY);
    CREATE TABLE submission_versions(id text PRIMARY KEY); ${mediaTableDDL}`);
  db.raw.exec(
    "INSERT INTO users VALUES('alice'); INSERT INTO users VALUES('bob'); INSERT INTO teams VALUES('team-a');",
  );
  let time = new Date("2026-10-24T10:00:00.000Z");
  let access = true;
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string; contentLength: number }
  >();
  const signed: Parameters<MediaObjectStore["signPut"]>[0][] = [];
  const writes: { key: string; image: ValidatedImage }[] = [];
  let reads = 0;
  const store: MediaObjectStore = {
    async signPut(input) {
      signed.push(input);
      return {
        url: "https://storage.test/signed",
        headers: { "Content-Type": input.contentType },
      };
    },
    async read(_bucket, key) {
      reads++;
      const object = objects.get(key);
      if (!object) throw new Error("not found");
      return object;
    },
    async write(_bucket, key, image) {
      writes.push({ key, image });
      objects.set(key, {
        bytes: image.bytes,
        contentType: image.contentType,
        contentLength: image.byteLength,
      });
    },
  };
  const repository = createDatabaseMediaRepository(db);
  const storage = createProjectMediaStorage({
    objectStore: store,
    repository,
    authorize: async (_actorId, target) => {
      if (!access) throw new PortalError(403, "LEADER_REQUIRED");
      if (target.teamId !== scope.teamId || target.revision !== scope.revision)
        throw new PortalError(409, "PROJECT_CHANGED_RELOAD");
    },
    now: () => time,
  });
  const issue = (extra = {}) =>
    storage.issueUpload("alice", {
      ...scope,
      kind: "logo",
      contentType: "image/png",
      byteLength: png().length,
      ...extra,
    });
  const put = async (
    uploadId: string,
    bytes = png(),
    contentType = "image/png",
    contentLength = bytes.length,
  ) => {
    const row = (await repository.find(uploadId))!;
    objects.set(row.stagingKey, { bytes, contentType, contentLength });
    return row;
  };
  return {
    db,
    storage,
    repository,
    store,
    objects,
    signed,
    writes,
    issue,
    put,
    reads: () => reads,
    setTime: (next: string) => {
      time = new Date(next);
    },
    deny: () => {
      access = false;
    },
  };
}

test("signed upload accepts only bounded raster declarations and server-generated scoped keys", async () => {
  const f = fixture();
  try {
    for (const value of [
      { contentType: "image/svg+xml" },
      { byteLength: 1_000_001 },
      { byteLength: 0 },
      { key: "../other" },
    ]) {
      await assert.rejects(f.issue(value));
    }
    assert.equal(f.signed.length, 0);
    const result = await f.issue();
    assert.equal(result.method, "PUT");
    assert.equal(result.expiresAt, "2026-10-24T10:01:30.000Z");
    assert.equal(f.signed[0].bucket, "project-media");
    assert.match(
      f.signed[0].key,
      /^logos\/staging\/teams\/[a-f0-9]{32}\/actors\/[a-f0-9]{32}\/r0\/[a-f0-9-]+\.png$/,
    );
    assert.equal(f.signed[0].expiresIn, 90);
    assert.equal(f.signed[0].byteLength, png().length);
    f.deny();
    await assert.rejects(f.issue(), errorCode("LEADER_REQUIRED"));
    assert.equal(f.signed.length, 1);
  } finally {
    f.db.close();
  }
});

test("finalize fully decodes and promotes exact bytes into a distinct immutable key; repeats are idempotent", async () => {
  const f = fixture();
  try {
    const { uploadId } = await f.issue();
    const pending = await f.put(uploadId);
    const receipt = await f.storage.finalizeUpload("alice", {
      ...scope,
      uploadId,
    });
    assert.equal(receipt.kind, "logo");
    assert.equal(receipt.image.width, 64);
    assert.match(f.writes[0].key, /^logos\/objects\//);
    assert.notEqual(f.writes[0].key, pending.stagingKey);
    // A client can still reuse its signed PUT. It cannot change the promoted object.
    f.objects.set(pending.stagingKey, {
      bytes: new Uint8Array([1]),
      contentType: "text/html",
      contentLength: 1,
    });
    assert.deepEqual(
      await f.storage.finalizeUpload("alice", { ...scope, uploadId }),
      receipt,
    );
    assert.equal(f.writes.length, 1);
    const uri = await f.storage.receiptDataUri("alice", {
      ...scope,
      uploadId,
      kind: "logo",
    });
    assert.match(uri, /^data:image\/png;base64,/);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(uri.split(",")[1], "base64"))
        .digest("hex"),
      receipt.image.sha256,
    );
    assert.equal(f.reads(), 2);
  } finally {
    f.db.close();
  }
});

test("finalize rejects content type, length, corrupt pixels, dimensions and oversized bytes", async () => {
  const invalidPng = png();
  invalidPng[45] ^= 255; // Break compressed data / CRC while retaining magic, IHDR and IEND.
  for (const sample of [
    {
      bytes: png(),
      contentType: "text/html",
      length: png().length,
      code: "UPLOAD_CONTENT_TYPE_MISMATCH",
    },
    {
      bytes: png(),
      contentType: "image/png",
      length: png().length + 1,
      code: "UPLOAD_LENGTH_MISMATCH",
    },
    {
      bytes: invalidPng,
      contentType: "image/png",
      length: invalidPng.length,
      code: "INVALID_RASTER_IMAGE",
    },
    {
      bytes: Buffer.from(syntheticImage(63, 90).split(",")[1], "base64"),
      contentType: "image/png",
      length: 0,
      code: "IMAGE_DIMENSIONS",
    },
  ]) {
    const f = fixture();
    try {
      const length = sample.length || sample.bytes.length;
      const { uploadId } = await f.issue({ byteLength: sample.bytes.length });
      await f.put(uploadId, sample.bytes, sample.contentType, length);
      await assert.rejects(
        f.storage.finalizeUpload("alice", { ...scope, uploadId }),
        errorCode(sample.code),
      );
      assert.equal(f.writes.length, 0);
      assert.equal((await f.repository.find(uploadId))?.state, "pending");
    } finally {
      f.db.close();
    }
  }
  await assert.rejects(
    validateUploadedImage(Buffer.alloc(1_000_001), "image/png", "logo"),
    errorCode("IMAGE_SIZE"),
  );
});

test("JPEGs decode as real raster images, and claimed PNGs cannot contain JPEG bytes", async () => {
  const jpeg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "green" },
  })
    .jpeg()
    .toBuffer();
  const image = await validateUploadedImage(jpeg, "image/jpeg", "logo");
  assert.equal(image.contentType, "image/jpeg");
  assert.equal(image.height, 64);
  await assert.rejects(
    validateUploadedImage(jpeg, "image/png", "logo"),
    errorCode("INVALID_PNG"),
  );
  await assert.rejects(
    validateUploadedImage(
      jpeg.subarray(0, jpeg.length - 30),
      "image/jpeg",
      "logo",
    ),
  );
});

test("receipt lookup checks actor, team, current revision, image kind and current authorization", async () => {
  const f = fixture();
  try {
    const { uploadId } = await f.issue();
    await f.put(uploadId);
    await assert.rejects(
      f.storage.finalizeUpload("bob", { ...scope, uploadId }),
      errorCode("UPLOAD_NOT_FOUND"),
    );
    await assert.rejects(
      f.storage.finalizeUpload("alice", { ...scope, uploadId, revision: 1 }),
      errorCode("PROJECT_CHANGED_RELOAD"),
    );
    await f.storage.finalizeUpload("alice", { ...scope, uploadId });
    await assert.rejects(
      f.storage.resolveReceipt("alice", { ...scope, uploadId, kind: "banner" }),
      errorCode("RECEIPT_SCOPE_MISMATCH"),
    );
    f.deny();
    await assert.rejects(
      f.storage.resolveReceipt("alice", { ...scope, uploadId, kind: "logo" }),
      errorCode("LEADER_REQUIRED"),
    );
  } finally {
    f.db.close();
  }
});

test("expired intent and lost finalization lease cannot promote a receipt", async () => {
  const f = fixture();
  try {
    const { uploadId } = await f.issue();
    await f.put(uploadId);
    f.setTime("2026-10-24T10:05:00.000Z");
    await assert.rejects(
      f.storage.finalizeUpload("alice", { ...scope, uploadId }),
      errorCode("UPLOAD_EXPIRED"),
    );
    assert.equal(f.reads(), 0);
    f.setTime("2026-10-24T10:01:00.000Z");
    const originalWrite = f.store.write;
    f.store.write = async (...args) => {
      await originalWrite(...args);
      f.setTime("2026-10-24T10:02:01.000Z");
    };
    await assert.rejects(
      f.storage.finalizeUpload("alice", { ...scope, uploadId }),
      errorCode("UPLOAD_CHANGED_RETRY"),
    );
    assert.equal((await f.repository.find(uploadId))?.state, "pending");
  } finally {
    f.db.close();
  }
});

test("a durable compare-and-swap claim allows one finalizer and can recover an expired lease", async () => {
  const f = fixture();
  try {
    const { uploadId } = await f.issue();
    assert.equal(
      await f.repository.claim(
        uploadId,
        "first",
        "2026-10-24T10:00:00.000Z",
        "2026-10-24T10:01:00.000Z",
      ),
      true,
    );
    assert.equal(
      await f.repository.claim(
        uploadId,
        "second",
        "2026-10-24T10:00:01.000Z",
        "2026-10-24T10:01:01.000Z",
      ),
      false,
    );
    assert.equal(
      await f.repository.claim(
        uploadId,
        "second",
        "2026-10-24T10:01:00.000Z",
        "2026-10-24T10:02:00.000Z",
      ),
      true,
    );
    await f.repository.release(uploadId, "first");
    assert.equal((await f.repository.find(uploadId))?.claimToken, "second");
  } finally {
    f.db.close();
  }
});

test("a stored receipt rejects later object tampering", async () => {
  const f = fixture();
  try {
    const { uploadId } = await f.issue();
    await f.put(uploadId);
    await f.storage.finalizeUpload("alice", { ...scope, uploadId });
    const row = (await f.repository.find(uploadId))!;
    const object = f.objects.get(row.objectKey!)!;
    const altered = Uint8Array.from(object.bytes);
    altered[40] ^= 1;
    f.objects.set(row.objectKey!, { ...object, bytes: altered });
    await assert.rejects(
      f.storage.receiptDataUri("alice", { ...scope, uploadId, kind: "logo" }),
      errorCode("STORED_IMAGE_CHANGED"),
    );
  } finally {
    f.db.close();
  }
});

test("storage HTTP endpoints enforce same-origin, verified identity, method and a streamed JSON bound", async () => {
  const f = fixture();
  try {
    let identity: { id: string } | null = { id: "alice" };
    const handler = createStorageApiHandler({
      appOrigin: "https://dddhack-portal.vercel.app",
      authenticate: async () => identity,
      storageFor: () => f.storage,
    });
    const request = (
      body: string,
      origin = "https://dddhack-portal.vercel.app",
      method = "POST",
    ) =>
      new Request("https://backend.test/api/media/uploads", {
        method,
        headers: { Origin: origin, "Content-Type": "application/json" },
        ...(method === "POST" ? { body } : {}),
      });
    const body = JSON.stringify({
      ...scope,
      kind: "logo",
      contentType: "image/png",
      byteLength: png().length,
    });
    assert.equal((await handler(request(body)))?.status, 201);
    assert.equal(
      (await handler(request(body, "https://evil.test")))?.status,
      403,
    );
    assert.equal((await handler(request(body, undefined, "GET")))?.status, 405);
    assert.equal((await handler(request(" ".repeat(4097))))?.status, 413);
    assert.equal((await handler(request("not json")))?.status, 400);
    identity = null;
    assert.equal((await handler(request(body)))?.status, 401);
    assert.equal(
      await handler(new Request("https://backend.test/api/unrelated")),
      null,
    );
    identity = { id: "alice" };
    f.store.signPut = async () => {
      throw new Error("secret-token-do-not-leak");
    };
    const error = await handler(request(body));
    assert.equal(error?.status, 503);
    assert.deepEqual(await error?.json(), { error: "STORAGE_UNAVAILABLE" });
    assert.match(error!.headers.get("cache-control")!, /no-store/);
  } finally {
    f.db.close();
  }
});

test("Neon SDK configuration uses path-style SigV4 and signs both content type and length", async () => {
  assert.throws(
    () => createNeonStorageClient({}),
    errorCode("STORAGE_NOT_CONFIGURED"),
  );
  const client = createNeonStorageClient({
    AWS_ENDPOINT_URL_S3: "https://storage.example.test/branch",
    AWS_REGION: "us-east-2",
    AWS_ACCESS_KEY_ID: "synthetic-key",
    AWS_SECRET_ACCESS_KEY: "synthetic-secret",
  });
  try {
    assert.equal(client.config.forcePathStyle, true);
    const result = await createS3ObjectStore(client).signPut({
      bucket: "project-media",
      key: "logos/staging/a.png",
      contentType: "image/png",
      byteLength: 128,
      expiresIn: 90,
    });
    const url = new URL(result.url);
    assert.equal(url.pathname, "/branch/project-media/logos/staging/a.png");
    assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "90");
    assert.equal(
      url.searchParams.get("X-Amz-SignedHeaders"),
      "content-length;content-type;host",
    );
    assert.deepEqual(result.headers, { "Content-Type": "image/png" });
  } finally {
    client.destroy();
  }
});

test("S3 reads bound bytes even if headers lie, and distinguish ranged length from full object size", async () => {
  for (const result of [
    { Body: Readable.from([Buffer.alloc(33)]), ContentLength: 32 },
    {
      Body: Readable.from([Buffer.alloc(32)]),
      ContentLength: 32,
      ContentRange: "bytes 0-31/131073",
    },
    { Body: Readable.from([Buffer.alloc(31)]), ContentLength: 32 },
  ]) {
    const store = createS3ObjectStore({ send: async () => result } as never);
    await assert.rejects(store.read("project-media", "key", 32));
  }
});

test("real portal authorization requires checked-in leader, current revision and open submissions", async () => {
  const f = await setup();
  try {
    await activate(f.db);
    f.clock("2026-11-01T04:30:00.000Z");
    const authorize = createPortalMediaAuthorizer(f.service());
    await assert.rejects(
      authorize("fake_alice", { teamId: "fake_team1", revision: 0 }),
      errorCode("TEAM_CHECKIN_REQUIRED"),
    );
    await attend(f.db, "fake_alice");
    await authorize("fake_alice", { teamId: "fake_team1", revision: 0 });
    await assert.rejects(
      authorize("fake_bob", { teamId: "fake_team1", revision: 0 }),
      errorCode("LEADER_REQUIRED"),
    );
    await assert.rejects(
      authorize("fake_alice", { teamId: "fake_team1", revision: 1 }),
      errorCode("PROJECT_CHANGED_RELOAD"),
    );
  } finally {
    f.db.close();
  }
});

test("receipt consumption atomically binds only the authorized actor/team/revision/version and blocks replay", async () => {
  const f = await setup();
  try {
    await activate(f.db);
    await attend(f.db, "fake_alice");
    f.clock("2026-11-01T04:30:00.000Z");
    f.db.raw.exec(mediaTableDDL);
    const repository = createDatabaseMediaRepository(f.db);
    const image = await validateUploadedImage(png(), "image/png", "logo");
    const { bytes: _bytes, ...metadata } = image;
    const upload: MediaUpload = {
      id: "receipt",
      actorId: "fake_alice",
      teamId: "fake_team1",
      revision: 0,
      kind: "logo",
      contentType: "image/png",
      byteLength: png().length,
      bucket: "project-media",
      stagingKey: "logos/staging/key",
      expiresAt: "2026-11-01T04:35:00.000Z",
      state: "pending",
      claimToken: null,
      claimExpiresAt: null,
      objectKey: null,
      image: null,
      versionId: null,
    };
    await repository.insert(upload);
    await repository.claim(
      upload.id,
      "claim",
      "2026-11-01T04:30:00.000Z",
      "2026-11-01T04:31:00.000Z",
    );
    await repository.complete(
      upload.id,
      "claim",
      "logos/objects/key",
      metadata,
      "2026-11-01T04:30:01.000Z",
      "2026-11-01T05:00:00.000Z",
    );
    const prepareVersion: import("../lib/db").SQL[] = [
      [
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('project','fake_team1','synthetic','{}',1,'2026-11-01T04:30:00.000Z')",
      ],
      [
        "INSERT INTO submission_versions VALUES('version','fake_team1',1,'{}','2026-11-01T04:30:00.000Z')",
      ],
    ];
    const consume = (change = {}) =>
      mediaConsumeStatements({
        actorId: "fake_alice",
        teamId: "fake_team1",
        revision: 0,
        versionId: "version",
        receipts: [{ receiptId: "receipt", kind: "logo" }],
        now: "2026-11-01T04:30:02.000Z",
        ...change,
      });
    await assert.rejects(
      batch(f.db, [...prepareVersion, ...consume({ actorId: "fake_bob" })]),
    );
    assert.equal(
      await one(f.db, "SELECT id FROM submission_versions WHERE id='version'"),
      undefined,
    );
    assert.equal((await repository.find("receipt"))?.state, "ready");
    await assert.rejects(
      batch(f.db, [
        ...prepareVersion,
        ...consume({ versionId: "foreign-version" }),
      ]),
    );
    await assert.rejects(
      batch(f.db, [...prepareVersion, ...consume({ revision: 1 })]),
    );
    // Attendance can change after HTTP authorization; the binding statement checks it again.
    await assert.rejects(
      batch(f.db, [
        ...prepareVersion,
        [
          "INSERT INTO participant_status_overrides VALUES('fake_alice','Absent','Synthetic attendance change','fake_admin','2026-11-01T04:30:01.000Z')",
        ],
        ...consume(),
      ]),
    );
    assert.equal(
      await one(f.db, "SELECT id FROM submission_versions WHERE id='version'"),
      undefined,
    );
    await batch(f.db, [...prepareVersion, ...consume()]);
    assert.equal((await repository.find("receipt"))?.versionId, "version");
    await assert.rejects(batch(f.db, consume()));
  } finally {
    f.db.close();
  }
});

test("signed media endpoint honors kind-specific decimal source caps then returns bounded any-aspect receipts", async () => {
  const sourceJpeg = await sharp({
    create: { width: 64, height: 192, channels: 3, background: "teal" },
  })
    .jpeg()
    .toBuffer();
  for (const kind of ["logo", "banner"] as const) {
    const f = fixture();
    try {
      const maximum = projectImageByteLimit(kind, "source");
      await assert.rejects(f.issue({ kind, byteLength: maximum + 1 }));
      assert.equal(f.signed.length, 0);
      assert.equal(
        (await f.db.prepare("SELECT id FROM portal_media_uploads").all())
          .results.length,
        0,
      );
      const bytes = jpegAtByteLength(sourceJpeg, maximum);
      const { uploadId } = await f.issue({
        kind,
        byteLength: bytes.length,
        contentType: "image/jpeg",
      });
      await f.put(uploadId, bytes, "image/jpeg");
      const result = await f.storage.finalizeUpload("alice", {
        ...scope,
        uploadId,
      });
      assert.equal(result.image.width, 64);
      assert.equal(result.image.height, 192);
      assert.equal(result.image.contentType, "image/jpeg");
      assert.ok(result.image.byteLength <= projectImageByteLimit(kind));
      assert.equal(f.writes.length, 1);
      const stored = await f.storage.receiptDataUri("alice", {
        ...scope,
        uploadId,
        kind,
      });
      assert.ok(
        Buffer.from(stored.split(",")[1], "base64").length <=
          projectImageByteLimit(kind),
      );
    } finally {
      f.db.close();
    }
  }
});
