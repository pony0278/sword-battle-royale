import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6.2 probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V62_DEBUG_PORT || 9462);
const pageUrl = process.env.R18N3_V62_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const targetTtc = Number(process.env.R18N3_V62_TTC || 0.110);
const trialCount = Number(process.env.R18N3_V62_TRIALS || 8);
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v62-chrome-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`, '--window-size=1440,1000', pageUrl,
], { stdio: ['ignore', 'ignore', 'inherit'] });

async function pageTarget() {
  for (let i = 0; i < 180; i += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
      const page = targets.find((item) => item.type === 'page' && item.url.includes('shield-driven-contact-coupling-lab.html'));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error('R18N.3 v6.2 could not attach to lab');
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});
function cdp(method, params = {}) {
  const commandId = ++id;
  socket.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve, reject) => pending.set(commandId, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
  return result.result?.value;
}
async function waitFor(expression, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(8);
  }
  throw new Error(`timeout waiting for ${expression}`);
}

await cdp('Runtime.enable');
await waitFor("window.__G43B5R281_LAB__ && document.documentElement.dataset.g43b5r281 !== 'fail'");
await waitFor('window.__G43B5R281_LAB__.attackRuntime.snapshot?.action');

async function runTrial(index) {
  const restarted = await evaluate("window.__G43B5R281_LAB__.restartAttack('right')");
  if (restarted !== true) throw new Error(`RIGHT restart failed for trial ${index}`);
  await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.direction === 'right'");
  const dispatch = await evaluate(`new Promise((resolve, reject) => {
    const targetTtc = ${JSON.stringify(targetTtc)};
    const deadline = performance.now() + 3000;
    function tick() {
      const lab = window.__G43B5R281_LAB__;
      const s = lab?.attackRuntime?.snapshot;
      const r = s?.action?.runtime;
      if (r && s?.direction === 'right') {
        const elapsed = Number(s.elapsedSeconds);
        const ttc = Number(r.contactSeconds) - elapsed;
        if (elapsed >= Number(r.movementStartSeconds) && ttc > 0 && ttc <= targetTtc) {
          const result = lab.dispatchParryInput(${JSON.stringify(`r18n3-v62-margin-${index}`)});
          return resolve({ accepted: result?.accepted === true, actualTtc: ttc, elapsed });
        }
        if (ttc <= 0) return reject(new Error('missed TTC crossing'));
      }
      if (performance.now() > deadline) return reject(new Error('TTC wait deadline'));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })`);
  if (!dispatch?.accepted) throw new Error(`RIGHT F rejected for trial ${index}`);
  await waitFor('window.__G43B5R281_LAB__.latestParryConfirmation?.accepted === true || window.__G43B5R281_LAB__.latestParryWhiff', 5000);
  const outcome = await evaluate(`(() => {
    const lab = window.__G43B5R281_LAB__;
    const contact = lab.latestContact || null;
    const whiff = lab.latestParryWhiff || null;
    const confirmed = lab.latestParryConfirmation?.accepted === true;
    const closest = whiff?.closestApproachRecord || contact?.diagnostics?.closestApproach || null;
    const radius = Number(contact?.surface?.radius ?? closest?.surface?.radius ?? 0) || null;
    const radialDistance = Number(contact?.radialDistance ?? closest?.radialDistanceMeters);
    return {
      confirmed,
      whiff: Boolean(whiff),
      contactReason: contact?.reason ?? null,
      contactMode: contact?.mode ?? null,
      sweepAlpha: contact?.sweepAlpha ?? null,
      bladeFraction: contact?.bladeFraction ?? null,
      radius,
      radialDistance: Number.isFinite(radialDistance) ? radialDistance : null,
      edgeMarginMeters: confirmed && Number.isFinite(radialDistance) && Number.isFinite(radius)
        ? radius - radialDistance : null,
      whiffCategory: whiff?.category ?? null,
      whiffReason: whiff?.reason ?? null,
      planeGapMeters: closest?.planeGapMeters ?? null,
      radialGapMeters: closest?.radialGapMeters ?? null,
      combinedGapMeters: closest?.combinedGapMeters ?? null,
      closestSignedDistance: closest?.signedDistance ?? null,
      predictedVsClosestErrorMeters: whiff?.prediction?.predictedVsClosestErrorMeters ?? null,
    };
  })()`);
  return { trial: index, targetTtc, actualTtc: dispatch.actualTtc, ...outcome };
}

async function cleanup() {
  try { socket.close(); } catch {}
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await sleep(250);
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

try {
  const trials = [];
  for (let i = 1; i <= trialCount; i += 1) {
    const trial = await runTrial(i);
    trials.push(trial);
    console.log(`R18N3_V62_TRIAL=${JSON.stringify(trial)}`);
    await sleep(70);
  }
  const contacts = trials.filter((row) => row.confirmed);
  const whiffs = trials.filter((row) => row.whiff);
  const data = { stage: 'R18N.3-v6.2-right-swept-contact-margin', targetTtc, trials, contacts: contacts.length, whiffs: whiffs.length };
  console.log(`R18N3_V62_PROBE_JSON=${JSON.stringify(data)}`);
} finally {
  await cleanup();
}
