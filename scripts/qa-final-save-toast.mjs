// Exactly one authorized draft save on the owned8849 fixture. Never submit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

assert.equal(process.env.QA_ONE_DRAFT_SAVE, '8849');
const origin = 'http://localhost:3007', backend = 'http://127.0.0.1:8849';
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const appCodeSource = 'e1d50c27ef0785a93faf4c2e1f48929937d65aac';
assert.equal(execFileSync('git', ['diff', '--name-only', appCodeSource + '..' + source, '--', 'app', 'lib', 'neon', 'public'], { encoding: 'utf8' }).trim(), '');
const out = 'evidence/final-save-toast';
assert.ok(!existsSync(out + '/report.json'), 'Check the original save outcome, never repeat it');
mkdirSync(out, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const fingerprint = () => Object.fromEntries(['app/portal.tsx', 'app/team-studio-shell.css', 'app/team-studio-experience.css', 'app/projects-rules-experience.css'].map(file => [file, sha(readFileSync(file))]));
const inventory = () => {
  const db = new DatabaseSync('/tmp/ddd-final-ui-8849.sqlite', { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    const hashes = Object.fromEntries(tables.map(name => [name, sha(JSON.stringify(db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()))]));
    return { revision: db.prepare("SELECT revision FROM projects WHERE id='visual_project_alice'").get().revision, attempts: db.prepare("SELECT count(*) n FROM submission_versions WHERE team_id='fake_team1'").get().n, auditCount: db.prepare('SELECT count(*) n FROM audit_logs').get().n, rateBucketCount: db.prepare('SELECT COALESCE(sum(count),0) n FROM request_buckets').get().n, aliceRateBucketCount: db.prepare("SELECT COALESCE(sum(count),0) n FROM request_buckets WHERE actor_id='fake_alice'").get().n, tableHashes: hashes };
  } finally { db.close(); }
};
const report = { source, appCodeSource, syntheticOnly: true, reusedOwnedFreshFixture: true, backendPort: 8849, oneAllowedAction: 'save-project', disallowedActions: ['submit-project', 'all other mutations'], fingerprint: fingerprint(), writes: [], screenshots: [], checks: [], blocked: [], errors: [] };
const save = () => writeFileSync(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
const direct = async () => {
  const response = await fetch(backend + '/api/portal?view=%2Fdashboard', { headers: { cookie: 'portal_local_fixture=alice' } });
  assert.equal(response.status, 200); return response.json();
};
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.addCookies([{ name: 'portal_local_fixture', value: 'alice', url: origin, httpOnly: true, sameSite: 'Strict' }]);
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror', error => { report.errors.push(error.message); save(); });
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin) { report.blocked.push({ method: request.method(), path: url.pathname }); save(); return route.abort(); }
  if (!['GET', 'HEAD'].includes(request.method())) {
    const body = request.postDataJSON();
    if (request.method() !== 'POST' || url.pathname !== '/api/portal' || body.action !== 'save-project' || body.data.revision !== 2 || report.writes.length) {
      report.blocked.push({ method: request.method(), path: url.pathname, action: body?.action }); save(); return route.abort();
    }
    report.writes.push({ action: body.action, revision: body.data.revision, status: 'pending', requestBytes: Buffer.byteLength(request.postData()), payloadSha256: sha(request.postData()) }); save();
  }
  return route.continue();
});
const shot = async name => {
  const path = out + '/' + name + '.png';
  await page.screenshot({ path, fullPage: false, animations: 'disabled', style: 'nextjs-portal{visibility:hidden!important}' });
  report.screenshots.push({ path, sha256: sha(readFileSync(path)), viewport: { width: 1440, height: 900 } }); save();
};
try {
  const health = await fetch(backend + '/api/health').then(r => r.json()); assert.equal(health.oneDraftSave, true); assert.equal(health.forwardedSave, false);
  const before = await direct(); assert.equal(before.project.revision, 2); assert.equal(before.submissionAccess.attemptsUsed, 2); assert.equal(before.submissionAccess.canCommit, true);
  report.before = inventory(); save();
  await page.goto(origin + '/dashboard#project', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('tab', { name: 'Project', exact: true }).click();
  await page.getByRole('button', { name: 'Update project', exact: true }).click();
  await page.locator('.submission-v6[data-hydrated="true"]').waitFor();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.locator('.confirmation-dialog[open]').waitFor();
  assert.equal(report.writes.length, 0); await shot('one-save-confirmation');
  const responseWaiter = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'save-project', { timeout: 30000 });
  await page.locator('.confirmation-dialog').getByRole('button', { name: 'Confirm change', exact: true }).click();
  const response = await responseWaiter;
  const receipt = await response.json();
  Object.assign(report.writes[0], { httpStatus: response.status(), status: response.status() === 200 ? 'committed' : 'failed', receipt }); save();
  assert.equal(response.status(), 200);
  const success = page.locator('.action-message[data-tone="success"]'); await success.waitFor();
  const firstSuccessSeen = Date.now();
  const visibleInput = page.locator('.project-editor [name="projectName"]:visible'); await visibleInput.waitFor();
  assert.equal(await visibleInput.isEnabled(), true); assert.equal(await page.locator('.submission-progress').getAttribute('aria-label'), 'Step 1 of 3');
  await shot('saved-success-before-visible-input-focus');
  assert.equal(await success.isVisible(), true, 'Success must still be present immediately before focus');
  const beforeFocus = Date.now(); assert.ok(beforeFocus - firstSuccessSeen < 3000, 'Stay well before the real5s auto-dismiss');
  await visibleInput.focus();
  await success.waitFor({ state: 'detached', timeout: 1000 });
  assert.equal(await visibleInput.evaluate(input => input === document.activeElement), true);
  report.focusProof = { visibleInput: 'projectName', refreshedStep: 1, enabled: true, focused: true, successPresentImmediatelyBeforeFocus: true, successSeenToFocusMs: beforeFocus - firstSuccessSeen, focusToClearedMs: Date.now() - beforeFocus, sourceAutoDismissMs: 5000, usedFocusOnlyNoTyping: true };
  await shot('save-success-cleared-visible-input-focused');
  report.checks.push({ name: 'Actual save200 refreshesStep1; visible projectName focus clears existing success before5s timeout', passed: true }); save();
  // Focus alone must not conceal an actionable local field error.
  await visibleInput.fill(''); await page.getByRole('button', { name: 'Next', exact: true }).click();
  const fieldError = page.locator('#submission-projectName-error'); await fieldError.waitFor();
  const errorText = await fieldError.textContent();
  await page.locator('.project-editor [name="description"]:visible').focus();
  assert.equal(await fieldError.isVisible(), true); assert.equal(await fieldError.textContent(), errorText);
  assert.equal(await visibleInput.getAttribute('aria-invalid'), 'true');
  assert.ok((await visibleInput.getAttribute('aria-describedby')).includes('submission-projectName-error'));
  await shot('required-field-error-retained-after-other-input-focus');
  report.checks.push({ name: 'Unrelated visible field focus retains required-name error and ARIA association; no extra save', passed: true });
  const after = await direct(); report.after = inventory();
  assert.equal(after.project.revision, 3); assert.equal(after.submissionAccess.attemptsUsed, 2); assert.equal(after.submissionAccess.canCommit, true);
  assert.equal(report.after.auditCount, report.before.auditCount + 1);
  const changedTables = Object.keys(report.before.tableHashes).filter(name => report.before.tableHashes[name] !== report.after.tableHashes[name]);
  assert.deepEqual(changedTables.sort(), ['audit_logs', 'projects', 'request_buckets']);
  assert.equal(report.after.rateBucketCount, report.before.rateBucketCount + 1);
  assert.equal(report.after.aliceRateBucketCount, report.before.aliceRateBucketCount + 1);
  report.changedTables = changedTables;
  assert.equal(report.writes.length, 1); assert.equal(report.blocked.length, 0); assert.equal(report.errors.length, 0); assert.deepEqual(fingerprint(), report.fingerprint);
  report.checks.push({ name: 'Exactly one draft changes projects+audit+normal rate bucket; revision2→3, attempts2, committed versions and other64tables unchanged', passed: true });
  report.completed = true;
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; }
finally { await context.close(); await browser.close(); report.browserClosed = true; report.fingerprintAtEnd = fingerprint(); save(); }
console.log(JSON.stringify({ source, writes: report.writes.map(({ action, status, httpStatus }) => ({ action, status, httpStatus })), checks: report.checks.length, screenshots: report.screenshots.length, focusProof: report.focusProof, completed: report.completed, failure: report.failure }));
