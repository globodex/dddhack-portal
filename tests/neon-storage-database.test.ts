import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { batch, one } from "../lib/db";
import { PortalService } from "../lib/service";
import { PortalError } from "../lib/security";
import { publicProjectImage } from "../lib/public-project-image";
import { createMediaDatabase, type MediaObjectStore } from "../neon/storage";
import {
  activate,
  attend,
  setup,
  submission as legacySubmission,
} from "./helpers";
import { fixtures, LOCAL_CREDIT_KEY } from "../scripts/fixtures";

const submission = {
  projectName: legacySubmission.projectName,
  problemSolution: legacySubmission.problemSolution,
  description: legacySubmission.description,
  github: legacySubmission.github,
  commitSha: "",
  demo: "",
  logo: legacySubmission.logo,
  banner: legacySubmission.banner,
  tools: "Codex CLI",
  contributions: [],
  attestation: true,
};

async function fixture() {
  const context = await setup();
  await activate(context.db);
  await attend(context.db, "fake_alice");
  context.clock("2026-11-01T04:30:00.000Z");
  const objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string; contentLength: number }
  >();
  let writes = 0,
    reads = 0;
  const store: MediaObjectStore = {
    async signPut() {
      throw new Error("not used");
    },
    async read(bucket, key, limit) {
      assert.equal(bucket, "project-media");
      assert.equal(limit, 131072);
      reads++;
      const object = objects.get(key);
      assert.ok(object);
      return object;
    },
    async write(bucket, key, image) {
      assert.equal(bucket, "project-media");
      writes++;
      objects.set(key, {
        bytes: image.bytes,
        contentType: image.contentType,
        contentLength: image.byteLength,
      });
    },
  };
  const db = createMediaDatabase(context.db, { objectStore: store });
  const service = new PortalService(
    db,
    fixtures.alice,
    LOCAL_CREDIT_KEY,
    () => "2026-11-01T04:30:00.000Z",
  );
  return {
    ...context,
    wrapped: db,
    service,
    objects,
    store,
    writes: () => writes,
    reads: () => reads,
  };
}

test("existing submit-project persists private references and reads return identical original image data URIs", async () => {
  const f = await fixture();
  try {
    const committed = (await f.service.command("submit-project", {
      revision: 0,
      project: submission,
    })) as { projectId: string; versionId: string };
    assert.ok(committed.versionId);
    assert.equal(
      f.writes(),
      2,
      "draft and committed version share writes within one transaction",
    );
    const raw = (await one<{ payload: string }>(
      f.db,
      "SELECT payload FROM submission_versions WHERE id=?",
      committed.versionId,
    ))!;
    const payload = JSON.parse(raw.payload);
    assert.equal(payload.logo.storage, "neon-project-media");
    assert.equal(payload.logo.kind, "logo");
    assert.equal(payload.banner.kind, "banner");
    assert.equal(payload.logo.bucket, "project-media");
    assert.ok(!raw.payload.includes("base64"));
    assert.equal(
      payload.logo.sha256,
      createHash("sha256")
        .update(Buffer.from(submission.logo.split(",")[1], "base64"))
        .digest("hex"),
    );
    const restored = JSON.parse(
      (await one<{ payload: string }>(
        f.wrapped,
        "SELECT payload FROM submission_versions WHERE id=?",
        committed.versionId,
      ))!.payload,
    );
    assert.equal(restored.logo, submission.logo);
    assert.equal(restored.banner, submission.banner);
    const draft = JSON.parse(
      (await one<{ draft: string }>(
        f.wrapped,
        "SELECT draft FROM projects WHERE id=?",
        committed.projectId,
      ))!.draft,
    );
    assert.equal(draft.logo, submission.logo);
    assert.equal(draft.banner, submission.banner);
    const repeated = (await f.service.command("submit-project", {
      revision: 0,
      project: submission,
    })) as { versionId: string };
    assert.equal(repeated.versionId, committed.versionId);
    assert.equal(f.writes(), 2, "request idempotency remains unchanged");
  } finally {
    f.db.close();
  }
});

test("authorized public image query rehydrates eligible images, and ineligible images cause no object fetch", async () => {
  const f = await fixture();
  try {
    const committed = (await f.service.command("submit-project", {
      revision: 0,
      project: submission,
    })) as { projectId: string; versionId: string };
    const before = f.reads();
    await assert.rejects(
      publicProjectImage(
        f.wrapped,
        committed.projectId,
        "logo",
        committed.versionId,
      ),
    );
    assert.equal(
      f.reads(),
      before,
      "SQL authorization runs before fetching private bytes",
    );
    await f.db
      .prepare(
        `INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at)
      VALUES(?,?,'eligible','Synthetic local test','fake_admin','2026-11-01T04:30:01.000Z')`,
      )
      .bind(committed.projectId, committed.versionId)
      .all();
    const response = await publicProjectImage(
      f.wrapped,
      committed.projectId,
      "logo",
      committed.versionId,
    );
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy")!, /sandbox/);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from(submission.logo.split(",")[1], "base64"),
    );
  } finally {
    f.db.close();
  }
});

test("existing draft updates externalize new images and preserve nonmedia fields", async () => {
  const f = await fixture();
  try {
    await f.service.command("save-project", {
      revision: 0,
      project: submission,
    });
    const next = {
      ...submission,
      description: "A synthetic changed description.",
    };
    await f.service.command("save-project", { revision: 1, project: next });
    const raw = JSON.parse(
      (await one<{ draft: string }>(
        f.db,
        "SELECT draft FROM projects WHERE team_id='fake_team1'",
      ))!.draft,
    );
    assert.equal(raw.logo.storage, "neon-project-media");
    const restored = JSON.parse(
      (await one<{ draft: string }>(
        f.wrapped,
        "SELECT draft FROM projects WHERE team_id='fake_team1'",
      ))!.draft,
    );
    assert.equal(restored.description, next.description);
    assert.equal(restored.logo, submission.logo);
  } finally {
    f.db.close();
  }
});

test("object write failure prevents project transaction and audit from committing", async () => {
  const f = await fixture();
  try {
    f.store.write = async () => {
      throw new Error("synthetic storage outage");
    };
    await assert.rejects(
      f.service.command("submit-project", { revision: 0, project: submission }),
    );
    assert.equal(
      await one(f.db, "SELECT id FROM projects WHERE team_id='fake_team1'"),
      undefined,
    );
    assert.equal(
      await one(
        f.db,
        "SELECT id FROM submission_versions WHERE team_id='fake_team1'",
      ),
      undefined,
    );
    assert.equal(
      await one(
        f.db,
        "SELECT id FROM audit_logs WHERE action='submit-project'",
      ),
      undefined,
    );
  } finally {
    f.db.close();
  }
});

test("raw reference injection and unknown write forms fail before storage operations", async () => {
  const f = await fixture();
  try {
    const insert =
      "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES(?,?,?,?,?)";
    await assert.rejects(
      f.wrapped
        .prepare(insert)
        .bind(
          "project",
          "fake_team1",
          "synthetic",
          JSON.stringify({
            logo: { storage: "neon-project-media", key: "another-team-object" },
          }),
          "2026-11-01T04:30:00.000Z",
        )
        .all(),
      (error) =>
        error instanceof PortalError && error.code === "INVALID_MEDIA_PAYLOAD",
    );
    await assert.rejects(
      f.wrapped
        .prepare(
          "INSERT OR REPLACE INTO projects(id,team_id,slug,draft,updated_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          "project",
          "fake_team1",
          "synthetic",
          JSON.stringify(submission),
          "2026-11-01T04:30:00.000Z",
        )
        .all(),
      (error) =>
        error instanceof PortalError &&
        error.code === "UNSUPPORTED_MEDIA_WRITE",
    );
    assert.equal(f.writes(), 0);
  } finally {
    f.db.close();
  }
});

test("a tampered object, bucket, key or reference metadata fails closed during hydration", async () => {
  const f = await fixture();
  try {
    await f.service.command("save-project", {
      revision: 0,
      project: submission,
    });
    const row = (await one<{ draft: string }>(
      f.db,
      "SELECT draft FROM projects WHERE team_id='fake_team1'",
    ))!;
    const original = JSON.parse(row.draft);
    for (const change of [
      { bucket: "other-bucket" },
      { key: "../../secret" },
      { width: 65 },
      { sha256: "f".repeat(64) },
    ]) {
      await f.db
        .prepare("UPDATE projects SET draft=? WHERE team_id='fake_team1'")
        .bind(
          JSON.stringify({
            ...original,
            logo: { ...original.logo, ...change },
          }),
        )
        .all();
      await assert.rejects(
        one(f.wrapped, "SELECT draft FROM projects WHERE team_id='fake_team1'"),
      );
    }
    await f.db
      .prepare("UPDATE projects SET draft=? WHERE team_id='fake_team1'")
      .bind(row.draft)
      .all();
    const object = f.objects.get(original.logo.key)!;
    const altered = Uint8Array.from(object.bytes);
    altered[44] ^= 1;
    f.objects.set(original.logo.key, { ...object, bytes: altered });
    await assert.rejects(
      one(f.wrapped, "SELECT draft FROM projects WHERE team_id='fake_team1'"),
      (error) =>
        error instanceof PortalError && error.code === "STORED_IMAGE_CHANGED",
    );
  } finally {
    f.db.close();
  }
});

test("legacy inline payloads and unrelated payload queries remain readable without object fetch", async () => {
  const f = await fixture();
  try {
    await batch(f.db, [
      [
        "INSERT INTO projects(id,team_id,slug,draft,updated_at) VALUES(?,?,?,?,?)",
        "project",
        "fake_team1",
        "synthetic",
        JSON.stringify(submission),
        "2026-11-01T04:30:00.000Z",
      ],
    ]);
    const row = await one<{ draft: string }>(
      f.wrapped,
      "SELECT draft FROM projects WHERE team_id='fake_team1'",
    );
    assert.equal(row!.draft, JSON.stringify(submission));
    assert.equal(f.reads(), 0);
    assert.equal(f.writes(), 0);
  } finally {
    f.db.close();
  }
});
