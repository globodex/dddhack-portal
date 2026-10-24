import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const paths = [
  "neon/migrations/0000_compatibility.sql",
  "neon/migrations/0001_portal.sql",
  "neon/migrations/0002_invariants.sql",
  "neon/migrations/0003_transaction_safety.sql",
  "neon/migrations/0004_media_uploads.sql",
  "neon/auth-migrations/0001_auth.sql",
  "neon/auth-migrations/0002_approved_evaluation.sql",
  "neon/migrations/0102_credit_stock.sql",
  "neon/migrations/0103_project_media_limits.sql",
];
const baseline = JSON.parse(
  await readFile(
    root + "/evidence/neon-host-archive/historical-ledger-checksums.json",
    "utf8",
  ),
);
const rows = [];
for (const path of paths) {
  const raw = await readFile(root + "/" + path);
  const blob = spawnSync("git", ["cat-file", "blob", "HEAD:" + path], {
    cwd: root,
  }).stdout;
  rows.push({
    path,
    bytes: raw.length,
    lf: (raw.toString().match(/\n/g) || []).length,
    crlf: (raw.toString().match(/\r\n/g) || []).length,
    sha256: createHash("sha256").update(raw).digest("hex"),
    headBlobEqual: raw.equals(blob),
  });
}
const scratch = await mkdtemp(join(tmpdir(), "ddd-windows-line-probe-"));
try {
  for (const path of [
    ...paths,
    "neon/migration-plan.ts",
    "neon/db/migrate.ts",
    "neon/db/populated-upgrade.ts",
    "neon/scripts/upgrade-populated.ts",
    "evidence/neon-host-archive/historical-ledger-checksums.json",
  ]) {
    await mkdir(dirname(join(scratch, path)), { recursive: true });
    let data = await readFile(join(root, path));
    if (path.endsWith(".sql"))
      data = Buffer.from(data.toString().replace(/\n/g, "\r\n"));
    await writeFile(join(scratch, path), data);
  }
  await writeFile(join(scratch, "package.json"), '{"type":"module"}');
  await symlink(
    root + "/node_modules",
    join(scratch, "node_modules"),
    "junction",
  );
  const lf = (
    await import(pathToFileURL(root + "/neon/migration-plan.ts").href)
  ).loadMigrationPlan;
  const crlf = (
    await import(pathToFileURL(scratch + "/neon/migration-plan.ts").href)
  ).loadMigrationPlan;
  const verify = (
    await import(pathToFileURL(root + "/neon/db/populated-upgrade.ts").href)
  ).verifyUpgradePlan;
  const good = await lf();
  const changed = await crlf();
  let rejected = "";
  try {
    verify(changed, baseline);
  } catch (error: any) {
    rejected = error.code;
  }
  const cli = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(scratch, "neon/scripts/upgrade-populated.ts"),
      "--plan",
    ],
    { cwd: scratch, encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  const report = {
    source: spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim(),
    lf: { count: good.length, digest: verify(good, baseline) },
    crlf: {
      count: changed.length,
      changedChecksums: changed.filter(
        (m: any, i: number) => m.checksum !== good[i].checksum,
      ).length,
      rejected,
    },
    actualCrlfCli: {
      status: cli.status,
      stdout: cli.stdout,
      stderr: cli.stderr,
    },
    sourceFiles: rows,
    databaseConnections: 0,
    sourceModified: false,
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
