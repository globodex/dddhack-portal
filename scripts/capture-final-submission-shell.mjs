// Current production components, fresh synthetic data, browser and server GET-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const appCodeSource = 'e1d50c27ef0785a93faf4c2e1f48929937d65aac';
assert.equal(execFileSync('git', ['diff', '--name-only', appCodeSource + '..' + source, '--', 'app', 'lib', 'neon', 'public'], { encoding: 'utf8' }).trim(), '', 'Only evidence/script commits may follow held app source');
const origin = 'http://localhost:3007', backend = 'http://127.0.0.1:8849';
const out = 'evidence/final-submission-shell';
assert.ok(!existsSync(out + '/report.json'), 'Inspect prior outcome before repeating');
mkdirSync(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['app/portal.tsx', 'app/layout.tsx', 'app/team-studio-shell.css', 'app/team-studio-experience.css', 'app/projects-rules-experience.css', 'app/project-media-field.tsx', 'app/prepare-project-image.ts', 'app/owner-submission-window.tsx'];
const fingerprint = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const inventory = () => {
  const db = new DatabaseSync('/tmp/ddd-final-ui-8849.sqlite', { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    const dataset = tables.map(name => [name, db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all().map(row => JSON.stringify(row)).sort()]);
    return { tables: tables.length, datasetSha256: sha(JSON.stringify(dataset)), revision: db.prepare("SELECT revision FROM projects WHERE id='visual_project_alice'").get().revision, attempts: db.prepare("SELECT count(*) n FROM submission_versions WHERE team_id='fake_team1'").get().n };
  } finally { db.close(); }
};
const report = { source, appCodeSource, origin, backend, syntheticOnly: true, freshSeedNotCopy: true, browserReadOnly: true, backendReadOnly: true, fingerprint: fingerprint(), fixture: JSON.parse(readFileSync('/tmp/ddd-final-ui-8849-manifest.json')), screenshots: [], checks: [], focus: [], blocked: [], errors: [] };
const save = () => writeFileSync(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false });
const contexts = new Set();
const direct = async (path, actor = 'alice') => {
  const response = await fetch(backend + '/api/portal?view=' + encodeURIComponent(path), { headers: { cookie: 'portal_local_fixture=' + actor } });
  assert.equal(response.status, 200); return response.json();
};
const makeContext = async (actor, mode) => {
  const context = await browser.newContext({ viewport: mode, hasTouch: mode.width < 768, isMobile: mode.width < 768, reducedMotion: 'reduce' });
  contexts.add(context);
  await context.addCookies([{ name: 'portal_local_fixture', value: actor, url: origin, httpOnly: true, sameSite: 'Strict' }]);
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      report.blocked.push({ method: request.method(), path: new URL(request.url()).pathname }); save(); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => { report.errors.push(error.message); save(); });
  return { context, page };
};
const shot = async (page, name, fullPage = true) => {
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))));
  if (fullPage) await page.evaluate(() => scrollTo(0, 0));
  const metrics = await page.evaluate(() => ({ innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, name + ' horizontal overflow');
  const path = out + '/' + name + '.png';
  await page.screenshot({ path, fullPage, animations: 'disabled', style: 'nextjs-portal{visibility:hidden!important}' });
  report.screenshots.push({ path, sha256: sha(readFileSync(path)), fullPage, metrics }); save();
};
const focus = async (page, locator, label) => {
  assert.equal(await locator.isVisible(), true, label + ' visible');
  assert.equal(await locator.isEnabled(), true, label + ' enabled');
  await locator.scrollIntoViewIfNeeded();
  await locator.focus();
  assert.equal(await locator.evaluate(node => node === document.activeElement), true, label + ' focusable');
  report.focus.push({ label, visible: true, enabled: true, focused: true }); save();
};
const editor = async (page) => {
  await page.goto(origin + '/dashboard#project', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('tab', { name: 'Project', exact: true }).click();
  await page.getByRole('button', { name: 'Update project', exact: true }).click();
  await page.locator('.submission-v6[data-hydrated="true"]').waitFor();
  assert.equal(await page.locator('.studio-dashboard-shell').count(), 1);
  assert.equal(await page.locator('.studio-dashboard-shell > .sidebar').isVisible(), false);
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Open menu"]')?.disabled);
  const bg = await menu.evaluate(node => getComputedStyle(node).backgroundColor);
  assert.ok(bg.match(/\d+/g).slice(0, 3).every(value => Number(value) < 90));
};

try {
  const initial = await direct('/dashboard');
  assert.equal(initial.submissionAccess.canCommit, true);
  report.before = inventory(); assert.equal(report.before.revision, 2); assert.equal(report.before.attempts, 2); save();
  for (const mode of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 480 }]) {
    const label = mode.width + 'x' + mode.height;
    const { context, page } = await makeContext('alice', mode);
    await editor(page);
    for (const name of ['projectName', 'problemSolution', 'description']) await focus(page, page.locator('.project-editor [name="' + name + '"]'), label + ' ' + name);
    if (mode.width !== 320) await shot(page, 'step1-' + label);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    for (const name of ['github', 'demo']) await focus(page, page.locator('.project-editor [name="' + name + '"]'), label + ' ' + name);
    if (mode.width !== 320) await shot(page, 'step2-' + label);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    for (const kind of ['banner', 'logo']) await focus(page, page.locator('#submission-' + kind + '-control'), label + ' Replace ' + kind);
    await focus(page, page.locator('#submission-attestation-control'), label + ' attestation');
    await shot(page, 'step3-' + label);
    for (const name of ['Save draft', 'Submit']) {
      const control = page.getByRole('button', { name, exact: true });
      await focus(page, control, label + ' ' + name);
      const box = await control.boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= mode.width + 1);
      assert.ok(box.y >= 0 && box.y + box.height <= mode.height + 1);
    }
    if (mode.width === 320) {
      await shot(page, 'step3-footer-320x480', false);
      const previous = await page.locator('.submission-media-frame-banner img').getAttribute('src');
      await page.getByLabel('Upload banner', { exact: true }).setInputFiles({ name: 'synthetic-spoof.png', mimeType: 'image/png', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
      const error = page.locator('#submission-banner-error');
      await error.waitFor();
      assert.equal(await page.locator('.submission-media-frame-banner img').getAttribute('src'), previous);
      assert.equal(await page.locator('.action-message').count(), 0);
      const control = page.locator('#submission-banner-control');
      assert.equal(await control.getAttribute('aria-invalid'), 'true');
      assert.ok((await control.getAttribute('aria-describedby')).includes('submission-banner-error'));
      await focus(page, control, '320 invalid banner control');
      await error.scrollIntoViewIfNeeded();
      await shot(page, 'step3-inline-media-error-320x480', false);
      const chooserPromise = page.waitForEvent('filechooser');
      await control.press('Enter');
      const chooser = await chooserPromise;
      await chooser.setFiles('/tmp/ddd-media-fixtures/portrait.png');
      await page.locator('.submission-media-field-banner[aria-busy="false"] .submission-media-file').filter({ hasText: 'portrait.png' }).waitFor();
      assert.equal(await error.count(), 0);
      await focus(page, control, '320 valid banner control');
      const metrics = await page.locator('.submission-media-frame-banner img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, fit: getComputedStyle(image).objectFit }));
      assert.deepEqual(metrics, { width: 128, height: 300, fit: 'contain' });
      report.validMedia = metrics;
      await shot(page, 'step3-valid-media-focus-320x480', false);
      await shot(page, 'step3-valid-media-full-320x480');
    }
    if (mode.width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
      await page.locator('#mobile-navigation:visible').waitFor();
      await shot(page, 'studio-menu-390x844', false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobile-navigation').isVisible(), false);
    }
    report.checks.push({ name: label + ' current Studio header/editor, visible focus,44px footer and no overflow', passed: true }); save();
    await context.close(); contexts.delete(context);
  }
  const { context, page } = await makeContext('owner', { width: 390, height: 844 });
  await page.goto(origin + '/admin/settings', { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('.admin-window[data-hydrated="true"]').waitFor();
  const beforeValues = {};
  for (const name of ['Opens (IST)', 'Closes (IST)']) {
    const input = page.getByLabel(name, { exact: true });
    await focus(page, input, name); beforeValues[name] = await input.inputValue();
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.admin-window[data-hydrated="true"]').waitFor();
  for (const [name, value] of Object.entries(beforeValues)) { assert.equal(await page.getByLabel(name, { exact: true }).inputValue(), value); assert.equal(await page.getByLabel(name, { exact: true }).isEnabled(), true); }
  await shot(page, 'saved-window-enabled-after-reload-390x844');
  report.checks.push({ name: 'Existing seeded window values stay enabled and focusable after GET reload; no publication', passed: true });
  await context.close(); contexts.delete(context);
  report.after = inventory(); assert.deepEqual(report.after, report.before);
  assert.equal(report.blocked.length, 0); assert.equal(report.errors.length, 0); assert.deepEqual(fingerprint(), report.fingerprint);
  report.completed = true;
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; }
finally { for (const context of contexts) await context.close(); await browser.close(); report.browserClosed = true; report.fingerprintAtEnd = fingerprint(); save(); }
console.log(JSON.stringify({ source, screenshots: report.screenshots.length, checks: report.checks.length, focusedControls: report.focus.length, completed: report.completed, failure: report.failure }));
