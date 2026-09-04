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
const AUTHORED_SPEED_MPS = { Walking_B: 1.053, Running_A: 3.268, Running_B: 7.2, Walking_A: 0.643, Walking_Backwards: -0.623 };

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
  // R21Y.1: how different the upper body actually is, per candidate run clip. R21T.2 computed this
  // once by hand for Running_A and the script was not kept - the same mistake R21T.1's header
  // complains about - so it lives here now. Compared at the ALIGNED phase, because two clips
  // sampled at the same raw phase are in different parts of their stride and would report a
  // divergence that is mostly just being out of step.
  const walkSeries = captured.Walking_B?.samples;
  for (const runId of ['Running_A', 'Running_B']) {
    const runSeries = captured[runId]?.samples;
    const run = contacts[runId];
    if (!walkSeries || !runSeries || !walk?.left || !run?.left) continue;
    let offset = walk.left.strike - run.left.strike;
    if (offset < 0) offset += 1;
    console.log(`\n=== ${runId} vs Walking_B, sampled at walkPhase - ${(offset * 100).toFixed(1)}%`);
    const bones = Object.keys(walkSeries[0].upper).filter((id) => walkSeries[0].upper[id] && runSeries[0].upper[id]);
    const rows = [];
    for (const id of bones) {
      let peak = 0;
      let total = 0;
      for (let i = 0; i < walkSeries.length; i += 1) {
        const a = walkSeries[i].upper[id];
        // MINUS, matching alignedRunPhase(): the run needs +offset to reach the walk's phase, so
        // the run sample that belongs to this walk frame sits offset EARLIER in its own cycle.
        // Added instead of subtracted, this reads 50.3 degrees at hand.r where the committed
        // R21T.2 figure is 40.9 - the two clips compared while out of step by twice the offset.
        const shifted = ((i / walkSeries.length - offset) % 1 + 1) % 1;
        const j = Math.round(shifted * runSeries.length) % runSeries.length;
        const b = runSeries[j].upper[id];
        // The angle between two rotations: 2*acos(|dot|), which is sign-independent, so a pair on
        // opposite sides of the hypersphere does not read as a half-turn apart.
        const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
        const degrees = 2 * Math.acos(dot) * 180 / Math.PI;
        total += degrees;
        if (degrees > peak) peak = degrees;
      }
      rows.push({ id, mean: total / walkSeries.length, peak });
    }
    rows.sort((a, b) => b.mean - a.mean);
    for (const row of rows) console.log(`  ${row.id.padEnd(12)} mean ${row.mean.toFixed(1)}°  peak ${row.peak.toFixed(1)}°`);
  }

  if (pageErrors.length > 0) console.error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
}
