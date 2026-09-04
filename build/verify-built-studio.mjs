// Does the bundled Action Studio boot, and does its Guard Runtime still answer?
//
// Two questions in one pass, because they fail together and the second is unreadable without the
// first. verify-built-lab.mjs asks the boot question of the page the community plays; this asks it
// of the authoring page, and then drives the deterministic sampler that
// tools/action-studio/verify-guard-runtime-surface.sh has been asking for from inside the page.
//
// WHY IT EXISTS AS A SECOND GATE RATHER THAN A REPLACEMENT: the shell gate drives the STANDALONE
// classic bundle, which is a different delivery of the same source and still has to work over
// file://. This one drives the Vite build. Both are real; neither stands in for the other.
//
// The practical difference is that this one runs anywhere. The standalone page fetches Three.js
// from cdnjs and its GLTFLoader from jsdelivr, so a sandbox without open network cannot run the
// shell gate at all - measured: `Action Studio requires Three.js r128`, after a tunnel failure,
// with no asset request made. The bundled page reaches one origin, so the sampler can be driven on
// a laptop and in CI alike.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startStaticServer } from '../tools/static-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PAGE = '/tools/action-studio/index.html';

// The committed record this gate reproduces. Same three values the in-page gate checks, and the
// same tolerance: G3.6.3's parry recovery is sampled at 820ms of source time, and the window is
// +/-10ms because the sampler steps in whole frames.
const SAMPLE_MODE = 'parry';
const SAMPLE_MS = 820;
const EXPECTED_STATE = 'guard_parry';
const EXPECTED_CLIP = 'SKYRIM_GUARD/power_parry_g363';
const SOURCE_MS_MIN = 810;
const SOURCE_MS_MAX = 830;

// The greatsword pack, which is loaded through the page's own External Motion Library controls
// rather than a sampler. There is no in-page gate for it and no committed numbers to reproduce -
// the question is only whether the clip the bake produced can be selected and retargeted by the
// built page at all, which is the thing a person opening the studio would try first.
const GREATSWORD_SOURCE = 'greatsword';
const GREATSWORD_CLIP = 'SKYRIM_GREATSWORD/2hm_idle';

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
let crossOrigin = 0;
// Chromium asks for /favicon.ico itself and the console reports the 404 as an error. Counted apart
// rather than silenced, so a real resource failure is never hidden behind the same message.
let faviconMisses = 0;
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('404') && text.includes('Failed to load resource')) { faviconMisses += 1; return; }
  errors.push(text);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
const notFound = [];
page.on('response', (response) => {
  if (response.status() >= 400) notFound.push(`${response.status()} ${response.url()}`);
});
page.on('request', (request) => {
  requests += 1;
  if (!request.url().startsWith(server.url)) crossOrigin += 1;
});

let failure = null;
try {
  await page.goto(`${server.url}${PAGE}`, { waitUntil: 'networkidle', timeout: 120000 });

  const boot = await page.evaluate(() => ({
    entry: document.documentElement.dataset.actionStudioEntry || null,
    canvas: !!document.querySelector('canvas'),
    renderer: typeof globalThis.THREE?.WebGLRenderer,
    loader: typeof globalThis.THREE?.GLTFLoader,
  }));
  console.log(`page            ${PAGE}`);
  console.log(`entry           ${boot.entry}`);
  console.log(`canvas          ${boot.canvas ? 'present' : 'MISSING'}`);
  console.log(`THREE           WebGLRenderer:${boot.renderer} GLTFLoader:${boot.loader}`);
  console.log(`requests        ${requests} total · ${crossOrigin} cross-origin`);
  console.log(`console errors  ${errors.length}${faviconMisses ? ` (+${faviconMisses} favicon 404, ignored)` : ''}`);
  for (const error of errors.slice(0, 10)) console.log(`  ! ${error}`);
  if (notFound.length) for (const miss of notFound.slice(0, 10)) console.log(`  ! ${miss}`);

  if (!boot.canvas) failure = 'no canvas: the renderer never started';
  else if (boot.renderer !== 'function') failure = 'THREE.WebGLRenderer is not a function on the global namespace';
  else if (boot.loader !== 'function') failure = 'THREE.GLTFLoader is missing: bootstrap.js constructs through it';
  else if (crossOrigin > 0) failure = `${crossOrigin} cross-origin requests: the bundled page should need none`;
  else if (notFound.length > 0) failure = `${notFound.length} requests the built site cannot answer: ${notFound[0]}`;
  else if (errors.length > 0) failure = `${errors.length} console errors`;

  if (!failure) {
    // The controller publishes its sampler once the studio has built its rig, which is after the
    // page has settled. Waited for rather than slept on, and named if it never arrives. Not waited
    // on `ready`: sampleAt awaits ensureLoaded itself, so the clips arrive on the first call and a
    // runtime that is merely idle is not a failure.
    const published = await page.waitForFunction(
      () => typeof globalThis.__ACTION_STUDIO_GUARD_RUNTIME__?.sampleAt === 'function',
      null,
      { timeout: 120000 },
    ).then(() => true).catch(() => false);
    if (!published) {
      failure = 'the Guard Runtime never published a sampler: window.__ACTION_STUDIO_GUARD_RUNTIME__ is missing';
    } else {
      const sample = await page.evaluate(async ({ mode, ms }) => {
        const runtime = globalThis.__ACTION_STUDIO_GUARD_RUNTIME__;
        const result = await runtime.sampleAt(mode, ms);
        const report = result?.report || runtime.report || {};
        return {
          state: String(result?.snapshot?.state || runtime.snapshot?.state || ''),
          mode: runtime.mode,
          clipId: String(report.clipId || ''),
          sourceMs: Math.round((Number(report.sourceTimeSeconds) || 0) * 1000),
        };
      }, { mode: SAMPLE_MODE, ms: SAMPLE_MS });

      console.log(`guard sample    ${SAMPLE_MODE}@${SAMPLE_MS}ms · state:${sample.state} mode:${sample.mode} clip:${sample.clipId} source:${sample.sourceMs}ms`);
      if (sample.state !== EXPECTED_STATE) failure = `guard state ${sample.state}, expected ${EXPECTED_STATE}`;
      else if (sample.mode !== SAMPLE_MODE) failure = `guard mode ${sample.mode}, expected ${SAMPLE_MODE}`;
      else if (sample.clipId !== EXPECTED_CLIP) failure = `guard clip ${sample.clipId}, expected ${EXPECTED_CLIP}`;
      else if (sample.sourceMs < SOURCE_MS_MIN || sample.sourceMs > SOURCE_MS_MAX) {
        failure = `guard source time ${sample.sourceMs}ms, outside ${SOURCE_MS_MIN}-${SOURCE_MS_MAX}ms`;
      }
    }
  }
  if (!failure) {
    const greatsword = await page.evaluate(async ({ source, clipId }) => {
      const pack = document.getElementById('animationPackSource');
      const options = [...pack.options].map((option) => option.value);
      if (!options.includes(source)) return { options, loaded: false, clips: [] };
      pack.value = source;
      pack.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('loadKayKitAnimations').click();
      const clipSelect = document.getElementById('kaykitClip');
      // The load fetches and retargets; polled rather than slept on, and given up on loudly.
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        if ([...clipSelect.options].some((option) => option.value === clipId)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        options,
        loaded: [...clipSelect.options].some((option) => option.value === clipId),
        clips: [...clipSelect.options].map((option) => option.value).filter(Boolean),
        status: document.getElementById('kaykitStatus')?.textContent || '',
      };
    }, { source: GREATSWORD_SOURCE, clipId: GREATSWORD_CLIP });

    // And the stage weapon, which is the other half of "see the two-handed idle": the pose read
    // while the figure holds a longsword says very little. Driven through the page's own select
    // rather than the swap function, because the wiring between them is what could break.
    const weapon = await page.evaluate(async () => {
      const select = document.getElementById('stageWeapon');
      if (!select) return { present: false };
      const before = globalThis.__actionStudio?.weaponRigId;
      select.value = 'greatsword';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        present: true,
        before,
        after: globalThis.__actionStudio?.weaponRigId,
        stillInHand: globalThis.__actionStudio?.handRWeaponAttached,
      };
    });

    console.log(`pack options    ${greatsword.options.join(', ')}`);
    console.log(`greatsword      ${greatsword.loaded ? 'loaded' : 'NOT LOADED'} · clips: ${greatsword.clips.join(', ') || 'none'}`);
    if (greatsword.status) console.log(`                ${greatsword.status}`);

    console.log(`stage weapon    ${weapon.present ? `${weapon.before} -> ${weapon.after}` : 'NO SELECTOR'}`);

    if (!weapon.present) failure = 'the stage weapon selector (#stageWeapon) is missing';
    else if (weapon.after !== 'v3_procedural_greatsword') failure = `stage weapon is ${weapon.after}, expected v3_procedural_greatsword`;
    else if (!weapon.stillInHand) failure = 'the swapped weapon is not attached to HAND_R';
    else if (!greatsword.options.includes(GREATSWORD_SOURCE)) {
      failure = `the pack selector offers no "${GREATSWORD_SOURCE}" source: ${greatsword.options.join(', ')}`;
    } else if (!greatsword.loaded) {
      failure = `${GREATSWORD_CLIP} never reached the clip list: ${greatsword.clips.join(', ') || 'the list stayed empty'}`;
    } else if (errors.length > 0) {
      failure = `${errors.length} console errors while loading the greatsword pack: ${errors[0]}`;
    } else if (notFound.length > 0) {
      failure = `the built site could not answer ${notFound[0]}`;
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failure) {
  console.error(`\nFAIL · ${failure}`);
  process.exit(1);
}
console.log('\nPASS · the bundled Action Studio boots on one origin, its Guard Runtime reproduces the record, and the greatsword pack loads');
