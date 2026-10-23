// Local-only visual harness. Never imported by the production runtime.
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { seedControlProjects } from "./control-project-fixtures.ts";
import { seedTeamControls } from "./team-controls-fixtures.ts";
import { seedControlEntries } from "./control-entry-fixtures.ts";
import { join } from "node:path";
import { unstable_dev, getPlatformProxy } from "wrangler";
import { seedLocal } from "./fixtures.ts";
import { seedRichVisual, seedMockupReview } from "./visual-rich-fixtures.ts";
const persistTo = mkdtempSync(join(tmpdir(), "ddehack-visual-"));
process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
process.env.WRANGLER_SEND_METRICS = "false";
const platform = await getPlatformProxy({
  configPath: "dist/server/wrangler.json",
  envFiles: [],
  remoteBindings: false,
  persist: { path: join(persistTo, "v3") },
});
try {
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync("drizzle/" + file, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await platform.env.DB.prepare(sql).all();
  await seedLocal(platform.env.DB);
  // Explicitly synthetic Registered/Locked rows for the table-first screenshot.
  await platform.env.DB.prepare(
    "UPDATE registrations SET status='pending' WHERE email IN ('bob@portal.test','carol@portal.test','dave@portal.test')",
  ).all();
  await platform.env.DB.prepare(
    "INSERT INTO team_locks VALUES('fake_team3','fake_bob','2026-10-23T08:00:00.000Z')",
  ).all();
  // Real imported/persisted social-prefill state, using only reserved synthetic URLs.
  await platform.env.DB.prepare(
    "UPDATE profiles SET socials=?,public=1 WHERE user_id='fake_alice'",
  )
    .bind(
      JSON.stringify([
        "https://github.com/synthetic-alice",
        "https://example.test/alice",
      ]),
    )
    .all();
  if (process.argv.includes("--rich")) await seedRichVisual(platform.env.DB);
  if (process.argv.includes("--mockup-review"))
    await seedMockupReview(platform.env.DB);
  if (process.argv.includes("--control-audit")) {
    if (
      !process.argv.includes("--rich") ||
      !process.argv.includes("--mockup-review")
    )
      throw new Error("Control audit requires the fresh rich mockup fixture");
    await seedControlProjects(platform.env.DB);
    await seedTeamControls(platform.env.DB, {
      scope: "fresh-disposable-local",
    });
    await seedControlEntries(platform.env.DB);
  }
} finally {
  await platform.dispose();
}
const worker = await unstable_dev("dist/server/index.js", {
  config: "dist/server/wrangler.json",
  envFiles: [],
  local: true,
  ip: "127.0.0.1",
  port: 4173,
  inspectorPort: 0,
  logLevel: "error",
  persist: true,
  persistTo,
  vars: { PORTAL_RUNTIME: "sites", PORTAL_TRUST_SITES_DISPATCH: "true" },
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    testMode: true,
    watch: false,
  },
});
let controlManifestPath;
if (process.argv.includes("--control-audit")) {
  const resetToken = randomUUID();
  controlManifestPath = join(
    tmpdir(),
    "ddehack-controls-" + resetToken + ".json",
  );
  writeFileSync(
    controlManifestPath,
    JSON.stringify(
      {
        disposable: true,
        syntheticOnly: true,
        origin: "http://127.0.0.1:4173",
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        worker: createHash("sha256")
          .update(readFileSync("dist/server/index.js"))
          .digest("hex"),
        artifactRoot: process.cwd(),
        project: {
          id: "visual_project_alice",
          slug: "synthetic-alice",
          name: "Small Wonder",
        },
        mutationProject: {
          id: "fake_control_project_00",
          slug: "synthetic-control-00",
        },
        actors: {
          viewer: { id: "fake_stranger", email: "stranger@portal.test" },
          member: { id: "fake_bob", email: "bob@portal.test" },
          leader: { id: "fake_alice", email: "alice@portal.test" },
          nonleader: { id: "fake_review_one", email: "review_one@portal.test" },
          attempt3: { id: "fake_eve", email: "eve@portal.test" },
          firstLeader: {
            id: "fake_first_leader",
            email: "first_leader@portal.test",
          },
        },
        rootConfirmedReset: true,
        resetToken,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
console.log(
  JSON.stringify({
    ready: true,
    url: `http://${worker.address}:${worker.port}`,
    data: "disposable synthetic D1 only",
    productionArtifact: true,
    controlManifestPath,
    richSyntheticStates: process.argv.includes("--rich"),
    mockupReviewStates: process.argv.includes("--mockup-review"),
  }),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.stop();
  rmSync(persistTo, { recursive: true, force: true });
  process.exit(0);
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (s) => {
  if (s.includes("stop")) void stop();
});
process.stdin.resume();
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
