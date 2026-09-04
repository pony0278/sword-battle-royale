// R21P.1 — CI driver for the defence matrix.
//
// Boots the lab with ?defenceMatrix=1 and reads the verdicts the in-page probe stamps. Where the
// parry composition gate asks "does a perfectly timed parry compose", this asks whether a press
// the game itself calls legal leaves the player defended at all - the property that turned out to
// be false for LEFT, and that no existing gate could see.
//
// Usage: node verify-defence-matrix.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: verify-defence-matrix.mjs <browser-executable> <base-url>');
  process.exit(2);
}

const pageName = process.env.PARRY_GATE_PAGE || 'shield-driven-contact-coupling-lab.html';
const MATRIX_URL = `${baseUrl.replace(/\/$/, '')}/${pageName}?defenceMatrix=1`;
const MATRIX_WAIT_MS = 240000;

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.goto(MATRIX_URL, { waitUntil: 'load', timeout: MATRIX_WAIT_MS });
  try {
    await page.waitForFunction(() => {
      const verdict = document.documentElement.dataset.defenceMatrix;
      return verdict === 'pass' || verdict === 'fail';
    }, null, { timeout: MATRIX_WAIT_MS });
  } catch (error) {
    const stuck = await page.evaluate(() => ({ ...document.documentElement.dataset })).catch(() => ({}));
    console.error(`Defence matrix timed out · dataset: ${JSON.stringify(stuck).slice(0, 600)}`);
    if (pageErrors.length > 0) console.error(`page errors: ${pageErrors.join(' | ')}`);
    process.exit(1);
  }

  const data = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  console.log(`Defence matrix · ${data.defenceMatrixDetail || 'no detail'}`);
  const failures = [];
  if (data.defenceMatrix !== 'pass') {
    failures.push(data.defenceMatrixFailures || `verdict: ${data.defenceMatrix}`);
  }
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);
  if (failures.length > 0) {
    console.error(`Defence matrix failed: ${failures.join(' · ')}`);
    process.exit(1);
  }
  console.log('Defence matrix reproduced the committed record');
} finally {
  await browser.close();
}
