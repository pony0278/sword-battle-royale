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

export async function runExchange(page, { dir, stance }) {
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  // Readiness is "block mode actually enters", not "the api object exists": setMode samples the
  // Skyrim guard clips, and on a cold load those can still be in flight when the facade appears.
  await page.waitForFunction(() => {
    try { window.__G43B5R281_LAB__.setMode('block'); return true; } catch { return false; }
  }, null, { timeout: 120000 });
  // R20G.1 (B6c): the guard is an input now. The golden grid describes the guard-up world, so
  // the driver holds it for the whole exchange - the cells themselves are unchanged.
  await page.evaluate(() => window.__G43B5R281_LAB__.setGuardHeld(true));
  await page.evaluate((s) => window.__G43B5R281_LAB__.setEngagementSeparation(s), stance);
  await page.waitForTimeout(500);
  return page.evaluate(async (d) => {
    const a = window.__G43B5R281_LAB__;
    const startSep = a.laneGround?.separationMeters ?? null;
    a.restartAttack(d);
    await new Promise((res) => setTimeout(res, 1600));
    await new Promise((res) => setTimeout(res, 900));
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
  }, dir);
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
