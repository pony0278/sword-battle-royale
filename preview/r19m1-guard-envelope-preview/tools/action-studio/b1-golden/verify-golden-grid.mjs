// Replays the committed golden grid against the current lab and diffs. Stage B1's browser-side
// acceptance: every golden cell must reproduce its outcome, posture, relevance verdict, start
// separation (exact) and settled separation (5cm tolerance - transfers are deterministic but
// settle timing samples a moving value), with the defender back square at the end.
//
// Usage: node verify-golden-grid.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { runExchange } from './capture-golden-grid.mjs';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: verify-golden-grid.mjs <browser-executable> <base-url>');
  process.exit(2);
}
const golden = JSON.parse(readFileSync(new URL('./golden-grid.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const cell of golden.cells) {
    const r = await runExchange(page, cell);
    const bad = [];
    if (r.blocked !== cell.blocked) bad.push(`blocked ${r.blocked}!=${cell.blocked}`);
    if (r.clang !== cell.clang) bad.push(`clang ${r.clang}!=${cell.clang}`);
    if (r.body !== cell.body) bad.push(`body ${r.body}!=${cell.body}`);
    if (r.posture !== cell.posture) bad.push(`posture ${r.posture}!=${cell.posture}`);
    if (r.relevance !== cell.relevance) bad.push(`relevance ${r.relevance}!=${cell.relevance}`);
    if (Math.abs((r.startSep ?? 0) - (cell.startSep ?? 0)) > 1e-6) bad.push(`startSep ${r.startSep}!=${cell.startSep}`);
    if (cell.settledSep != null && Math.abs((r.settledSep ?? 0) - cell.settledSep) > 0.05) bad.push(`settledSep ${r.settledSep}!~${cell.settledSep}`);
    if (Math.abs(r.settledYawDeg) > 0.5) bad.push(`settled yaw ${r.settledYawDeg} != 0`);
    const tag = bad.length ? `FAIL ${bad.join(' | ')}` : 'ok';
    console.error(`${cell.dir}@${cell.stance}: ${tag}`);
    if (bad.length) failures.push(`${cell.dir}@${cell.stance}: ${bad.join(' | ')}`);
  }
} finally {
  await browser.close();
}
if (failures.length) { console.log(`GOLDEN GRID FAILED\n${failures.join('\n')}`); process.exit(1); }
console.log(`golden grid reproduced: ${golden.cells.length} cells`);
