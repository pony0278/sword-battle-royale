// R21T.1 — driver for the foot-contact phase probe.
//
// Committed, unlike R20W.1's. That fit produced the authored speeds every gait number here rests
// on and its script was not kept, so when the phases were needed the whole reading had to be
// rebuilt from the comment describing it. The numbers live in
// src/combat/locomotion-phase-alignment.js; this is how to reproduce them.
//
// Usage: node measure-locomotion-phase.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: measure-locomotion-phase.mjs <browser-executable> <base-url>');
  process.exit(2);
}

// The physical test: an in-place clip holds a planted foot still in the world, so the toe travels
// backwards at exactly the authored speed. Absolute, not relative to each clip's height range -
// a fraction means something different in a clip whose toe rises 0.16m and one that rises 0.29m.
const GROUND_HEIGHT_METERS = 0.04;
const SPEED_TOLERANCE = 0.5;
const AUTHORED_SPEED_MPS = { Walking_B: 1.053, Running_A: 3.268, Walking_A: 0.643, Walking_Backwards: -0.623 };

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/locomotion-phase.probe.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.locomotionPhase, null, { timeout: 120000 });
  if (await page.evaluate(() => document.documentElement.dataset.locomotionPhase) !== 'done') {
    console.error(await page.evaluate(() => window.__LOCOMOTION_PHASE_ERROR__));
    process.exit(1);
  }
  const captured = await page.evaluate(() => window.__LOCOMOTION_PHASE__);

  const contacts = {};
  for (const [clipId, series] of Object.entries(captured)) {
    if (!series.samples) { console.error(`${clipId}: ${series.error}`); continue; }
    const authored = AUTHORED_SPEED_MPS[clipId];
    if (authored == null) continue;
    const rows = series.samples;
    const n = rows.length;
    const dt = series.duration / n;
    contacts[clipId] = { cycleSeconds: series.duration, authoredSpeedMps: authored };
    console.log(`\n=== ${clipId}  cycle ${series.duration.toFixed(4)}s · authored ${authored} m/s`);
    for (const [side, bone] of [['left', 'toes.l'], ['right', 'toes.r']]) {
      const y = rows.map((r) => r[bone].y);
      const z = rows.map((r) => r[bone].z);
      const planted = rows.map((_, i) => {
        const speed = Math.abs((z[i] - z[(i - 1 + n) % n]) / dt);
        return y[i] <= GROUND_HEIGHT_METERS
          && Math.abs(speed - Math.abs(authored)) < Math.abs(authored) * SPEED_TOLERANCE;
      });
      // The longest contiguous run, wrapping, because a contact can straddle phase 0.
      let best = null;
      let current = null;
      for (let i = 0; i < n * 2; i += 1) {
        if (planted[i % n]) { current = current || { a: i, b: i }; current.b = i; }
        else if (current) { if (!best || current.b - current.a > best.b - best.a) best = current; current = null; }
      }
      if (current && (!best || current.b - current.a > best.b - best.a)) best = current;
      if (!best) { console.log(`  ${side}: no contact found`); continue; }
      const strike = (best.a % n) / n;
      const lift = (best.b % n) / n;
      contacts[clipId][side] = { strike: Number(strike.toFixed(3)), lift: Number(lift.toFixed(3)) };
      console.log(`  ${side.padEnd(6)} strike ${(strike * 100).toFixed(1)}%  lift ${(lift * 100).toFixed(1)}%`
        + `  stance ${(((best.b - best.a + 1) / n) * 100).toFixed(0)}% of cycle`);
    }
    const { left, right } = contacts[clipId];
    if (left && right) {
      let apart = right.strike - left.strike;
      if (apart < 0) apart += 1;
      console.log(`  feet ${(apart * 100).toFixed(1)}% apart (a symmetric gait is 50%)`);
    }
  }
  const walk = contacts.Walking_B;
  const run = contacts.Running_A;
  if (walk?.left && run?.left) {
    let offset = walk.left.strike - run.left.strike;
    if (offset < 0) offset += 1;
    console.log(`\nRunning_A needs +${(offset * 100).toFixed(1)}% of phase to strike with Walking_B`
      + ` (${(offset * run.cycleSeconds * 1000).toFixed(0)}ms of its own cycle)`);
  }
  if (pageErrors.length > 0) console.error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
}
