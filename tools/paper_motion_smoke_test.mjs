import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Fresh localhost-only browser. This test never attaches a user profile.
const address = new URL(process.env.PORTFOLIO_URL || 'http://127.0.0.1:5174/Corden-Portfolio/');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname), 'PORTFOLIO_URL must be localhost');
const output = path.resolve('.work/screenshots');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const results = [];
function url(params = {}) {
  const target = new URL(address);
  target.search = new URLSearchParams(params).toString();
  return target.href;
}
async function setup(params = {}, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion });
  const diagnostics = [];
  await context.route('**/*', async route => {
    const request = new URL(route.request().url());
    if (request.protocol === 'data:' || request.protocol === 'blob:') return route.continue();
    if (request.origin === address.origin) return route.continue();
    if (request.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    diagnostics.push('External request ' + request.href);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => diagnostics.push('PAGE ' + error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push('CONSOLE ' + message.text()); });
  page.on('response', response => { if (response.status() >= 400) diagnostics.push('HTTP ' + response.status() + ' ' + response.url()); });
  await page.goto(url(params), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__PAPER_3D?.ready || document.querySelector('.error-screen'), undefined, { timeout: 60000 });
  assert.equal(await page.locator('.error-screen').count(), 0, 'scene loads without error');
  await page.waitForFunction(() => window.__PAPER_3D?.ready && !window.__PAPER_3D.moving, undefined, { timeout: 30000 });
  await centerPointer(page);
  await page.waitForTimeout(1500);
  return { context, page, diagnostics };
}
async function centerPointer(page) {
  const bounds = await page.locator('.scene-canvas canvas').boundingBox();
  assert(bounds, 'canvas has bounds');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
const stats = page => page.evaluate(() => ({ ...window.__PAPER_3D, sampledAt: performance.now() }));
async function image(page, name) {
  const png = await page.locator('.scene-canvas canvas').screenshot({ path: path.join(output, name), animations: 'disabled' });
  return png.toString('base64');
}
async function difference(page, a, b) {
  return page.evaluate(async ({ a, b }) => {
    const pixels = async base64 => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + base64;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const first = await pixels(a), second = await pixels(b);
    let changed = 0, total = 0, maximum = 0;
    for (let i = 0; i < first.length; i += 4) {
      const delta = Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i+1] - second[i+1]), Math.abs(first[i+2] - second[i+2]));
      if (delta > 8) changed++;
      maximum = Math.max(maximum, delta);
      total += delta;
    }
    return { changed, maximum, mean: total / (first.length / 4) };
  }, { a, b });
}
async function stationary(page, label) {
  await page.waitForTimeout(500);
  const before = await stats(page);
  assert.equal(before.paperSwayStrength, 0, label + ' has zero displacement');
  await page.waitForTimeout(850);
  const after = await stats(page);
  assert.equal(after.paperSwayTime, before.paperSwayTime, label + ' freezes motion clock');
  assert.equal(after.renderFrames, before.renderFrames, label + ' does not redraw full scene');
  assert(after.cachedFrames > before.cachedFrames, label + ' uses cached presentations');
  assert.equal(after.moving, false, label + ' preserves camera rest');
  return after;
}
async function run(name, action) {
  try { const detail = await action(); results.push({ name, status: 'passed', detail }); console.log('PASS', name, JSON.stringify(detail)); }
  catch (error) { results.push({ name, status: 'failed', message: error.message, stack: error.stack }); console.error('FAIL', name, error.stack); }
}
try {
  await run('airborne geometry moves while stationary camera keeps bounded ambient cadence and cached frames', async () => {
    const { context, page, diagnostics } = await setup();
    try {
      await page.waitForFunction(() => window.__PAPER_3D.paperSwayStrength > .99);
      const first = await image(page, 'paper-sway-active-a.png');
      const before = await stats(page);
      await page.waitForTimeout(2000);
      const after = await stats(page);
      const second = await image(page, 'paper-sway-active-b.png');
      const change = await difference(page, first, second);
      assert(after.paperSwayTime > before.paperSwayTime + .5, 'actual running motion clock');
      assert.equal(after.moving, false, 'ambient sway does not mark camera as moving');
      assert.equal(after.frame, before.frame, 'authored camera frame remains stationary');
      const full = after.renderFrames - before.renderFrames, cached = after.cachedFrames - before.cachedFrames;
      const elapsed = (after.sampledAt - before.sampledAt) / 1000;
      assert(full > 2 && full <= elapsed * 15 + 2, 'cinema full scene cadence: ' + full + ' in ' + elapsed);
      assert(cached > full, 'cached frames still outnumber expensive scene renders');
      assert(change.changed > 100, 'rendered paper movement changes pixels beyond postprocessing grain: ' + JSON.stringify(change));
      // Live preference change must replace the cached moving pose and stop its clock.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => window.__PAPER_3D.paperSwayStrength === 0);
      const reduced = await stationary(page, 'live reduced motion');
      const staticA = await image(page, 'paper-sway-reduced-a.png');
      await page.waitForTimeout(1000);
      const staticB = await image(page, 'paper-sway-reduced-b.png');
      const staticChange = await difference(page, staticA, staticB);
      assert(change.changed > staticChange.changed * 3 + 100, 'motion pixel change exceeds stationary effect baseline: ' + JSON.stringify({ change, staticChange }));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(time => window.__PAPER_3D.paperSwayTime > time + .1 && window.__PAPER_3D.paperSwayStrength > 0, reduced.paperSwayTime);
      assert.deepEqual(diagnostics, [], 'normal runtime diagnostics');
      return { full, cached, elapsed, change, staticChange };
    } finally { await context.close(); }
  });
  await run('collection pauses the clock and resumes the same scene without catching up', async () => {
    const { context, page, diagnostics } = await setup();
    try {
      await page.locator('.collection-link').click();
      await page.locator('.portfolio-web').waitFor({ state: 'visible' });
      await page.waitForTimeout(200);
      const before = await stats(page);
      await page.waitForTimeout(1500);
      const after = await stats(page);
      assert.equal(after.paperSwayTime, before.paperSwayTime, 'collection freezes scene motion');
      assert.equal(after.renderFrames, before.renderFrames, 'collection freezes full renders');
      await page.keyboard.press('Escape');
      await page.locator('.portfolio-web').waitFor({ state: 'detached' });
      await page.waitForFunction(time => window.__PAPER_3D.paperSwayTime > time, after.paperSwayTime);
      const resumed = await stats(page);
      assert(resumed.paperSwayTime - after.paperSwayTime < .35, 'return does not absorb collection elapsed time');
      assert.deepEqual(diagnostics, [], 'collection pause diagnostics');
      return { pausedTime: after.paperSwayTime, resumedTime: resumed.paperSwayTime };
    } finally { await context.close(); }
  });
  await run('controlled document visibility transition pauses motion and resumes without a phase jump', async () => {
    const { context, page, diagnostics } = await setup();
    try {
      // Headless tabs remain visible even after bringToFront on another tab.
      // Exercise the real visibility handler with a controlled document API transition.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
      const before = await stats(page);
      await page.waitForTimeout(1500);
      const paused = await stats(page);
      assert.equal(paused.paperSwayTime, before.paperSwayTime, 'hidden document freezes clock');
      assert.equal(paused.renderFrames, before.renderFrames, 'hidden document suspends full renders');
      await page.evaluate(() => {
        delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForFunction(time => window.__PAPER_3D.paperSwayTime > time, paused.paperSwayTime);
      const after = await stats(page);
      assert(after.paperSwayTime - paused.paperSwayTime < .35, 'visible document does not catch up the clock');
      assert.deepEqual(diagnostics, [], 'visibility pause diagnostics');
      return { beforeTime: before.paperSwayTime, pausedTime: paused.paperSwayTime, afterTime: after.paperSwayTime };
    } finally { await context.close(); }
  });
  await run('balanced mode caps ambient refreshes at ten per second while retaining cached presentation', async () => {
    const { context, page, diagnostics } = await setup();
    try {
      await page.locator('.quality-toggle').click();
      await page.waitForFunction(() => window.__PAPER_3D.quality === 'balanced');
      await centerPointer(page);
      await page.waitForTimeout(700);
      const before = await stats(page);
      await page.waitForTimeout(1600);
      const after = await stats(page), elapsed = (after.sampledAt - before.sampledAt) / 1000;
      const full = after.renderFrames - before.renderFrames, cached = after.cachedFrames - before.cachedFrames;
      assert(full > 1 && full <= elapsed * 10 + 2, 'balanced full scene cadence: ' + full + ' in ' + elapsed);
      assert(cached > full, 'balanced mode retains cache benefit');
      assert.equal(after.moving, false);
      assert.deepEqual(diagnostics, [], 'balanced runtime diagnostics');
      return { full, cached, elapsed };
    } finally { await context.close(); }
  });
  for (const [name, params, preference] of [
    ['initial reduced motion', {}, 'reduce'],
    ['still URL', { still: '1' }, 'no-preference'],
  ]) await run(name + ' has no displacement or ambient full scene renders', async () => {
    const { context, page, diagnostics } = await setup(params, preference);
    try {
      const settled = await stationary(page, name);
      assert.deepEqual(diagnostics, [], name + ' diagnostics');
      return { time: settled.paperSwayTime, strength: settled.paperSwayStrength };
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  const report = { address: address.href, passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length, results };
  await fs.writeFile(path.join(output, 'paper-motion-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PAPER MOTION RESULTS', JSON.stringify(report));
}
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
