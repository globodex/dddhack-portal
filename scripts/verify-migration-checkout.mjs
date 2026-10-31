import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const approvedDigest = '7237ebe292938f17c8e51373b700cc12e4e8ce01f611e329ba76fc140305c92c';
const sources = [
  ['0000_compatibility.sql', 'neon/migrations/0000_compatibility.sql'],
  ['0001_portal.sql', 'neon/migrations/0001_portal.sql'],
  ['0002_invariants.sql', 'neon/migrations/0002_invariants.sql'],
  ['0003_transaction_safety.sql', 'neon/migrations/0003_transaction_safety.sql'],
  ['0004_media_uploads.sql', 'neon/migrations/0004_media_uploads.sql'],
  ['0100_auth.sql', 'neon/auth-migrations/0001_auth.sql'],
  ['0101_approved_evaluation.sql', 'neon/auth-migrations/0002_approved_evaluation.sql'],
  ['0102_credit_stock.sql', 'neon/migrations/0102_credit_stock.sql'],
  ['0103_project_media_limits.sql', 'neon/migrations/0103_project_media_limits.sql'],
  ['0104_admin_team_corrections.sql', 'neon/migrations/0104_admin_team_corrections.sql'],
  ['0105_terminal_record_deletion.sql', 'neon/migrations/0105_terminal_record_deletion.sql'],
  ['0106_admin_team_unlock.sql', 'neon/migrations/0106_admin_team_unlock.sql'],
  ['0107_admin_team_lock.sql', 'neon/migrations/0107_admin_team_lock.sql'],
  ['0108_admin_testing_and_team_corrections.sql', 'neon/migrations/0108_admin_testing_and_team_corrections.sql'],
  ['0109_owner_ai_model_usage.sql', 'neon/migrations/0109_owner_ai_model_usage.sql'],
  ['0110_admin_submission_access.sql', 'neon/migrations/0110_admin_submission_access.sql'],
  ['0111_admin_missing_team_idea.sql', 'neon/migrations/0111_admin_missing_team_idea.sql'],
  ['0112_continuous_engagement.sql', 'neon/migrations/0112_continuous_engagement.sql'],
  ['0113_submission_vote_window.sql', 'neon/migrations/0113_submission_vote_window.sql'],
  ['0114_post_submission_feedback.sql', 'neon/migrations/0114_post_submission_feedback.sql'],
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, file) => { throw Object.assign(new Error(code), { code, ...(file ? { file } : {}) }); };
const normalizeCRLF = bytes => Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');

/** Local files/Git only. Never reads an env file, connects to a DB, or changes the index. */
export function verifyMigrationCheckout(root, { repairLineEndings = false } = {}) {
  const baseline = JSON.parse(readFileSync(resolve(root, 'evidence/neon-host-archive/historical-ledger-checksums.json'), 'utf8'));
  const approved = [...baseline.historical, ...baseline.pendingFeatureMigrations].map(({ name, checksum }) => ({ name, checksum }));
  if (sha(JSON.stringify(approved)) !== approvedDigest || approved.map(x => x.name).join('\n') !== sources.map(x => x[0]).join('\n')) fail('MIGRATION_APPROVED_PLAN_CHANGED');
  for (const directory of ['neon/migrations', 'neon/auth-migrations']) {
    const expected = sources.filter(x => x[1].startsWith(directory + '/')).map(x => x[1].slice(directory.length + 1)).sort();
    const actual = readdirSync(resolve(root, directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) fail('MIGRATION_SOURCE_FILE_SET_CHANGED', directory);
  }
  const git = object => execFileSync('git', ['show', object], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  // Preflight ALL files before writing any. Even staged SQL edits must be preserved.
  const checked = sources.map(([name, path], index) => {
    const canonical = git('HEAD:' + path);
    if (sha(canonical) !== approved[index].checksum || canonical.includes(13)) fail('MIGRATION_HEAD_BYTES_CHANGED', path);
    if (!git(':' + path).equals(canonical)) fail('MIGRATION_INDEX_CHANGED', path);
    const absolute = resolve(root, path), stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('MIGRATION_SOURCE_NOT_REGULAR', path);
    const original = readFileSync(absolute), needsRepair = !original.equals(canonical);
    if (needsRepair && !normalizeCRLF(original).equals(canonical)) fail('MIGRATION_SOURCE_CONTENT_CHANGED', path);
    return { name, path, absolute, canonical, original, mode: stat.mode, needsRepair };
  });
  const repair = checked.filter(item => item.needsRepair);
  if (repairLineEndings && repair.length) {
    const staged = [];
    try {
      for (const item of repair) {
        const temp = item.absolute + '.line-endings-' + randomUUID() + '.tmp';
        writeFileSync(temp, item.canonical, { flag: 'wx', mode: item.mode & 0o777 });
        staged.push({ item, temp });
      }
      for (const item of checked) if (!readFileSync(item.absolute).equals(item.original)) fail('MIGRATION_SOURCE_CHANGED_DURING_CHECK', item.path);
      for (const { item, temp } of staged) {
        if (!readFileSync(item.absolute).equals(item.original) || lstatSync(item.absolute).isSymbolicLink()) fail('MIGRATION_SOURCE_CHANGED_DURING_CHECK', item.path);
        renameSync(temp, item.absolute);
      }
    } finally {
      for (const { temp } of staged) rmSync(temp, { force: true });
    }
    for (const item of checked) if (!readFileSync(item.absolute).equals(item.canonical)) fail('MIGRATION_LOCAL_REPAIR_NOT_CONFIRMED', item.path);
  }
  return {
    mode: repairLineEndings ? 'repair-line-endings' : 'check',
    planDigest: approvedDigest,
    sourceFiles: checked.length,
    repairNeeded: !repairLineEndings && repair.length > 0,
    repaired: repairLineEndings ? repair.map(item => item.path) : [],
    files: checked.map(item => ({ name: item.name, path: item.path, approvedChecksum: sha(item.canonical), lineEndingOnlyDifference: item.needsRepair })),
    databaseConnected: false,
    gitIndexChanged: false,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), mode = args[0] || '--check';
    if (args.length > 1 || !['--check', '--repair-line-endings'].includes(mode)) fail('MIGRATION_CHECKOUT_ARGUMENT_INVALID');
    const result = verifyMigrationCheckout(fileURLToPath(new URL('..', import.meta.url)), { repairLineEndings: mode === '--repair-line-endings' });
    console.log(JSON.stringify(result, null, 2));
    if (result.repairNeeded) process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ code: error.code || 'MIGRATION_CHECKOUT_STOPPED', ...(error.file ? { file: error.file } : {}), outcome: 'local-only; no database action or checksum edit' }));
    process.exitCode = 1;
  }
}
