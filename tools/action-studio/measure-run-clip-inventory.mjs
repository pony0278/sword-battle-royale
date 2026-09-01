// R22B.1 - driver for the run-clip inventory probe. Committed, like R21T.1's, so the second
// opinion on the authored speeds can be re-taken rather than remembered.
//
// Usage: node measure-run-clip-inventory.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: measure-run-clip-inventory.mjs <browser-executable> <base-url>');
  process.exit(2);
}
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${baseUrl.replace(/\/$/, '')}/run-clip-inventory.probe.html`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.runClipInventory, null, { timeout: 120000 });
if (await page.evaluate(() => document.documentElement.dataset.runClipInventory) !== 'done') {
  console.error(await page.evaluate(() => window.__RUN_CLIP_INVENTORY_ERROR__)); process.exit(1);
}
const data = await page.evaluate(() => window.__RUN_CLIP_INVENTORY__);
// Every run/jog-shaped name the packs hold. If a JOG existed - a clip drawn for 1.5-2 m/s - it
// would solve the whole problem, so the absence is the finding.
console.log('run/jog-shaped clips in the packs:',
  data.available.filter((n) => /run|jog|sprint|dash/i.test(n)).join(', ') || '(none)');
for (const [id, s] of Object.entries(data)) {
  if (id === 'available') continue;
  if (s.error) { console.log(`${id}: ${s.error}`); continue; }
  const n = s.rows.length; const dt = s.duration / n;
  // The lowest 15% of toe heights is the contact; the authored speed is how fast the planted toe
  // travels backwards there. Fitted per foot and cross-checked, the way R20W.1 did.
  const speeds = [];
  for (const foot of ['toes.l','toes.r']) {
    const ys = s.rows.map((r) => r[foot].y);
    const cut = [...ys].sort((a,b)=>a-b)[Math.floor(n*0.15)];
    const v = [];
    for (let i=0;i<n;i+=1) if (ys[i] <= cut) v.push((s.rows[i][foot].z - s.rows[(i-1+n)%n][foot].z) / dt);
    v.sort((a,b)=>a-b);
    speeds.push(v[Math.floor(v.length/2)]);
  }
  const authored = Math.abs((speeds[0]+speeds[1])/2);
  const stride = authored * s.duration;
  console.log(`${id.padEnd(11)} duration ${s.duration.toFixed(3)}s  authored ~${authored.toFixed(2)} m/s  stride ~${stride.toFixed(2)}m  cadence ${(2/s.duration).toFixed(2)} steps/s  (feet agree within ${Math.abs(Math.abs(speeds[0])-Math.abs(speeds[1])).toFixed(2)})`);
}
await browser.close();
