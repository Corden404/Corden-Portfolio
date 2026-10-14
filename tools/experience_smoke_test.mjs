import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Uses isolated headless contexts, never an existing browser/user profile.
const address = new URL(process.env.PORTFOLIO_URL || 'http://127.0.0.1:5174/Corden-Portfolio/');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname), 'PORTFOLIO_URL must be localhost');
const screenshotDir = path.resolve('.work/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const results = [];
const config = await fs.readFile('src/config/portfolio.ts', 'utf8');
const configuredCovers = (config.match(/cover:\s*\{/g) || []).length;
const sceneStops = JSON.parse(await fs.readFile('public/assets/realtime/scene.json', 'utf8')).stops;
const chapterOrder = ['intro', 'paper-a', 'paper-b', 'paper-c', 'paper-d', 'paper-e', 'paper-f', 'screen'];

function url(params = {}) {
  const target = new URL(address);
  target.search = new URLSearchParams(params).toString();
  return target.href;
}
async function setup(viewport = { width: 1440, height: 900 }, { sceneFailure = false, sceneHold = false, brokenCover = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  let releaseScene;
  const sceneGate = new Promise(resolve => { releaseScene = resolve; });
  let failuresRemaining = sceneFailure === true ? Infinity : Number(sceneFailure);
  // Web font dependency is irrelevant to behavior; avoid contacting any external service.
  await context.route('**/*', async route => {
    const requested = new URL(route.request().url());
    if (requested.protocol === 'data:' || requested.protocol === 'blob:') return route.continue();
    if (requested.origin !== address.origin) {
      if (requested.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      throw new Error('Unexpected external browser request: ' + requested.href);
    }
    if (brokenCover && requested.pathname.endsWith('/assets/projects/qwen-dragon.jpg')) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'controlled missing project image' });
    }
    if (requested.pathname.endsWith('/assets/realtime/scene.json') && failuresRemaining > 0) {
      failuresRemaining--;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"test":"controlled-scene-failure"}' });
    }
    if (sceneHold && requested.pathname.endsWith('/assets/realtime/scene.json')) await sceneGate;
    return route.continue();
  });
  const page = await context.newPage();
  const diagnostics = [], realtimeRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/assets/realtime/')) realtimeRequests.push(request.url());
  });
  page.on('pageerror', error => diagnostics.push('PAGE ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.push('CONSOLE ' + message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.push('HTTP ' + response.status() + ' ' + response.url());
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(address.origin) && request.failure()?.errorText !== 'net::ERR_ABORTED') {
      diagnostics.push('REQUEST ' + request.url() + ' ' + request.failure()?.errorText);
    }
  });
  return { context, page, diagnostics, realtimeRequests, releaseScene };
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, name), animations: 'disabled' });
}
async function collectionReady(page) {
  await page.locator('.portfolio-web').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('.project-card').count(), 6, 'six project cards');
  assert.match(await page.title(), /Corden/);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
}
async function sceneReady(page, index) {
  await page.waitForFunction(() => window.__PAPER_3D?.ready || document.querySelector('.error-screen'), undefined, { timeout: 60000 });
  assert.equal(await page.locator('.error-screen').count(), 0, 'normal scene must load');
  await chapterReady(page, index);
}
async function chapterReady(page, index) {
  await page.waitForFunction(({ index, frame }) => window.__PAPER_3D?.ready && !window.__PAPER_3D.moving
    && Math.abs(window.__PAPER_3D.frame - frame) < 0.5
    && document.querySelectorAll('.chapter-marker')[index]?.getAttribute('aria-current') === 'step',
  { index, frame: sceneStops[chapterOrder[index]] }, { timeout: 30000 });
}
async function assertImages(page) {
  const images = page.locator('.project-card img');
  if (!configuredCovers) return;
  assert.equal(await images.count(), configuredCovers, 'configured covers appear on project cards');
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(element => element.decode());
    const info = await image.evaluate(element => ({ width: element.naturalWidth, alt: element.alt, src: element.currentSrc }));
    assert(info.width > 0, 'cover decoded: ' + info.src);
    assert(info.alt.trim().length > 3, 'cover has useful alt');
    assert(new URL(info.src).pathname.startsWith(address.pathname + 'assets/projects/'), 'cover respects deployment base path');
  }
}
async function assertModal(page, index) {
  const card = page.locator('.project-card').nth(index);
  await card.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const close = dialog.locator('.detail-close');
  assert(await close.isVisible(), 'visible close control');
  assert.match(await close.getAttribute('aria-label'), /关闭/);
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  if (index === 3 && page.viewportSize().width <= 390) {
    const fallback = dialog.locator('.project-media__fallback');
    assert(await fallback.isVisible(), 'paper-d authentic text fallback is visible');
    const fits = await fallback.evaluate(element => {
      const bounds = element.closest('.project-media').getBoundingClientRect();
      return Array.from(element.querySelectorAll('.project-media__name,.project-media__evidence')).map(child => {
        const box = child.getBoundingClientRect();
        return { text: child.textContent, fits: box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1
          && box.left >= bounds.left - 1 && box.right <= bounds.right + 1 };
      });
    });
    await capture(page, 'polish-modal-paper-d-' + page.viewportSize().width + '.png');
    assert(fits.every(item => item.fits), 'paper-d modal fallback fits: ' + JSON.stringify(fits));
  }
  assert(await page.locator('.portfolio-nav').evaluate(element => Boolean(element.closest('[inert]'))), 'modal makes navigation inert');
  assert(await page.locator('.portfolio-main').evaluate(element => Boolean(element.closest('[inert]'))), 'modal makes main content inert');
  assert(await page.evaluate(() => ['.portfolio-web', 'html', 'body'].some(selector => {
    const element = document.querySelector(selector);
    return element && /hidden|clip/.test(getComputedStyle(element).overflowY);
  })), 'modal locks background scrolling');
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Shift+Tab remains in modal');
  await page.keyboard.press('Tab');
  assert(await close.evaluate(element => element === document.activeElement), 'Tab wraps to close control');
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Tab remains in modal');
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert(await card.evaluate(element => element === document.activeElement), 'Escape restores triggering card focus');
  assert(!(await page.locator('.portfolio-main').evaluate(element => Boolean(element.closest('[inert]')))), 'background restored');
}
async function run(name, callback) {
  try {
    await callback();
    results.push({ name, status: 'passed' });
    console.log('PASS', name);
  } catch (error) {
    results.push({ name, status: 'failed', message: error.message, stack: error.stack });
    console.error('FAIL', name, error.stack);
  }
}
try {
  await run('direct collection: no 3D fetches, real covers, accessible modal', async () => {
    const state = await setup();
    try {
      await state.page.goto(url({ view: 'collection' }), { waitUntil: 'domcontentloaded' });
      await collectionReady(state.page);
      await capture(state.page, 'polish-collection-desktop.png');
      await assertImages(state.page);
      await assertModal(state.page, 0);
      await assertModal(state.page, 5);
      assert.deepEqual(state.realtimeRequests, [], 'direct collection does not request 3D assets');
      assert.deepEqual(state.diagnostics, [], 'normal collection browser diagnostics');
    } finally { await state.context.close(); }
  });
  await run('controlled broken cover: genuine fallback and honest modal caption', async () => {
    const state = await setup(undefined, { brokenCover: true });
    const { page } = state;
    try {
      await page.goto(url({ view: 'collection' }), { waitUntil: 'domcontentloaded' });
      await collectionReady(page);
      const card = page.locator('.project-card[data-project-id="paper-a"]');
      await card.scrollIntoViewIfNeeded();
      await card.locator('.project-media__fallback').waitFor({ state: 'visible' });
      assert.match(await card.innerText(), /图片暂不可用/);
      await card.click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('.project-media__fallback').waitFor({ state: 'visible' });
      const caption = await dialog.locator('figcaption').innerText();
      assert.match(caption, /图片暂不可用/);
      assert.doesNotMatch(caption, /实际通关录像/);
      assert.equal(await dialog.locator('.project-media img').count(), 0, 'broken image replaced by genuine project record');
      await capture(page, 'polish-broken-cover-fallback.png');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(state.realtimeRequests, [], 'broken cover direct collection avoids 3D');
      const unexpected = state.diagnostics.filter(message => !/qwen-dragon\.jpg|Failed to load resource.*404/i.test(message));
      assert.deepEqual(unexpected, [], 'only controlled missing image diagnostics permitted');
    } finally { await state.context.close(); }
  });
  for (const width of [320, 390]) {
    await run('mobile collection ' + width + ': all navigation and no horizontal overflow', async () => {
      const state = await setup({ width, height: 844 });
      const { page } = state;
      try {
        await page.goto(url({ view: 'collection' }), { waitUntil: 'domcontentloaded' });
        await collectionReady(page);
        const nav = page.locator('.portfolio-nav');
        for (const fragment of ['#works', '#about', '#contact']) {
          const link = nav.locator('a[href="' + fragment + '"]');
          assert(await link.isVisible(), 'mobile nav visible: ' + fragment);
          const box = await link.boundingBox();
          assert(box.x >= -1 && box.x + box.width <= width + 1, 'mobile nav within viewport: ' + fragment);
          await link.click();
          await page.waitForFunction(hash => location.hash === hash, fragment);
          await page.locator(fragment).waitFor({ state: 'visible' });
        }
        const github = page.locator('.portfolio-footer a[href^="https://github.com/"]').first();
        await github.scrollIntoViewIfNeeded();
        assert(await github.isVisible(), 'GitHub contact visible');
        assert.equal(await github.getAttribute('target'), '_blank');
        const overflow = await page.evaluate(() => Math.max(
          document.documentElement.scrollWidth - innerWidth,
          ...Array.from(document.querySelectorAll('.portfolio-web,.portfolio-main,.portfolio-nav')).map(element => element.scrollWidth - element.clientWidth)));
        assert(overflow <= 2, 'mobile horizontal overflow ' + overflow);
        await nav.locator('a[href="#works"]').click();
        await capture(page, 'polish-collection-mobile-' + width + '.png');
        await assertModal(page, 5);
        await assertModal(page, 3);
        assert.deepEqual(state.realtimeRequests, [], 'mobile direct collection avoids 3D');
        assert.deepEqual(state.diagnostics, [], 'normal mobile browser diagnostics');
      } finally { await state.context.close(); }
    });
  }
  await run('loading: Chinese status and early collection escape', async () => {
    const state = await setup(undefined, { sceneHold: true });
    try {
      await state.page.goto(url(), { waitUntil: 'domcontentloaded' });
      const status = state.page.locator('.loading-status');
      await status.waitFor({ state: 'visible' });
      assert.match(await status.innerText(), /正在|准备|加载|构建/);
      assert.match(await status.locator('progress').getAttribute('aria-label'), /场景|加载|资源/);
      await state.page.locator('.loading-screen').getByRole('button', { name: /作品集/ }).click();
      await collectionReady(state.page);
      state.releaseScene();
    } finally { state.releaseScene(); await state.context.close(); }
  });
  await run('realtime journey: Chinese controls, click, markers, screen replay', async () => {
    const state = await setup();
    const { page } = state;
    try {
      await page.goto(url(), { waitUntil: 'domcontentloaded' });
      await sceneReady(page, 0);
      assert.equal(await page.locator('.chapter-marker').count(), 8);
      for (const marker of await page.locator('.chapter-marker').all()) assert((await marker.getAttribute('title'))?.trim(), 'marker has title tooltip');
      assert(await page.getByRole('button', { name: '前一章', exact: true }).isDisabled());
      assert(await page.locator('.scene-chapter-label').isVisible());
      await page.locator('.scene-canvas').click({ position: { x: 720, y: 650 } });
      await chapterReady(page, 1);
      await capture(page, 'polish-after-paper-a.png');
      await page.locator('.chapter-marker').nth(4).click();
      await chapterReady(page, 4);
      await page.locator('.chapter-marker').nth(7).click();
      await chapterReady(page, 7);
      await capture(page, 'polish-end-screen.png');
      await page.getByRole('button', { name: '重新浏览', exact: true }).click();
      await chapterReady(page, 0);
      assert.deepEqual(state.diagnostics, [], 'normal realtime browser diagnostics');
    } finally { await state.context.close(); }
  });
  for (const key of ['Enter', 'Space']) {
    await run('screen keyboard ' + key + ' opens on-site collection', async () => {
      const state = await setup();
      try {
        await state.page.goto(url({ chapter: 'screen' }), { waitUntil: 'domcontentloaded' });
        await sceneReady(state.page, 7);
        await state.page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
        await state.page.keyboard.press(key);
        await collectionReady(state.page);
        assert.deepEqual(state.diagnostics, [], 'screen keyboard browser diagnostics');
      } finally { await state.context.close(); }
    });
  }
  await run('controlled 3D failure: Chinese alert, details, collection escape', async () => {
    const state = await setup(undefined, { sceneFailure: true });
    const { page } = state;
    try {
      await page.goto(url(), { waitUntil: 'domcontentloaded' });
      await page.locator('.error-screen').waitFor({ state: 'visible', timeout: 30000 });
      assert.match(await page.getByRole('alert').innerText(), /场景|加载/);
      assert(await page.locator('.error-screen details').count(), 'technical details are expandable');
      assert(await page.locator('.error-screen').getByRole('button', { name: /重新加载|重试/ }).isVisible());
      await page.locator('.error-screen').getByRole('button', { name: /作品集/ }).click();
      await collectionReady(page);
      const unexpected = state.diagnostics.filter(message => !/503|scene\.json|resource.*503/i.test(message));
      assert.deepEqual(unexpected, [], 'only controlled scene fetch diagnostics permitted');
    } finally { await state.context.close(); }
  });
  await run('controlled first failure: retry rebuilds a ready scene', async () => {
    const state = await setup(undefined, { sceneFailure: 1 });
    try {
      await state.page.goto(url(), { waitUntil: 'domcontentloaded' });
      await state.page.locator('.error-screen').waitFor({ state: 'visible', timeout: 30000 });
      await state.page.locator('.error-screen').getByRole('button', { name: /重新加载|重试/ }).click();
      await sceneReady(state.page, 0);
      const unexpected = state.diagnostics.filter(message => !/503|scene\.json|resource.*503/i.test(message));
      assert.deepEqual(unexpected, [], 'retry has no unexpected diagnostics');
    } finally { await state.context.close(); }
  });
} finally {
  await browser.close();
  const report = { address: address.href, configuredCovers, results, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length };
  await fs.writeFile(path.join(screenshotDir, 'experience-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('EXPERIENCE RESULTS', JSON.stringify(report));
}
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
