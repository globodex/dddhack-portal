import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMigrationPlan } from "../neon/migration-plan";
import { verifyUpgradePlan } from "../neon/db/populated-upgrade";

const root = fileURLToPath(new URL("../", import.meta.url));
const approvalPath =
  "evidence/neon-host-archive/historical-ledger-checksums.json";
const baseline = JSON.parse(readFileSync(join(root, approvalPath), "utf8"));
const expectedDigest =
  "498280b69647485b4f55c35331a0f8af486983d819ee2dc25fb1840f1e657506";
const sqlPaths = [
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
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const actor = {
  GIT_AUTHOR_NAME: "Parampreet Singh",
  GIT_AUTHOR_EMAIL: "rubercuber.30@gmail.com",
  GIT_COMMITTER_NAME: "Parampreet Singh",
  GIT_COMMITTER_EMAIL: "rubercuber.30@gmail.com",
};
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    env: { ...process.env, ...actor },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "ddd-windows-migration-independent-"));
  const files = git(root, "ls-files", "-z", "neon").split("\0").filter(Boolean);
  for (const path of [
    ...files,
    approvalPath,
    ".gitignore",
    "package.json",
    ...(existsSync(join(root, "scripts/verify-migration-checkout.mjs"))
      ? ["scripts/verify-migration-checkout.mjs"]
      : []),
    ...(existsSync(join(root, ".gitattributes")) ? [".gitattributes"] : []),
  ]) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), readFileSync(join(root, path)));
  }
  writeFileSync(
    join(cwd, "UNRELATED.txt"),
    "Unrelated local file must remain unchanged\n",
  );
  git(cwd, "init", "-q", "--initial-branch=audit-fixture");
  git(cwd, "config", "core.autocrlf", "false");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "Synthetic migration source fixture");
  symlinkSync(
    join(root, "node_modules"),
    join(cwd, "node_modules"),
    "junction",
  );
  return { cwd, close: () => rmSync(cwd, { recursive: true, force: true }) };
}
function cli(cwd: string, relative: string, args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", join(cwd, relative), ...args],
    { cwd, encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" }, timeout: 15000 },
  );
}
async function planAt(cwd: string) {
  const module = await import(
    pathToFileURL(join(cwd, "neon/migration-plan.ts")).href
  );
  return module.loadMigrationPlan() as ReturnType<typeof loadMigrationPlan>;
}
function crlf(cwd: string) {
  for (const path of sqlPaths)
    writeFileSync(
      join(cwd, path),
      readFileSync(join(cwd, path), "utf8").replace(/\r?\n/g, "\r\n"),
    );
}

test("independent Windows source: approved LF plan is nine exact HEAD blobs and keeps the published digest", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 9);
  assert.equal(verifyUpgradePlan(plan, baseline), expectedDigest);
  assert.deepEqual(
    plan.map(({ name, checksum }) => ({ name, checksum })),
    [...baseline.historical, ...baseline.pendingFeatureMigrations],
  );
  for (const path of sqlPaths) {
    const source = readFileSync(join(root, path));
    const committed = spawnSync("git", ["cat-file", "blob", "HEAD:" + path], {
      cwd: root,
    });
    assert.equal(committed.status, 0);
    assert.ok(source.equals(committed.stdout), path);
    assert.equal(source.includes(Buffer.from("\r\n")), false, path);
  }
});

test("independent Windows repair: check is read-only, exact CRLF repair preserves HEAD/index/approval and recovers the strict source plan", async () => {
  const f = fixture();
  try {
    crlf(f.cwd);
    const head = git(f.cwd, "rev-parse", "HEAD");
    const index = readFileSync(join(f.cwd, ".git/index"));
    const approved = readFileSync(join(f.cwd, approvalPath));
    const sourceBefore = sqlPaths.map((path) =>
      readFileSync(join(f.cwd, path)),
    );
    const check = cli(f.cwd, "scripts/verify-migration-checkout.mjs", [
      "--check",
    ]);
    assert.equal(check.status, 2, check.stderr);
    const checked = JSON.parse(check.stdout);
    assert.equal(checked.repairNeeded, true);
    assert.equal(checked.sourceFiles, 9);
    assert.equal(checked.databaseConnected, false);
    assert.deepEqual(
      sqlPaths.map((path) => readFileSync(join(f.cwd, path))),
      sourceBefore,
    );
    const repair = cli(f.cwd, "scripts/verify-migration-checkout.mjs", [
      "--repair-line-endings",
    ]);
    assert.equal(repair.status, 0, repair.stderr);
    const result = JSON.parse(repair.stdout);
    assert.equal(result.planDigest, expectedDigest);
    assert.deepEqual(result.repaired, sqlPaths);
    assert.equal(result.gitIndexChanged, false);
    assert.equal(result.databaseConnected, false);
    assert.equal(git(f.cwd, "rev-parse", "HEAD"), head);
    assert.ok(readFileSync(join(f.cwd, ".git/index")).equals(index));
    assert.ok(readFileSync(join(f.cwd, approvalPath)).equals(approved));
    assert.equal(
      readFileSync(join(f.cwd, "UNRELATED.txt"), "utf8"),
      "Unrelated local file must remain unchanged\n",
    );
    for (const path of sqlPaths)
      assert.ok(
        readFileSync(join(f.cwd, path)).equals(
          Buffer.from(git(f.cwd, "show", "HEAD:" + path)),
        ),
        path,
      );
    assert.equal(
      verifyUpgradePlan(await planAt(f.cwd), baseline),
      expectedDigest,
    );
    const sourcePlan = cli(f.cwd, "neon/scripts/upgrade-populated.ts", [
      "--plan",
    ]);
    assert.equal(sourcePlan.status, 0, sourcePlan.stderr);
    assert.equal(JSON.parse(sourcePlan.stdout).planDigest, expectedDigest);
    const repeated = cli(f.cwd, "scripts/verify-migration-checkout.mjs", [
      "--repair-line-endings",
    ]);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.deepEqual(JSON.parse(repeated.stdout).repaired, []);
  } finally {
    f.close();
  }
});

test("independent Windows repair: edits, BOM, changed HEAD/index/approval and unexpected file sets refuse before any SQL write", async () => {
  const cases = [
    ["literal", "MIGRATION_SOURCE_CONTENT_CHANGED"],
    ["bom", "MIGRATION_SOURCE_CONTENT_CHANGED"],
    ["head", "MIGRATION_HEAD_BYTES_CHANGED"],
    ["index", "MIGRATION_INDEX_CHANGED"],
    ["approval", "MIGRATION_APPROVED_PLAN_CHANGED"],
    ["extra", "MIGRATION_SOURCE_FILE_SET_CHANGED"],
    ["missing", "MIGRATION_SOURCE_FILE_SET_CHANGED"],
  ] as const;
  for (const [kind, code] of cases) {
    const f = fixture();
    try {
      crlf(f.cwd);
      const last = sqlPaths.at(-1)!;
      const path = join(f.cwd, last),
        unchangedLast = readFileSync(path);
      if (["literal", "head", "index"].includes(kind))
        writeFileSync(
          path,
          Buffer.concat([
            unchangedLast,
            Buffer.from("\r\n-- Deliberate local SQL edit\r\n"),
          ]),
        );
      if (kind === "bom")
        writeFileSync(
          path,
          Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), unchangedLast]),
        );
      if (kind === "head" || kind === "index") git(f.cwd, "add", last);
      if (kind === "head")
        git(f.cwd, "commit", "-qm", "Synthetic unapproved HEAD source edit");
      if (kind === "index") writeFileSync(path, unchangedLast);
      if (kind === "approval") {
        const changed = structuredClone(baseline);
        changed.historical[0].checksum = "0".repeat(64);
        writeFileSync(join(f.cwd, approvalPath), JSON.stringify(changed));
      }
      if (kind === "extra")
        writeFileSync(
          join(f.cwd, "neon/migrations/0005_unreviewed.sql"),
          "SELECT 1;\n",
        );
      if (kind === "missing") rmSync(path);
      const before = sqlPaths.map((file) =>
        existsSync(join(f.cwd, file)) ? readFileSync(join(f.cwd, file)) : null,
      );
      const head = git(f.cwd, "rev-parse", "HEAD"),
        index = readFileSync(join(f.cwd, ".git/index"));
      const result = cli(f.cwd, "scripts/verify-migration-checkout.mjs", [
        "--repair-line-endings",
      ]);
      assert.equal(result.status, 1, kind + result.stderr);
      assert.equal(JSON.parse(result.stderr).code, code, kind);
      assert.equal(result.stdout, "", kind);
      assert.deepEqual(
        sqlPaths.map((file) =>
          existsSync(join(f.cwd, file))
            ? readFileSync(join(f.cwd, file))
            : null,
        ),
        before,
        kind + " cannot partially rewrite earlier CRLF files",
      );
      assert.equal(git(f.cwd, "rev-parse", "HEAD"), head);
      assert.ok(readFileSync(join(f.cwd, ".git/index")).equals(index));
      assert.equal(
        readFileSync(join(f.cwd, "UNRELATED.txt"), "utf8"),
        "Unrelated local file must remain unchanged\n",
      );
    } finally {
      f.close();
    }
  }
});

test("independent Windows source: actual CRLF loader and offline CLI reject; strict checker never normalizes bytes", async () => {
  const f = fixture();
  try {
    const before = await planAt(f.cwd);
    assert.equal(verifyUpgradePlan(before, baseline), expectedDigest);
    crlf(f.cwd);
    const changed = await planAt(f.cwd);
    assert.equal(changed.length, 9);
    assert.equal(
      changed.filter((item, i) => item.checksum !== before[i].checksum).length,
      9,
    );
    assert.throws(() => verifyUpgradePlan(changed, baseline), {
      code: "UPGRADE_SOURCE_PLAN_MISMATCH",
    });
    const result = cli(f.cwd, "neon/scripts/upgrade-populated.ts", ["--plan"]);
    assert.equal(result.status, 1);
    assert.equal(
      JSON.parse(result.stderr).code,
      "UPGRADE_SOURCE_PLAN_MISMATCH",
    );
    assert.equal(result.stdout, "");
    for (const path of sqlPaths)
      assert.ok(readFileSync(join(f.cwd, path)).includes(Buffer.from("\r\n")));
  } finally {
    f.close();
  }
});

test("independent Windows source: missing, extra, reordered, BOM and literal-edit plans still stop strictly", async () => {
  const plan = await loadMigrationPlan();
  const bad = [
    plan.slice(1),
    [
      ...plan,
      {
        name: "0104_unapproved.sql",
        sql: "SELECT 1;\n",
        checksum: sha("SELECT 1;\n"),
      },
    ],
    [...plan].reverse(),
  ];
  for (const sql of [
    "\ufeff" + plan[0].sql,
    plan[0].sql + "\n-- A local SQL edit must not be discarded\n",
  ])
    bad.push(
      plan.map((item, i) => (i ? item : { ...item, sql, checksum: sha(sql) })),
    );
  for (const changed of bad)
    assert.throws(() => verifyUpgradePlan(changed, baseline), {
      code: "UPGRADE_SOURCE_PLAN_MISMATCH",
    });
});

test("independent Windows checkout: autocrlf=true still checks out only the nine pinned migration paths as canonical LF", () => {
  const f = fixture();
  try {
    assert.ok(
      existsSync(join(f.cwd, ".gitattributes")),
      "Nine source SQL paths need committed LF attributes",
    );
    const control = "db/migrations/unpinned_test.sql";
    mkdirSync(dirname(join(f.cwd, control)), { recursive: true });
    writeFileSync(join(f.cwd, control), "SELECT 1;\n");
    git(f.cwd, "add", control);
    git(f.cwd, "commit", "-qm", "Synthetic unpinned checkout control");
    git(f.cwd, "config", "core.autocrlf", "true");
    git(f.cwd, "config", "core.eol", "crlf");
    for (const path of [...sqlPaths, control]) rmSync(join(f.cwd, path));
    git(f.cwd, "checkout-index", "--all", "--force");
    for (const path of sqlPaths) {
      const bytes = readFileSync(join(f.cwd, path));
      assert.equal(bytes.includes(Buffer.from("\r\n")), false, path);
      assert.equal(
        sha(bytes),
        sha(Buffer.from(git(f.cwd, "show", "HEAD:" + path))),
      );
    }
    assert.match(
      git(f.cwd, "check-attr", "eol", "--", control),
      /eol: unspecified/,
    );
    assert.ok(
      readFileSync(join(f.cwd, control)).includes(Buffer.from("\r\n")),
      "Unrelated SQL follows the fixture's CRLF setting",
    );
  } finally {
    f.close();
  }
});
