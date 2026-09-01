// R21R.1 — how much of the picture tells the three attacks apart, frame by frame.
//
// Every readability argument this project has had ran aground on the same thing: a probe that
// reads the direction from the API already knows the answer, so it measures nothing about whether
// the answer is on screen. Telling the player the direction in advance scored 86% and said only
// that the hand and the window are fine.
//
// So this looks at pixels. At a given moment in the swing it renders all three directions and asks
// how different the three pictures are FROM EACH OTHER. No blade segmentation, no assumption about
// what a sword looks like: if the frames are identical, nothing could tell them apart; if they
// differ, something might.
//
// It reports an UPPER BOUND on legibility, and the bound is one-sided on purpose:
//
//   - if even this cannot separate the three at time T, no human can, and that is a settled fact
//   - if it can, that only means the information EXISTS - not that a person notices it, attends to
//     it, or has any reaction time left to use it
//
// The second half is why this does not replace a playtest. A pixel comparison has no attention and
// no reaction time, and it will happily count a three-pixel difference no eye would catch.
//
// What it found, first run, tempo 2x, 384x384 (and identical at 128x128, so not a resolution
// artifact):
//
//   - the three attacks are NEVER identical. The closest pair is separated by 3.9%-6.0% of the
//     picture at every moment of the swing, shallowest at 200ms and widest near contact. So
//     "there is nothing on screen to read" is false, and the blade-tip measurements that suggested
//     it were describing the tip rather than the picture.
//
//   - but the difference has no LATERAL signature. Each attack's distinctive pixels sit at -0.05
//     to -0.15 on a -1..+1 axis - all three in the same place, just left of centre, which is where
//     the attacker stands. A viewer asking "which side is this coming from" gets no answer from
//     the picture; the three differ in the attacker's BODY, in one place, not in where they are.
//
// That is why TOP reads and the lateral pair does not. TOP differs by HEIGHT, which is a large
// body-pose change; RIGHT and LEFT differ mostly by where a thin blade is, and a blade is a
// handful of pixels against a whole fighter. Making the lateral pair legible means giving them
// distinct body poses, not just distinct blade paths.
//
// Usage: node measure-direction-legibility.mjs <browser-executable> <base-url> [tempoScale]
import { chromium } from 'playwright-core';

const [executablePath, baseUrl, tempoArg] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: measure-direction-legibility.mjs <browser-executable> <base-url> [tempoScale]');
  process.exit(2);
}
const tempoScale = Number(tempoArg) || 1;
const pageName = process.env.PARRY_GATE_PAGE || 'shield-driven-contact-coupling-lab.html';
const PAGE_URL = `${baseUrl.replace(/\/$/, '')}/${pageName}?tempo=${tempoScale}`;

// R21R.1 second pass: 128 was too coarse and the first run said so. At 128 each cell averaged
// about seven source pixels, a blade is one or two pixels wide, and the sword vanished into the
// background - every direction's "distinctive" mass came out at the same place, because what was
// left was the attacker's BODY. 384 keeps the blade as its own signal.
const GRID = 384;
// Two thresholds because "noticeably different" is not one number. 8/255 is about where a large
// flat patch stops looking the same; 24 is a difference nobody would argue with.
const THRESHOLDS = [8, 24];
const DIRECTIONS = ['top', 'right', 'left'];

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__G43B5R281_LAB__?.attackRuntime, null, { timeout: 120000 });

  const captured = await page.evaluate(async ({ grid, directions, thresholds }) => {
    const api = window.__G43B5R281_LAB__;
    const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
    // The HUD and the sector indicator are the answer written down; leaving them in would measure
    // our own overlay rather than the fight.
    document.body.classList.add('overlays-off');
    const slowReview = document.getElementById('slowReview');
    if (slowReview) slowReview.checked = false;
    const gl = document.getElementById('canvas');
    const scratch = document.createElement('canvas');
    scratch.width = grid; scratch.height = grid;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    const grab = () => {
      ctx.drawImage(gl, 0, 0, grid, grid);
      const { data } = ctx.getImageData(0, 0, grid, grid);
      const luma = new Array(grid * grid);
      for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        luma[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      }
      return luma;
    };
    for (let i = 0; i < 600; i += 1) { if (api.restartAttack('top')) break; await nextFrame(); }
    while (api.attackRuntime.active) await nextFrame();
    api.setFixedStepMs(8);

    const frames = {};
    let contactMs = 0;
    for (const direction of directions) {
      for (let i = 0; i < 200; i += 1) await nextFrame();
      api.resetLane?.();
      api.setMode('block');
      for (let i = 0; i < 60; i += 1) await nextFrame();
      for (let i = 0; i < 600; i += 1) { if (api.restartAttack(direction)) break; await nextFrame(); }
      contactMs = Math.round((api.attackRuntime.snapshot?.action?.runtime?.contactSeconds ?? 0) * 1000);
      const series = [];
      for (let i = 0; i < 600 && api.attackRuntime.active; i += 1) {
        await nextFrame();
        const ms = Math.round((api.attackRuntime.snapshot?.elapsedSeconds ?? 0) * 1000);
        if (ms > contactMs) break;
        series.push({ ms, luma: grab() });
      }
      frames[direction] = series;
    }

    // The comparison runs HERE, not in node: at this resolution the frames are megabytes each and
    // only the handful of numbers below is worth carrying across.
    const step = Math.max(8, Math.round(contactMs / 20 / 8) * 8);
    const at = (direction, ms) => frames[direction].find((row) => row.ms >= ms) || null;
    const differing = (a, b, threshold) => {
      let count = 0;
      for (let i = 0; i < a.length; i += 1) if (Math.abs(a[i] - b[i]) >= threshold) count += 1;
      return count / a.length;
    };
    const distinctiveCentre = (self, others, threshold) => {
      let weight = 0; let sum = 0;
      for (let i = 0; i < self.length; i += 1) {
        let mean = 0;
        for (const o of others) mean += o[i];
        mean /= others.length;
        const delta = Math.abs(self[i] - mean);
        if (delta < threshold) continue;
        const x = ((i % grid) / (grid - 1)) * 2 - 1;
        sum += x * delta; weight += delta;
      }
      return weight > 0 ? sum / weight : null;
    };
    const pairs = [['top', 'right'], ['top', 'left'], ['right', 'left']];
    const table = [];
    for (let ms = step; ms <= contactMs; ms += step) {
      const rows = Object.fromEntries(directions.map((d) => [d, at(d, ms)]));
      if (directions.some((d) => !rows[d])) continue;
      const scored = pairs.map(([a, b]) => ({ pair: `${a}/${b}`, score: differing(rows[a].luma, rows[b].luma, thresholds[0]) }));
      table.push({
        ms,
        separation: thresholds.map((t) => Math.min(...pairs.map(([a, b]) => differing(rows[a].luma, rows[b].luma, t)))),
        closestPair: scored.slice().sort((x, y) => x.score - y.score)[0].pair,
        centres: directions.map((d) => distinctiveCentre(
          rows[d].luma, directions.filter((o) => o !== d).map((o) => rows[o].luma), thresholds[0],
        )),
      });
    }
    return { contactMs, table };
  }, { grid: GRID, directions: DIRECTIONS, thresholds: THRESHOLDS });

  const { contactMs, table } = captured;
  console.log(`\nDirection legibility · tempo ${tempoScale}× · contact ${contactMs}ms · ${GRID}×${GRID} luma`);
  console.log('Left block: how much of the picture separates the CLOSEST pair of the three attacks.');
  console.log('Right block: where each attack\'s OWN pixels sit, -1 (hard left) to +1 (hard right).');
  console.log('An upper bound: a pixel comparison has no attention and no reaction time.\n');
  console.log(['elapsed', 'ttc', ...THRESHOLDS.map((t) => `>=${t}`), 'closest',
    ...DIRECTIONS.map((d) => `${d} sits at`)].join('\t'));
  for (const row of table) {
    console.log([
      row.ms, contactMs - row.ms,
      ...row.separation.map((c) => `${(c * 100).toFixed(2)}%`),
      row.closestPair,
      ...row.centres.map((c) => (c == null ? '—' : `${c >= 0 ? '+' : ''}${c.toFixed(2)}`)),
    ].join('\t'));
  }
  if (pageErrors.length > 0) console.error(`page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
}
