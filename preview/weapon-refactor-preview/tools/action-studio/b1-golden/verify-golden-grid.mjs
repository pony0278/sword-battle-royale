// Replays the committed golden grid against the current lab and diffs. Stage B1's browser-side
// acceptance: every golden cell must reproduce its outcome, posture, relevance verdict, start
// separation (exact) and settled separation (5cm tolerance - transfers are deterministic but
// settle timing samples a moving value), with the defender back square at the end.
//
// Usage: node verify-golden-grid.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { runExchange } from './capture-golden-grid.mjs';
import { compareGoldenCell, describeCell, describeTightestMargin, tightestMargin } from './golden-grid-diff.mjs';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: verify-golden-grid.mjs <browser-executable> <base-url>');
  process.exit(2);
}
const golden = JSON.parse(readFileSync(new URL('./golden-grid.json', import.meta.url), 'utf8'));

// R21W.1: the judgement - which fields must match, at what tolerance, and what a failure prints -
// lives in golden-grid-diff.mjs, where a test can hold it without launching a browser. This file
// stays what it was: the driver.
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
const allMargins = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const cell of golden.cells) {
    const name = `${cell.dir}@${cell.stance}`;
    let r = null;
    let thrown = null;
    // A cell that times out or loses the page is this cell's failure, not the run's. Before this
    // it threw out of the loop, so the remaining cells went unmeasured and the log ended on a
    // stack trace - the one shape of red that leaves nothing to read.
    try { r = await runExchange(page, cell); } catch (error) { thrown = error; }
    if (thrown) {
      console.error(`${name}: FAIL threw · ${thrown.message.split('\n')[0]}`);
      failures.push(`${name}: threw · ${thrown.message}\n    golden: ${describeCell(cell)}`);
      continue;
    }
    const { bad, margins } = compareGoldenCell(cell, r);
    allMargins.push(...margins.map((margin) => ({ ...margin, name })));
    console.error(`${name}: ${bad.length ? `FAIL ${bad.join(' | ')}` : 'ok'}`);
    if (bad.length) {
      failures.push([
        `${name}: ${bad.join(' | ')}`,
        `    golden:   ${describeCell(cell)}`,
        `    measured: ${describeCell(r)}`,
      ].join('\n'));
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  // Printed to stdout so verify-combat.mjs captures it and can repeat it beside the FAIL line.
  console.log(`GOLDEN GRID FAILED\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`golden grid reproduced: ${golden.cells.length} cells`);
// Printed on a GREEN run too: a cell clearing by a hair today is the one that goes red tomorrow.
const margin = describeTightestMargin(tightestMargin(allMargins));
if (margin) console.log(margin);
