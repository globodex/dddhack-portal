import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  inspectProjectImageBytes as preflight,
  ProjectImageValidationError,
} from "../lib/project-image-preflight";
import { validateProjectImage } from "../lib/project-media";
import {
  projectMediaPolicy,
  projectImageByteLimit,
} from "../lib/project-media-policy";
import { validateUploadedImage } from "../neon/storage/image";
import { PortalError } from "../lib/security";
import { handlePortal } from "../lib/http";
import { setup, activate, attend, submission } from "./helpers";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { one } from "../lib/db";
import { syntheticImage, jpegAtByteLength } from "./fixture-images";

const png = (w: number, h: number) =>
  Buffer.from(syntheticImage(w, h).split(",")[1], "base64");
const uri = (bytes: Uint8Array, type = "image/png") =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const code = (expected: string) => (error: unknown) =>
  error instanceof PortalError && error.code === expected;

function noise(width: number, height: number, channels = 4) {
  const data = Buffer.alloc(width * height * channels);
  let seed = 0x12345678;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = seed & 255;
  }
  return sharp(data, { raw: { width, height, channels: channels as 3 | 4 } })
    .png()
    .toBuffer();
}

test("pure preflight and full raster validation accept any aspect and preserve transparent thin images", async () => {
  for (const kind of ["logo", "banner"] as const) {
    for (const [width, height] of [
      [64, 128],
      [128, 128],
      [4096, 64],
      [64, 4096],
    ]) {
      const source = png(width, height);
      assert.deepEqual(preflight(source, "image/png", kind), { width, height });
      const image = await validateUploadedImage(source, "image/png", kind);
      assert.ok(image.byteLength <= projectImageByteLimit(kind));
      assert.ok(
        Math.abs(image.width / image.height - width / height) <=
          Math.max(1 / image.height, width / height / image.height),
      );
      assert.ok(
        Math.max(image.width, image.height) <=
          projectMediaPolicy[kind].optimizationMaxEdge,
      );
      validateProjectImage(uri(image.bytes), kind);
    }
    const transparent = await sharp({
      create: {
        width: 640,
        height: 240,
        channels: 4,
        background: { r: 240, g: 40, b: 20, alpha: 0.25 },
      },
    })
      .png()
      .toBuffer();
    const result = await validateUploadedImage(transparent, "image/png", kind);
    const pixels = await sharp(result.bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(pixels.info.channels, 4);
    assert.ok(pixels.data[3] >= 63 && pixels.data[3] <= 64);
    assert.ok(Math.abs(result.width / result.height - 640 / 240) < 0.01);
  }
});

test("original decimal1MB/5MB boundaries fully decode and become bounded web images", async () => {
  const jpeg = await sharp({
    create: { width: 64, height: 128, channels: 3, background: "teal" },
  })
    .jpeg()
    .toBuffer();
  for (const kind of ["logo", "banner"] as const) {
    const maximum = projectImageByteLimit(kind, "source");
    const source = jpegAtByteLength(jpeg, maximum);
    assert.equal(source.length, maximum);
    assert.deepEqual(preflight(source, "image/jpeg", kind), {
      width: 64,
      height: 128,
    });
    const image = await validateUploadedImage(source, "image/jpeg", kind);
    assert.ok(
      image.byteLength < 10_000,
      "metadata is stripped from signed source uploads",
    );
    await assert.rejects(
      validateUploadedImage(
        jpegAtByteLength(jpeg, maximum + 1),
        "image/jpeg",
        kind,
      ),
      code("IMAGE_SIZE"),
    );
    assert.throws(
      () => preflight(jpegAtByteLength(jpeg, maximum + 1), "image/jpeg", kind),
      (error) =>
        error instanceof ProjectImageValidationError &&
        error.code === "IMAGE_SIZE",
    );
  }
});

test("high entropy alpha inputs stay within canonical budget without changing MIME or cropping", async () => {
  for (const [kind, size] of [
    ["logo", 480],
    ["banner", 1024],
  ] as const) {
    const source = await noise(size, size);
    assert.ok(source.length < projectImageByteLimit(kind, "source"));
    assert.ok(source.length > projectImageByteLimit(kind));
    const result = await validateUploadedImage(source, "image/png", kind);
    assert.equal(result.contentType, "image/png");
    assert.equal(result.width, result.height);
    assert.ok(result.byteLength <= projectImageByteLimit(kind));
    assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
    await assert.rejects(
      validateUploadedImage(source, "image/png", kind, {
        preserveOriginal: true,
      }),
      code("IMAGE_SIZE"),
    );
  }
});

test("spoofed MIME, malformed chunks, corrupt raster, oversized dimensions and original thin edges are rejected", async () => {
  const valid = png(64, 64);
  assert.throws(() => preflight(valid, "image/svg+xml", "logo"));
  assert.throws(() => preflight(valid, "image/jpeg", "logo"));
  assert.throws(() => preflight(png(63, 64), "image/png", "logo"));
  assert.throws(() => preflight(png(4097, 64), "image/png", "banner"));
  assert.throws(() =>
    preflight(Buffer.concat([valid, Buffer.from([0])]), "image/png", "banner"),
  );
  const corrupt = Buffer.from(valid);
  corrupt[45] ^= 255;
  await assert.rejects(
    validateUploadedImage(corrupt, "image/png", "logo"),
    code("INVALID_RASTER_IMAGE"),
  );
  const impossibleChunk = Buffer.from(valid);
  impossibleChunk.writeUInt32BE(0xffffffff, 8);
  assert.throws(() => preflight(impossibleChunk, "image/png", "logo"));
  const thin = png(512, 8);
  assert.throws(() => preflight(thin, "image/png", "logo"));
  assert.deepEqual(preflight(thin, "image/png", "logo", "canonical"), {
    width: 512,
    height: 8,
  });
  await validateUploadedImage(thin, "image/png", "logo", {
    preserveOriginal: true,
  });
});

test("only project commands get the bounded1MB JSON envelope and persisted canonical bytes remain identical", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T04:30:00.000Z"),
  });
  const f = await setup();
  try {
    await activate(f.db);
    await attend(f.db, "fake_alice");
    const jpeg = await sharp({
      create: { width: 64, height: 128, channels: 3, background: "teal" },
    })
      .jpeg()
      .toBuffer();
    const project = {
      projectName: submission.projectName,
      problemSolution: submission.problemSolution,
      description: submission.description,
      github: submission.github,
      demo: "",
      tools: "Codex CLI",
      attestation: true,
      logo: uri(
        jpegAtByteLength(jpeg, projectImageByteLimit("logo")),
        "image/jpeg",
      ),
      banner: uri(
        jpegAtByteLength(jpeg, projectImageByteLimit("banner")),
        "image/jpeg",
      ),
    };
    const request = (body: string) =>
      new Request("http://portal.test/api/portal", {
        method: "POST",
        headers: {
          origin: "http://portal.test",
          "content-type": "application/json",
        },
        body,
      });
    const runtime = {
      db: f.db,
      identity: fixtures.alice,
      key: LOCAL_CREDIT_KEY,
    };
    const body = JSON.stringify({
      action: "save-project",
      data: { revision: 0, project },
    });
    assert.ok(
      Buffer.byteLength(body) > 600_000 && Buffer.byteLength(body) < 1_000_000,
    );

    const saved = await handlePortal(request(body), runtime);
    assert.equal(saved.status, 200, await saved.clone().text());
    const row = await one<{ draft: string }>(
      f.db,
      "SELECT draft FROM projects WHERE team_id='fake_team1'",
    );
    assert.equal(JSON.parse(row!.draft).banner, project.banner);
    const ordinary = await handlePortal(
      request(
        JSON.stringify({
          action: "profile",
          data: { padding: "x".repeat(600_000) },
        }),
      ),
      runtime,
    );
    assert.equal(ordinary.status, 413);
    assert.equal(
      ((await ordinary.json()) as { code: string }).code,
      "BODY_TOO_LARGE",
    );
    const oversized = await handlePortal(
      request(
        JSON.stringify({
          action: "save-project",
          data: { padding: "x".repeat(1_000_000) },
        }),
      ),
      runtime,
    );
    assert.equal(oversized.status, 413);
    const malformed = await handlePortal(
      request("{" + "x".repeat(610_000)),
      runtime,
    );
    assert.equal(malformed.status, 422);
  } finally {
    f.db.close();
  }
});
