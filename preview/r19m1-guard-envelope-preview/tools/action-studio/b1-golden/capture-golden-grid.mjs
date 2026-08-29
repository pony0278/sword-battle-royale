// B1 golden baseline - browser half. Captures, against the shipping lab, the behavioural facts
// stage B1 must not move: the outcome of every saturated cell in the defence grid, and the
// deterministic ledger waypoints of one representative exchange per mechanism (clang, turn,
// plain chase block). Boundary-rate cells (RIGHT@2.0) are recorded as informational only -
// their outcome is a rate, and a golden test that flips on a coin is worse than none.
//
// Usage: node capture-golden-grid.mjs <browser-executable> <base-url> [out.json]
// The committed golden-grid.json was captured at ec631a2; verify-golden-grid.mjs replays it.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const [executablePath, baseUrl, outPath = new URL('./golden-grid.json', import.meta.url).pathname]
  = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: capture-golden-grid.mjs <browser-executable> <base-url> [out.json]');
  process.exit(2);
}
const pageName = process.env.PARRY_GATE_PAGE || 'shield-driven-contact-coupling-lab.html';
const URL_ = `${baseUrl.replace(/\/$/, '')}/${pageName}?debug=1`;

// Saturated cells only: every one of these was measured at 100% across this stage's n>=4 runs.
export const GOLDEN_CELLS = [
  { dir: 'top', stance: 1.4, expect: 'block' }, { dir: 'top', stance: 1.8, expect: 'block' },
  { dir: 'top', stance: 2.0, expect: 'block' }, { dir: 'top', stance: 2.4, expect: 'block' },
  { dir: 'right', stance: 1.4, expect: 'block' }, { dir: 'right', stance: 1.8, expect: 'block' },
  { dir: 'right', stance: 2.4, expect: 'block' },
  { dir: 'left', stance: 1.6, expect: 'block' }, { dir: 'left', stance: 2.0, expect: 'block' },
  { dir: 'left', stance: 2.4, expect: 'block' },
  { dir: 'top', stance: 7.0, expect: 'ignored' },
];

// The waits the driver used to spend in milliseconds, in the only unit that means the same thing
// twice: 0.5s of settle and 2.5s of exchange at the pinned 1/60 step.
const SETTLE_FRAMES = 30;
const EXCHANGE_FRAMES = 150;

async function waitFrames(page, frames) {
  const target = await page.evaluate((n) => window.__G43B5R281_LAB__.frameClock.frames + n, frames);
  await page.waitForFunction((n) => window.__G43B5R281_LAB__.frameClock.frames >= n, target, { timeout: 60000 });
}

export async function runExchange(page, { dir, stance }) {
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  // Readiness is "block mode actually enters", not "the api object exists": setMode samples the
  // Skyrim guard clips, and on a cold load those can still be in flight when the facade appears.
  await page.waitForFunction(() => {
    try { window.__G43B5R281_LAB__.setMode('block'); return true; } catch { return false; }
  }, null, { timeout: 120000 });
  // R20K.1 (B6e): pin the frame step before anything moves. These cells clear the shield by as
  // little as 1cm, so on the wall clock the same cell sampled the swing at whatever phase the
  // browser happened to deliver and landed on either side of that centimetre - about one flipped
  // cell per pass, wandering between cells. Pinned, every wait below is an exact sim duration and
  // a cell reproduces bit for bit: measured 8/8 identical to six decimals, and 5/5 identical
  // again under synthetic main-thread load that fails the block 4 times in 5 on the wall clock.
  await page.evaluate(() => {
    const a = window.__G43B5R281_LAB__;
    if (typeof a.setFixedStepMs !== 'function') throw new Error('R20K.1: lab has no pinned frame step; goldens would be unreproducible');
    a.setFixedStepMs(1000 / 60);
  });
  // R20G.1 (B6c): the guard is an input now. The golden grid describes the guard-up world, so
  // the driver holds it for the whole exchange - the cells themselves are unchanged.
  await page.evaluate(() => window.__G43B5R281_LAB__.setGuardHeld(true));
  await page.evaluate((s) => window.__G43B5R281_LAB__.setEngagementSeparation(s), stance);
  await waitFrames(page, SETTLE_FRAMES);
  return page.evaluate(async ({ d, frames }) => {
    const a = window.__G43B5R281_LAB__;
    const startSep = a.laneGround?.separationMeters ?? null;
    const target = a.frameClock.frames + frames;
    a.restartAttack(d);
    await new Promise((res) => {
      const check = () => (a.frameClock.frames >= target ? res() : requestAnimationFrame(check));
      check();
    });
    const c = a.latestContact;
    return {
      startSep: startSep != null ? +startSep.toFixed(6) : null,
      blocked: c?.contact === true,
      clang: c?.hiltClang === true,
      body: a.latestBodyHit?.contact === true,
      posture: a.latestCloseRangePosture?.posture ?? null,
      relevance: a.latestSwingRelevance?.relevant ?? null,
      settledSep: a.laneGround?.separationMeters != null ? +a.laneGround.separationMeters.toFixed(6) : null,
      settledYawDeg: +((a.defenderFacingYawRadians ?? 0) * 180 / Math.PI).toFixed(2),
    };
  }, { d: dir, frames: EXCHANGE_FRAMES });
}

// Guarded so that importing runExchange (the verifier does) can never re-capture: a golden file
// that rewrites itself before being checked would verify the present against the present.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cells = [];
    for (const cell of GOLDEN_CELLS) {
      const r = await runExchange(page, cell);
      cells.push({ ...cell, ...r });
      console.error(`${cell.dir}@${cell.stance}: blocked=${r.blocked} clang=${r.clang} body=${r.body} posture=${r.posture}`);
    }
    writeFileSync(outPath, JSON.stringify({ capturedAt: 'see-git-log', cells }, null, 1));
    console.log(`golden grid written: ${outPath} (${cells.length} cells)`);
  } finally {
    await browser.close();
  }
}
