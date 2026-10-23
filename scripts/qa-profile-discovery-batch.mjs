import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '/tmp/ddehack-playwright-runner/node_modules/playwright/index.mjs';

const origin = 'http://127.0.0.1:4173';
const batch = process.env.QA_BATCH;
assert.ok(['profile', 'discovery'].includes(batch), 'QA_BATCH must be profile or discovery');
assert.ok(process.env.BUILD_HEAD && process.env.WORKER_SHA, 'Parent must confirm fresh compiled build identifiers');
const out = `evidence/profile-discovery-batch/${batch}`;
mkdirSync(out, { recursive: true });
const report = { batch, build: process.env.BUILD_HEAD, workerSha: process.env.WORKER_SHA, origin, syntheticOnly: true, screenshots: [], checks: [], errors: [], blockedRequests: [], browserClosed: false };
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
report.browser = browser.version();
const check = (name, details) => report.checks.push({ name, passed: true, ...details });
async function contextFor(identity, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      report.blockedRequests.push({ url: request.url(), method: request.method() });
      return route.abort('blockedbyclient');
    }
    return route.continue({ headers: { ...request.headers(), 'oai-authenticated-user-id': `fake_${identity}`, 'oai-authenticated-user-email': `${identity}@portal.test` } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ identity, message: error.message }));
  return { context, page };
}
async function shot(page, state, role, viewportName, viewport) {
  await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.viewport, `${state}: horizontal overflow ${JSON.stringify(dimensions)}`);
  const filename = `${state}--${role}--${viewportName}-${viewport.width}x${viewport.height}--${report.build.slice(0, 7)}.png`;
  await page.screenshot({ path: `${out}/${filename}`, fullPage: await page.locator('dialog[open]').count() === 0, animations: 'disabled' });
  report.screenshots.push({ filename, localPath: `${process.cwd()}/${out}/${filename}`, route: new URL(page.url()).pathname, state, role, viewport, build: report.build, workerSha: report.workerSha, inspected: false });
  check(`${state} ${viewportName}: captured without horizontal overflow`, dimensions);
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
}
async function next(page, title) {
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
}
try {
  for (const [viewportName, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    if (batch === 'profile') {
      const { context, page } = await contextFor('alice', viewport);
      try {
        await page.goto(`${origin}/profile`);
        await page.getByRole('heading', { name: 'Your profile', exact: true }).waitFor();
        await page.locator('label[title="Purple"]').click();
        await page.locator('label[title="Mixed plus"]').click();
        assert.ok(await page.getByRole('radio', { name: 'Purple', exact: true }).isChecked());
        assert.ok(await page.getByRole('radio', { name: 'Mixed plus', exact: true }).isChecked());
        check(`${viewportName}: avatar selection changes locally without saving`);
        await shot(page, 'profile-step1-avatar-selected', 'participant-alice', viewportName, viewport);
        await next(page, 'Contact');
        await shot(page, 'profile-step2-contact', 'participant-alice', viewportName, viewport);
        await page.locator('.profile-platform-select select').first().click();
        await shot(page, 'profile-step2-platform-chooser', 'participant-alice', viewportName, viewport);
        await page.keyboard.press('Escape');
        await next(page, 'About you');
        await shot(page, 'profile-step3-about', 'participant-alice', viewportName, viewport);
      } finally { await context.close(); }
    } else {
      const { context, page } = await contextFor('bob', viewport);
      try {
        await page.goto(`${origin}/discover/participants`);
        await page.getByRole('heading', { name: 'Discover', exact: true }).waitFor();
        await page.locator('.directory-list li').first().waitFor();
        await shot(page, 'discover-participants', 'participant-bob', viewportName, viewport);
        const opener = page.locator('.directory-list button[aria-haspopup="dialog"]').filter({ hasText: /Alice/i }).first();
        assert.equal(await opener.count(), 1, 'Synthetic Alice must be discoverable');
        await opener.click();
        const dialog = page.locator('dialog.discovery-profile[open]');
        await dialog.waitFor();
        assert.ok(await dialog.getByRole('heading', { name: /Alice/i }).isVisible());
        const text = await dialog.innerText();
        assert.doesNotMatch(text, /alice@|\+12025550100|\bSex\b|Organization ID|org[_ -]?id|team idea/i);
        assert.equal(await dialog.locator('input,select,textarea').count(), 0);
        for (const href of await dialog.locator('a').evaluateAll(nodes => nodes.map(n => n.href))) {
          const url = new URL(href); assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.password, '');
        }
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('Tab');
          assert.ok(await dialog.evaluate(el => el.matches(':modal') && (el.contains(document.activeElement) || document.activeElement === document.body)), 'Native modal must not focus background controls');
        }
        await dialog.getByRole('button', { name: 'Close profile' }).focus();
        await shot(page, 'discover-other-profile-alice', 'participant-bob', viewportName, viewport);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        assert.ok(await opener.evaluate(el => el === document.activeElement));
        await opener.click();
        await page.getByRole('button', { name: 'Close profile' }).click();
        await page.locator('dialog.discovery-profile').waitFor({ state: 'detached' });
        assert.ok(await opener.evaluate(el => el === document.activeElement));
        check(`${viewportName}: other-person privacy, Tab containment, Escape/Close and focus return`);
        await page.goto(`${origin}/discover/teams`);
        await page.getByRole('heading', { name: 'Discover', exact: true }).waitFor();
        await page.locator('.directory-list li').first().waitFor();
        await shot(page, 'discover-teams', 'participant-bob', viewportName, viewport);
        await page.goto(`${origin}/rules`);
        await page.getByRole('heading', { name: 'Rules', exact: true }).waitFor();
        await shot(page, 'rules', 'participant-bob', viewportName, viewport);
      } finally { await context.close(); }
      const viewer = await contextFor('stranger', viewport);
      try {
        for (const route of ['participants', 'teams']) {
          await viewer.page.goto(`${origin}/discover/${route}`);
          await viewer.page.getByRole('heading', { name: 'Discover', exact: true }).waitFor();
          await viewer.page.locator('.directory-list li').first().waitFor();
          assert.equal(await viewer.page.getByRole('button', { name: /Request to join|Create team|Join team/ }).count(), 0);
          await shot(viewer.page, `discover-${route}`, 'viewer-stranger', viewportName, viewport);
        }
      } finally { await viewer.context.close(); }
    }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.blockedRequests.filter(r => !['GET', 'HEAD'].includes(r.method)).length, 0, 'Capture must not attempt mutations');
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser.close(); report.browserClosed = true;
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
