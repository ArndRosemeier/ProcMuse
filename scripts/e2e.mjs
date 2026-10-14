#!/usr/bin/env node
// Browser smoke test of the built app (dist/): serves it, drives headless Chromium,
// and fails loudly on any error. Usage: node scripts/e2e.mjs [--screenshot <path>] [--seconds N]
// Chromium: set PLAYWRIGHT_CHROMIUM to an executable, or install one with `npx playwright-core install chromium`.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const DIST = join(ROOT, 'dist');
const args = process.argv.slice(2);
const opt = { screenshot: join(ROOT, 'renders', 'e2e.png'), seconds: 8 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--screenshot') opt.screenshot = args[++i];
  else if (args[i] === '--seconds') opt.seconds = Number(args[++i]);
  else throw new Error(`unknown argument ${args[i]}`);
}
if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/index.html missing: run npm run build first');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const path = normalize(join(DIST, url === '/' ? 'index.html' : url));
  if (!path.startsWith(DIST) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch({
  executablePath,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`);

  const start = page.getByRole('button', { name: 'Start the music' });
  check(await start.isVisible(), 'start button is visible and named');
  check(await page.evaluate(() => document.activeElement?.textContent === 'Start the music'), 'start button has focus');
  await start.click();
  await page.waitForSelector('.pm-root', { timeout: 15000 });
  await page.waitForTimeout(opt.seconds * 1000);

  const errorsShown = await page.$$eval('.pm-error', (els) => els.map((e) => e.textContent));
  check(errorsShown.length === 0, `no errors on the error surface ${errorsShown.length ? JSON.stringify(errorsShown) : ''}`);
  check(consoleErrors.length === 0, `no console errors ${consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 5)) : ''}`);

  const now = await page.$$eval('.pm-now dd', (els) => els.map((e) => e.textContent));
  console.log(`      now playing: ${now.join(' | ')}`);
  check(now.length === 6 && now[3] !== '—' && now[3] !== '', 'music events reach the page (a chord is shown)');
  check(/BPM/.test(now[4] ?? ''), 'tempo is shown');

  const panels = await page.$$eval('.pm-panel:not([hidden]) .pm-panel-title', (els) => els.map((e) => e.textContent));
  check(panels.includes('Mood') && panels.includes('Music'), `default panels visible: ${panels.join(', ')}`);

  // A WebGL canvas without preserveDrawingBuffer reads back blank, so judge what
  // the compositor actually shows: screenshot with the interface hidden.
  await page.evaluate(() => document.getElementById('app')?.style.setProperty('visibility', 'hidden'));
  const shot = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => document.getElementById('app')?.style.removeProperty('visibility'));
  const canvasDrawn = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 36;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
    return lit > 64 * 36 * 0.05;
  }, shot);
  check(canvasDrawn, 'the visuals draw on the canvas');

  // keyboard: help dialog opens with ?, closes with Escape
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 700, y: 450 } });
  await page.keyboard.press('?');
  check(await page.locator('dialog.pm-dialog[open]').isVisible(), '? opens the keyboard help');
  await page.keyboard.press('Escape');
  check(!(await page.locator('dialog.pm-dialog[open]').count()), 'Escape closes the help');

  // a control changes the engine: energy slider via keyboard
  const energy = page.getByRole('slider', { name: 'Energy' });
  await energy.focus();
  const before = await energy.getAttribute('aria-valuetext');
  await energy.press('ArrowRight');
  await energy.press('ArrowRight');
  const after = await energy.getAttribute('aria-valuetext');
  check(before !== after, `energy slider responds to the keyboard (${before} → ${after})`);

  mkdirSync(dirname(opt.screenshot), { recursive: true });
  await page.screenshot({ path: opt.screenshot });
  console.log(`      screenshot: ${opt.screenshot}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`E2E RED: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('E2E GREEN');
