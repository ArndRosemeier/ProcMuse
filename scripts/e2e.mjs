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
// A WebGL canvas without preserveDrawingBuffer reads back blank, so judge what
// the compositor actually shows: screenshot with the interface hidden.
async function litShot(page, path) {
  await page.evaluate(() => document.getElementById('app')?.style.setProperty('visibility', 'hidden'));
  const png = await page.screenshot({ type: 'png', path });
  await page.evaluate(() => document.getElementById('app')?.style.removeProperty('visibility'));
  return page.evaluate(async (b64) => {
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
  }, png.toString('base64'));
}

/** Collects console errors, page errors and failed requests of one page. */
function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} ${m.location().url ?? ''}`.trim()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  return errors;
}

/** Phone layout facts: the sheet, what is open, and whether anything leaves the screen or is too small to tap. */
const phoneLayout = (page) =>
  page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = (el) => el.getBoundingClientRect();
    const inside = (r) => r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;
    const dock = rect(document.querySelector('.pm-dock'));
    const open = [...document.querySelectorAll('.pm-panel:not([hidden])')];
    const targets = [...document.querySelectorAll('.pm-dock-actions button, .pm-panel:not([hidden]) button:not([hidden]), .pm-panel:not([hidden]) select')]
      .filter((el) => el.offsetParent !== null);
    const small = targets.filter((el) => Math.min(rect(el).width, rect(el).height) < 40).map((el) => el.getAttribute('aria-label') || el.textContent);
    return {
      sheet: document.querySelector('.pm-root')?.classList.contains('pm-sheet') ?? false,
      open: open.map((p) => p.querySelector('.pm-panel-title')?.textContent),
      overflowX: document.documentElement.scrollWidth > vw,
      dockInside: inside(dock),
      panelsInside: open.every((p) => inside(rect(p)) && rect(p).bottom <= dock.top + 1),
      small,
    };
  });

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = watchErrors(page);
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

  const visualsShot = (path) => litShot(page, path);
  check(await visualsShot(), 'the visuals draw on the canvas');

  // every scene is selectable in the Visuals panel and draws (scene shots land next to the main screenshot)
  mkdirSync(dirname(opt.screenshot), { recursive: true });
  await page.getByRole('button', { name: 'Visuals', exact: true }).click();
  const sceneSelect = page.getByLabel('Scene', { exact: true });
  const scenes = await sceneSelect.locator('option').evaluateAll((os) => os.map((o) => o.value).filter((v) => v !== 'auto'));
  check(scenes.length >= 5, `the Scene control lists the scenes: ${scenes.join(', ')}`);
  for (const scene of scenes) {
    await sceneSelect.selectOption(scene);
    await page.waitForTimeout(3500); // past the default 2 s crossfade
    const shotPath = join(dirname(opt.screenshot), `e2e-scene-${scene}.png`);
    check(await visualsShot(shotPath), `scene ${scene} draws (${shotPath})`);
  }
  await sceneSelect.selectOption('auto');
  await page.getByRole('button', { name: 'Visuals', exact: true }).click();
  const sceneErrors = await page.$$eval('.pm-error', (els) => els.map((e) => e.textContent));
  check(sceneErrors.length === 0 && consoleErrors.length === 0, `no errors while switching scenes ${JSON.stringify([...sceneErrors, ...consoleErrors].slice(0, 5))}`);

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

  // the Band panel lists every instrument a part can play, and switching one sounds without errors
  await page.locator('.pm-dock').getByRole('button', { name: 'Band', exact: true }).click();
  const lead = page.getByLabel('Lead instrument', { exact: true });
  const leadOptions = await lead.locator('option').allTextContents();
  check(['Bagpipe', 'Theremin', 'Tribal Horn', 'Tubular Bell', 'Rock Organ'].every((o) => leadOptions.includes(o)), `Band panel offers the new lead instruments (${leadOptions.length} options)`);
  await lead.selectOption({ label: 'Bagpipe' });
  await page.getByLabel('Texture instrument', { exact: true }).selectOption({ label: 'Bagpipe Drones' });
  await page.waitForTimeout(1500);
  const errorsAfterSwitch = await page.$$eval('.pm-error', (els) => els.map((e) => e.textContent));
  check(errorsAfterSwitch.length === 0 && consoleErrors.length === 0, `switching to the bagpipes raises no errors ${JSON.stringify([...errorsAfterSwitch, ...consoleErrors].slice(0, 5))}`);

  await page.screenshot({ path: opt.screenshot });
  console.log(`      screenshot: ${opt.screenshot}`);
  await page.close();

  // each fresh start composes something new; a share link still pins its seed
  const seedOf = async (url) => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await p.goto(url);
    await p.getByRole('button', { name: 'Start the music' }).click();
    await p.waitForSelector('.pm-root', { timeout: 15000 });
    const seed = await p.getByRole('slider', { name: 'Seed', exact: true }).getAttribute('aria-valuetext');
    await p.close();
    return seed;
  };
  const freshSeeds = [await seedOf(`http://127.0.0.1:${port}/`), await seedOf(`http://127.0.0.1:${port}/`)];
  check(freshSeeds[0] !== freshSeeds[1], `two fresh starts pick different seeds (${freshSeeds.join(', ')})`);
  const shareLink = Buffer.from(JSON.stringify({ 'music.seed': 1234 })).toString('base64url');
  const sharedSeed = await seedOf(`http://127.0.0.1:${port}/#p=${shareLink}`);
  check(/\b1234\b/.test(sharedSeed ?? ''), `a share link restores its seed (${sharedSeed})`);

  // a phone: touch, portrait then landscape (shots land next to the main screenshot)
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const phoneErrors = watchErrors(phone);
  await phone.goto(`http://127.0.0.1:${port}/`);
  check(!(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'phone: the start screen fits the width');
  await phone.getByRole('button', { name: 'Start the music' }).tap();
  await phone.waitForSelector('.pm-root', { timeout: 15000 });
  await phone.waitForTimeout(3000);
  let layout = await phoneLayout(phone);
  check(layout.sheet, 'phone portrait: panels use the sheet layout');
  check(layout.open.length === 1 && layout.open[0] === 'Mood', `phone portrait: one sheet open (${layout.open.join(', ')})`);
  check(!layout.overflowX && layout.dockInside && layout.panelsInside, `phone portrait: everything on screen, sheet above the dock ${JSON.stringify(layout)}`);
  check(layout.small.length === 0, `phone portrait: every tap target is at least 40 px ${JSON.stringify(layout.small)}`);
  await phone.locator('.pm-dock').getByRole('button', { name: 'Band', exact: true }).tap();
  layout = await phoneLayout(phone);
  check(layout.open.length === 1 && layout.open[0] === 'Band', `phone: a dock tap switches the sheet (${layout.open.join(', ')})`);
  await phone.getByRole('button', { name: 'Hide Band panel' }).tap();
  check((await phoneLayout(phone)).open.length === 0, 'phone: the sheet closes, leaving the visuals');
  await phone.locator('.pm-dock').getByRole('button', { name: 'Mood', exact: true }).tap();
  const portraitShot = join(dirname(opt.screenshot), 'e2e-phone-portrait.png');
  check(await litShot(phone), 'phone portrait: the visuals draw');
  await phone.screenshot({ path: portraitShot });
  console.log(`      screenshot: ${portraitShot}`);

  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForTimeout(1500);
  layout = await phoneLayout(phone);
  check(layout.sheet && layout.open[0] === 'Mood', `phone landscape: still one sheet (${layout.open.join(', ')})`);
  check(!layout.overflowX && layout.dockInside && layout.panelsInside, `phone landscape: everything on screen, sheet above the dock ${JSON.stringify(layout)}`);
  check(layout.small.length === 0, `phone landscape: every tap target is at least 40 px ${JSON.stringify(layout.small)}`);
  const landscapeShot = join(dirname(opt.screenshot), 'e2e-phone-landscape.png');
  await phone.screenshot({ path: landscapeShot });
  console.log(`      screenshot: ${landscapeShot}`);
  const phoneShown = await phone.$$eval('.pm-error', (els) => els.map((e) => e.textContent));
  check(phoneShown.length === 0 && phoneErrors.length === 0, `phone: no errors ${JSON.stringify([...phoneShown, ...phoneErrors].slice(0, 5))}`);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`E2E RED: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('E2E GREEN');
