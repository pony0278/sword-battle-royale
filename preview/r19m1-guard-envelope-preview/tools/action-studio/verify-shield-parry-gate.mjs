// R19G.1 — CI driver for the shield lab's parry composition gate.
//
// Boots the lab with ?parryGate=1, lets the in-page probe play one parry per direction at the
// calibrated stance, and reads the verdicts the probe stamped onto document.documentElement
// (judged by src/combat/parry-gate-verdict.js). Driven through playwright-core against the
// runner's own Chrome in real time, because the lab is a continuously-simulating
// requestAnimationFrame page: Chrome's --virtual-time-budget --dump-dom stops pumping frames
// shortly after load (measured: the last frame fired at 509ms of virtual time), so the dump-dom
// pattern the static Guard Runtime gate uses cannot replay an exchange.
//
// Usage: node verify-shield-parry-gate.mjs <browser-executable> <base-url>
import { chromium } from 'playwright-core';

const [executablePath, baseUrl] = process.argv.slice(2);
if (!executablePath || !baseUrl) {
  console.error('usage: verify-shield-parry-gate.mjs <browser-executable> <base-url>');
  process.exit(2);
}

// PARRY_GATE_PAGE names the page to drive. It exists because the published page loads Three.js from
// a CDN, which a sandbox with no egress cannot reach - and which CI should not depend on either, so
// build/verify-combat.mjs generates a local-module copy of the same page and points this at it. The
// default stays the published page for anyone driving this by hand against a live network.
const pageName = process.env.PARRY_GATE_PAGE || 'shield-driven-contact-coupling-lab.html';
const GATE_URL = `${baseUrl.replace(/\/$/, '')}/${pageName}?parryGate=1`;
const GATE_WAIT_MS = 120000;

// Only --no-sandbox (CI runs as root); the GPU flags the dump-dom gate needs break WebGL
// context creation under playwright's headless mode, and the lab refuses to boot without WebGL.
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.goto(GATE_URL, { waitUntil: 'load', timeout: GATE_WAIT_MS });
  try {
    await page.waitForFunction(() => {
      const verdict = document.documentElement.dataset.parryGate;
      return verdict === 'pass' || verdict === 'fail';
    }, null, { timeout: GATE_WAIT_MS });
  } catch (error) {
    const stuck = await page.evaluate(() => ({ ...document.documentElement.dataset })).catch(() => ({}));
    console.error(`Shield parry composition gate timed out · dataset: ${JSON.stringify(stuck)}`);
    if (pageErrors.length > 0) console.error(`page errors: ${pageErrors.join(' | ')}`);
    process.exit(1);
  }

  const data = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  const failures = [];
  if (data.parryGate !== 'pass') failures.push(`gate verdict: ${data.parryGate}`);
  for (const direction of ['Top', 'Right', 'Left']) {
    if (data[`parryGate${direction}`] !== 'pass') {
      failures.push(`${direction.toLowerCase()}: ${data[`parryGate${direction}`] || 'missing'}`
        + (data[`parryGate${direction}Reasons`] ? ` (${data[`parryGate${direction}Reasons`]})` : ''));
    }
  }
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);

  if (failures.length > 0) {
    console.error(`Shield parry composition gate failed: ${failures.join(' · ')}`);
    console.error(`detail: ${data.parryGateDetail || 'none'} · progress: ${data.parryGateProgress || 'none'}`);
    process.exit(1);
  }
  console.log(`Shield parry composition gate passed · ${data.parryGateDetail || 'no-detail'}`);
} finally {
  await browser.close();
}
