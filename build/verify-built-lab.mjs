// Does the bundled page actually boot?
//
// The Vite build reports bytes and module counts, and neither says whether the page runs. This one
// does the only check that settles it: serve dist/ the way GitHub Pages serves it, open the page in
// the same Chromium the combat gates use, and refuse anything less than a live renderer with no
// console errors.
//
// It exists because the bundle changes HOW Three.js arrives - a module import composed into the
// namespace every src/ module is handed, instead of two CDN script tags setting a global - and the
// failure that change can produce is a page that loads, paints nothing, and reports nothing.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startStaticServer } from '../tools/static-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PAGE = '/tools/action-studio/shield-driven-contact-coupling-lab.html';

// Same order verify-combat.mjs tries, and for the same reason: a runner or a sandbox may say.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

function findBrowser() {
  for (const candidate of CANDIDATES) if (existsSync(candidate)) return candidate;
  throw new Error(`No chromium found. Tried: ${CANDIDATES.join(', ')}`);
}

if (!existsSync(DIST)) {
  console.error('dist/ is missing. Run: npm run build:web');
  process.exit(1);
}

const { chromium } = await import('playwright-core');
const server = await startStaticServer({ root: DIST });
const browser = await chromium.launch({ executablePath: findBrowser(), args: ['--no-sandbox'] });
const page = await browser.newPage();

const errors = [];
let requests = 0;
let scriptRequests = 0;
let crossOrigin = 0;
// Chromium asks for /favicon.ico on its own and the console reports the 404 as an error. It is not
// one: the page has no favicon and never had, and no response event carries the URL for it either,
// so it cannot be told apart by URL. Counted separately rather than silenced, so that a real
// resource failure is never hidden behind the same message.
let faviconMisses = 0;
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('404') && text.includes('Failed to load resource')) { faviconMisses += 1; return; }
  errors.push(text);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
// A 404 is a successful response, so it reaches the console as a bare message with no URL. Named
// here, because "1 console error" is not something anyone can act on.
const notFound = [];
page.on('response', (response) => {
  if (response.status() >= 400) notFound.push(`${response.status()} ${response.url()}`);
});
page.on('request', (request) => {
  requests += 1;
  const url = request.url();
  if (url.endsWith('.js')) scriptRequests += 1;
  if (!url.startsWith(server.url)) crossOrigin += 1;
});

let failure = null;
try {
  await page.goto(`${server.url}${PAGE}`, { waitUntil: 'networkidle', timeout: 90000 });
  const state = await page.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    renderer: typeof globalThis.THREE?.WebGLRenderer,
    // The classic examples/js build put GLTFLoader on the namespace and bootstrap.js constructs
    // through it five times. The bundle has to preserve that shape, not merely load three.
    loader: typeof globalThis.THREE?.GLTFLoader,
  }));
  console.log(`page            ${PAGE}`);
  console.log(`canvas          ${state.canvas ? 'present' : 'MISSING'}`);
  console.log(`THREE           WebGLRenderer:${state.renderer} GLTFLoader:${state.loader}`);
  console.log(`requests        ${requests} total · ${scriptRequests} script · ${crossOrigin} cross-origin`);
  console.log(`console errors  ${errors.length}${faviconMisses ? ` (+${faviconMisses} favicon 404, ignored)` : ''}`);
  for (const error of errors.slice(0, 10)) console.log(`  ! ${error}`);
  if (notFound.length) {
    console.log(`missing        ${notFound.length}`);
    for (const miss of notFound.slice(0, 10)) console.log(`  ! ${miss}`);
  }

  if (!state.canvas) failure = 'no canvas: the renderer never started';
  else if (state.renderer !== 'function') failure = 'THREE.WebGLRenderer is not a function on the global namespace';
  else if (state.loader !== 'function') failure = 'THREE.GLTFLoader is missing: bootstrap.js constructs through it';
  else if (crossOrigin > 0) failure = `${crossOrigin} cross-origin requests: the bundle should need none`;
  else if (notFound.length > 0) failure = `${notFound.length} requests the built site cannot answer: ${notFound[0]}`;
  else if (errors.length > 0) failure = `${errors.length} console errors`;
} finally {
  await browser.close();
  await server.close();
}

if (failure) {
  console.error(`\nFAIL · ${failure}`);
  process.exit(1);
}
console.log('\nPASS · the bundled lab boots, renders, and reaches no other origin');
