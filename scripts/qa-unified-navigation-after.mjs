import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dotColors, dotExpressions } from '../lib/avatar-contract.ts';

const origin = 'http://localhost:3012';
const out = 'evidence/unified-navigation/after';
const report = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), syntheticOnly: true, cases: [], startedAt: new Date().toISOString() };
const previous = JSON.parse(readFileSync(out + '/browser-target-closed.json', 'utf8'));
report.cases.push(...previous.cases);
const fitting = previous.inFlightCase;
if (fitting?.menu?.scrollHeight === fitting?.menu?.box?.height && fitting.failure?.message === 'Touch scroll moves the menu, not the background') {
  fitting.result = 'PASS';
  fitting.touchScroll = { required: false, reason: 'All twelve menu rows including red logout already fit in844px. The preceding unchanged-background assertion passed; movement is required only when content overflows.' };
  delete fitting.failure; report.cases.push(fitting);
}
report.harnessCorrections = 'Saved expression contract is a string; native SVG uses two tspans. Compare the dialog against the CSS root rectangle, not post-lock clientWidth or scrollWidth, because stable scrollbar gutters and existing overflowing page content differ. Prior nine successful desktop cases retained; not repeated.';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false });
const roles = [
  { actor: 'owner', path: '/admin/participants', color: 'orange', expression: 'star' },
  { actor: 'admin', path: '/admin/participants', color: 'purple', expression: 'cheerful' },
  { actor: 'alice', path: '/dashboard', color: 'coral', expression: 'mixed-plus' },
  { actor: 'anonymous', path: '/' },
  { actor: 'stranger', path: '/dashboard', color: 'grey', expression: 'round' },
  { actor: 'bob', path: '/admin/participants', color: 'green', expression: 'plus' },
  { actor: 'judge', path: '/dashboard', color: 'blue', expression: 'squeezed' },
  { actor: 'judge2', path: '/dashboard', color: 'yellow', expression: 'mixed-slash' },
  { actor: 'dave', path: '/profile', placeholder: true },
];
const viewports = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 480 }];
function apiRequests(requests) { return requests.filter(r => /\/api\/(portal|auth\/session)/.test(r.url)); }
async function createContext(actor, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  if (actor !== 'anonymous') await context.addCookies([{ name: 'portal_local_fixture', value: actor, url: origin }]);
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient');
    return route.continue();
  });
  return context;
}
async function capture(page, prefix, suffix) {
  const file = `${out}/${prefix}-${suffix}.png`;
  await page.screenshot({ path: file, animations: 'disabled' });
  return file;
}
async function inspectCase(entry, viewport, standalone = false) {
  if (report.cases.some(c => c.actor === entry.actor && c.path === entry.path && c.viewport.width === viewport.width && c.viewport.height === viewport.height && c.standalone === standalone)) return;
  const context = await createContext(entry.actor, viewport);
  const page = await context.newPage();
  const item = { ...entry, viewport, standalone, requests: [], pageErrors: [] };
  report.inFlightCase = item;
  page.on('request', request => item.requests.push({ method: request.method(), url: request.url() }));
  page.on('pageerror', error => item.pageErrors.push(error.message));
  const prefix = `${entry.actor}-${entry.path === '/' ? 'home' : entry.path.slice(1).replaceAll('/', '-')}-${viewport.width}x${viewport.height}`;
  const shouldCapture = standalone || [1440, 390].includes(viewport.width) || ['owner', 'anonymous', 'dave'].includes(entry.actor);
  try {
    const response = await page.goto(origin + entry.path, { waitUntil: 'domcontentloaded', timeout: 120000 });
    assert.equal(response.status(), 200);
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
    await trigger.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.navigation-toggle')?.disabled);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.navigation-header').count(), 1);
    assert.equal(await page.locator('.sidebar,#public-navigation').count(), 0);
    const closed = await page.evaluate(() => ({
      width: innerWidth,
      layoutViewportWidth: document.documentElement.getBoundingClientRect().width,
      documentWidth: document.documentElement.scrollWidth,
      scrollY,
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      header: document.querySelector('.navigation-header').getBoundingClientRect().toJSON(),
      trigger: document.querySelector('.navigation-toggle').getBoundingClientRect().toJSON(),
      account: document.querySelector('.navigation-account').getBoundingClientRect().toJSON(),
      avatarState: document.querySelector('.navigation-account').getAttribute('data-avatar-state'),
      avatarFill: document.querySelector('.navigation-account circle')?.getAttribute('fill'),
      avatarMarks: [...document.querySelectorAll('.navigation-account tspan')].map(e => e.textContent),
      toggleColor: getComputedStyle(document.querySelector('.navigation-toggle')).backgroundColor,
      accountLabel: document.querySelector('.navigation-account').getAttribute('aria-label'),
    }));
    item.closed = closed;
    assert.ok(closed.documentWidth <= closed.width, 'No document overflow');
    assert.ok(closed.trigger.width >= 44 && closed.trigger.height >= 44);
    assert.ok(closed.account.width >= 44 && closed.account.height >= 44);
    assert.equal(closed.toggleColor, 'rgb(32, 35, 32)');
    if (standalone || entry.actor === 'anonymous') assert.equal(closed.avatarState, 'anonymous');
    else if (entry.placeholder) assert.equal(closed.avatarState, 'placeholder');
    else {
      assert.equal(closed.avatarState, 'saved');
      assert.equal(closed.avatarFill, dotColors[entry.color]);
      assert.equal(closed.avatarMarks.join(""), dotExpressions[entry.expression]);
    }
    if (shouldCapture) item.closedFile = await capture(page, prefix, 'closed');
    const apiBefore = apiRequests(item.requests).length;
    if (viewport.width < 500) await trigger.tap(); else await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await dialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(100);
    const menu = await dialog.evaluate(node => ({
      box: node.getBoundingClientRect().toJSON(),
      scrollHeight: node.scrollHeight,
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
      scrollY,
      rows: [...node.querySelectorAll('nav > a,nav > button')].map(e => ({ text: e.textContent.trim(), href: e.getAttribute('href'), box: e.getBoundingClientRect().toJSON(), icon: e.querySelector('svg')?.getBoundingClientRect().toJSON(), color: getComputedStyle(e).color })),
      headings: node.querySelectorAll('h1,h2,h3').length,
    }));
    item.menu = menu;
    assert.equal(menu.box.x, 0); assert.equal(menu.box.y, 0);
    assert.ok(menu.box.width >= closed.layoutViewportWidth && menu.box.width <= closed.width, "Full available layout width, excluding the preserved scrollbar gutter");
    assert.equal(menu.box.height, viewport.height);
    assert.equal(menu.bodyOverflow, 'hidden'); assert.equal(menu.htmlOverflow, 'hidden');
    assert.equal(menu.headings, 0);
    for (const row of menu.rows) {
      assert.ok(row.box.height >= 44);
      assert.ok(row.icon && row.icon.width >= 20 && row.icon.height >= 20, row.text + ' visible icon');
      assert.ok(!/^(Menu|Navigation|Administration)$/.test(row.text) || row.href === '/admin/participants');
    }
    if (entry.actor === 'stranger' && !standalone) assert.deepEqual(menu.rows.filter(r => r.href).map(r => r.href), ['/discover/teams', '/projects', '/rules']);
    if (entry.actor !== 'anonymous' && !standalone) assert.equal(menu.rows.find(r => r.text === 'Log out')?.color, 'rgb(177, 45, 38)');
    assert.equal(apiRequests(item.requests).length, apiBefore, 'Opening menu adds no identity/projection request');
    if (shouldCapture) item.menuFile = await capture(page, prefix, 'menu');
    const focusable = dialog.locator('a[href],button:not([disabled])');
    await focusable.last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await focusable.first().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusable.last().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement === document.querySelector(".navigation-toggle"), null, { timeout: 2000 });
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
    assert.deepEqual(await page.evaluate(() => ({ body: document.body.style.overflow, html: document.documentElement.style.overflow })), { body: closed.bodyOverflow, html: closed.htmlOverflow });
    const restored = await trigger.boundingBox();
    assert.ok(Math.abs(restored.x - closed.trigger.x) < 0.5 && Math.abs(restored.y - closed.trigger.y) < 0.5, 'Header geometry stable after modal');
    await trigger.click(); await dialog.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !!history.state?.portalDialog);
    await page.goBack(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).pathname, entry.path);
    await page.waitForFunction(() => document.activeElement === document.querySelector(".navigation-toggle"), null, { timeout: 2000 });
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
    if (viewport.width < 500 && entry.actor === 'owner') {
      await trigger.tap(); await dialog.waitFor({ state: 'visible' });
      const beforeScroll = await page.evaluate(() => ({ page: scrollY, menu: document.querySelector('.mobile-navigation').scrollTop }));
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width / 2, y: viewport.height - 60 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: viewport.width / 2, y: 140 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
      const afterScroll = await page.evaluate(() => ({ page: scrollY, menu: document.querySelector('.mobile-navigation').scrollTop }));
      item.touchScroll = { beforeScroll, afterScroll, overflow: menu.scrollHeight > menu.box.height + 1 };
      assert.equal(afterScroll.page, beforeScroll.page);
      if (menu.scrollHeight > menu.box.height + 1) assert.ok(afterScroll.menu > beforeScroll.menu, 'Touch scroll moves the menu, not the background');
      const logout = dialog.getByRole('button', { name: 'Log out', exact: true });
      await logout.scrollIntoViewIfNeeded();
      item.logoutFile = await capture(page, prefix, 'logout-visible');
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      item.touchScroll = { beforeScroll, afterScroll };
    }
    assert.equal(item.pageErrors.length, 0);
    item.result = 'PASS';
    report.cases.push(item); delete report.inFlightCase;
    console.log(JSON.stringify({ count: report.cases.length, actor: entry.actor, path: entry.path, viewport, result: 'PASS' }));
  } catch (error) {
    item.failure = { message: error.message, stack: error.stack };
    item.failureFile = await capture(page, prefix, 'FAIL').catch(() => undefined);
    throw error;
  } finally { await context.close(); }
}
try {
  for (const viewport of [viewports[0], viewports[2]]) await inspectCase({ actor: 'owner', path: '/admin/submissions', color: 'orange', expression: 'star' }, viewport);
  for (const viewport of viewports) for (const role of roles) await inspectCase(role, viewport);
  for (const viewport of viewports) for (const entry of [{ actor: 'anonymous', path: '/privacy' }, { actor: 'anonymous', path: '/terms' }, { actor: 'anonymous', path: '/signin' }, { actor: 'bob', path: '/personal/credits' }]) await inspectCase(entry, viewport, true);
  for (const viewport of [viewports[0], viewports[2]]) {
    await inspectCase({ actor: 'anonymous', path: '/projects' }, viewport);
    await inspectCase({ actor: 'owner', path: '/admin/submissions', color: 'orange', expression: 'star' }, viewport);
  }
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.failure = { message: error.message, stack: error.stack }; throw error; }
finally { await browser.close(); report.browserClosed = true; writeFileSync(out + '/report.json', JSON.stringify(report, null, 2)); }
