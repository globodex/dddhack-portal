import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { batch, one } from "../lib/db";
import { PortalService } from "../lib/service";
import { PortalError } from "../lib/security";
import { publicProjectImage } from "../lib/public-project-image";
import {
  createMediaDatabase,
  validatePublishedProjectMedia,
  type MediaObjectStore,
} from "../neon/storage";
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

test("public list metadata validates 1000 projected rows without fetching any objects", async () => {
  const f = await fixture();
  try {
    const committed = (await f.service.command("submit-project", {
      revision: 0,
      project: submission,
    })) as { projectId: string; versionId: string };
    const before = f.reads();
    const result = await f.wrapped
      .prepare(
        `WITH RECURSIVE copies(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM copies WHERE n<1000)
      SELECT v.payload AS public_media_payload,v.team_id FROM submission_versions v CROSS JOIN copies WHERE v.id=?`,
      )
      .bind(committed.versionId)
      .all<{ public_media_payload: string; team_id: string }>();
    assert.equal(result.results.length, 1000);
    for (const row of result.results) {
      const payload = JSON.parse(row.public_media_payload);
      assert.deepEqual(
        validatePublishedProjectMedia(payload.logo, "logo", row.team_id),
        { width: 64, height: 64 },
      );
      assert.deepEqual(
        validatePublishedProjectMedia(payload.banner, "banner", row.team_id),
        { width: 160, height: 90 },
      );
    }
    assert.equal(f.reads(), before);
  } finally {
    f.db.close();
  }
});

test("selective published image projection fetches exactly one raster after eligibility and version checks", async () => {
  const f = await fixture();
  try {
    const committed = (await f.service.command("submit-project", {
      revision: 0,
      project: submission,
    })) as { projectId: string; versionId: string };
    const select = (kind: "logo" | "banner", version = committed.versionId) =>
      one<{ project_image_value: string }>(
        f.wrapped,
        `SELECT json_extract(v.payload,'$.${kind}') AS project_image_value,v.team_id AS project_image_team_id,'${kind}' AS project_image_kind
       FROM projects p JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id
       WHERE NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='project' AND rr.target_id=p.id) OR (rr.kind='submission' AND rr.target_id=v.id)))
       AND p.id=? AND p.published_version_id=? AND COALESCE((SELECT e.status FROM project_eligibility e WHERE e.project_id=p.id AND e.version_id=v.id),
       (SELECT r.eligibility FROM reviews r WHERE r.team_id=p.team_id AND r.version_id=v.id),'needs_review')='eligible'`,
        committed.projectId,
        version,
      );
    const before = f.reads();
    assert.equal(await select("logo"), undefined);
    assert.equal(f.reads(), before);
    await f.db
      .prepare(
        `INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at)
      VALUES(?,?,'eligible','Synthetic local test','fake_admin','2026-11-01T04:30:01.000Z')`,
      )
      .bind(committed.projectId, committed.versionId)
      .all();
    assert.equal((await select("logo"))!.project_image_value, submission.logo);
    assert.equal(f.reads(), before + 1, "logo response does not fetch banner");
    assert.equal(
      (await select("banner"))!.project_image_value,
      submission.banner,
    );
    assert.equal(f.reads(), before + 2);
    assert.equal(await select("logo", "wrong-version"), undefined);
    assert.equal(f.reads(), before + 2);
    const raw = JSON.parse(
      (await one<{ payload: string }>(
        f.db,
        "SELECT payload FROM submission_versions WHERE id=?",
        committed.versionId,
      ))!.payload,
    );
    const object = f.objects.get(raw.logo.key)!;
    const altered = Uint8Array.from(object.bytes);
    altered[44] ^= 1;
    f.objects.set(raw.logo.key, { ...object, bytes: altered });
    await assert.rejects(
      select("logo"),
      (error) =>
        error instanceof PortalError && error.code === "STORED_IMAGE_CHANGED",
    );
  } finally {
    f.db.close();
  }
});

test("public media metadata rejects foreign namespaces, malformed shapes, wrong kinds and inline invalid images", async () => {
  const f = await fixture();
  try {
    await f.service.command("save-project", {
      revision: 0,
      project: submission,
    });
    const raw = JSON.parse(
      (await one<{ draft: string }>(
        f.db,
        "SELECT draft FROM projects WHERE team_id='fake_team1'",
      ))!.draft,
    );
    const ref = raw.logo;
    for (const change of [
      { bucket: "other-bucket" },
      { key: "../../secret" },
      { sha256: "f".repeat(64) },
      { width: 65 },
      { byteLength: 131073 },
      { contentType: "image/svg+xml" },
      { extra: true },
    ]) {
      assert.throws(() =>
        validatePublishedProjectMedia(
          { ...ref, ...change },
          "logo",
          "fake_team1",
        ),
      );
    }
    assert.throws(() =>
      validatePublishedProjectMedia(ref, "logo", "fake_team3"),
    );
    assert.throws(() =>
      validatePublishedProjectMedia(ref, "banner", "fake_team1"),
    );
    assert.throws(() =>
      validatePublishedProjectMedia(
        "https://evil.test/image.png",
        "logo",
        "fake_team1",
      ),
    );
    assert.deepEqual(
      validatePublishedProjectMedia(submission.logo, "logo", "fake_team1"),
      { width: 64, height: 64 },
    );
    assert.equal(f.reads(), 0);
  } finally {
    f.db.close();
  }
});
