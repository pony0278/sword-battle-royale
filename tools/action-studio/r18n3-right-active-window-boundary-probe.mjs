import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6.3 probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V63_DEBUG_PORT || 9463);
const pageUrl = process.env.R18N3_V63_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const targetTtc = Number(process.env.R18N3_V63_TTC || 0.110);
const maxTrials = Number(process.env.R18N3_V63_MAX_TRIALS || 20);
const minContacts = Number(process.env.R18N3_V63_MIN_CONTACTS || 4);
const minWhiffs = Number(process.env.R18N3_V63_MIN_WHIFFS || 2);
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v63-chrome-'));
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
  throw new Error('R18N.3 v6.3 could not attach to lab');
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

function classifyWindow(value, start, end) {
  if (!Number.isFinite(value)) return null;
  if (value < start) return 'before-active-start';
  if (value <= end) return 'inside-active-window';
  return 'after-active-end';
}

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
          const result = lab.dispatchParryInput(${JSON.stringify(`r18n3-v63-boundary-${index}`)});
          return resolve({
            accepted: result?.accepted === true,
            actualTtc: ttc,
            elapsed,
            activeStartSeconds: Number(r.activeStartSeconds),
            activeEndSeconds: Number(r.activeEndSeconds),
            contactSeconds: Number(r.contactSeconds),
          });
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
    const snapshot = lab.attackRuntime?.snapshot || null;
    const confirmed = lab.latestParryConfirmation?.accepted === true;
    const outside = whiff?.outsideActiveContact || null;
    const frameEndElapsed = confirmed
      ? Number(snapshot?.interruption?.sourceTimeSeconds ?? snapshot?.elapsedSeconds)
      : Number(outside?.elapsedSeconds);
    const deltaSeconds = confirmed
      ? Number(contact?.diagnostics?.deltaSeconds)
      : Number(outside?.probeDeltaSeconds);
    const sweepAlpha = confirmed
      ? Number(contact?.sweepAlpha)
      : Number(outside?.sweepAlpha);
    const geometricElapsed = Number.isFinite(frameEndElapsed)
      && Number.isFinite(deltaSeconds)
      && Number.isFinite(sweepAlpha)
      ? frameEndElapsed - deltaSeconds + sweepAlpha * deltaSeconds
      : null;
    return {
      confirmed,
      whiff: Boolean(whiff),
      whiffCategory: whiff?.category ?? null,
      whiffReason: whiff?.reason ?? null,
      framePhase: confirmed ? (snapshot?.phaseBeforeInterruption ?? snapshot?.phase ?? null) : (outside?.attackPhase ?? null),
      frameEndElapsed: Number.isFinite(frameEndElapsed) ? frameEndElapsed : null,
      deltaSeconds: Number.isFinite(deltaSeconds) ? deltaSeconds : null,
      sweepAlpha: Number.isFinite(sweepAlpha) ? sweepAlpha : null,
      geometricElapsed,
      outsideEligible: outside?.eligible ?? null,
      outsideProbeReason: outside?.probeReason ?? null,
      outsideTimeToContactSeconds: outside?.timeToContactSeconds ?? null,
      planeGapMeters: outside?.planeGapMeters ?? null,
      radialGapMeters: outside?.radialGapMeters ?? null,
      combinedGapMeters: outside?.combinedGapMeters ?? null,
    };
  })()`);

  const activeStart = Number(dispatch.activeStartSeconds);
  const activeEnd = Number(dispatch.activeEndSeconds);
  const contactSeconds = Number(dispatch.contactSeconds);
  const geometricElapsed = Number(outcome.geometricElapsed);
  const frameEndElapsed = Number(outcome.frameEndElapsed);
  const geometricWindowPosition = classifyWindow(geometricElapsed, activeStart, activeEnd);
  const frameEndWindowPosition = classifyWindow(frameEndElapsed, activeStart, activeEnd);
  const eligibilityMismatch = outcome.whiff === true
    && geometricWindowPosition === 'inside-active-window'
    && outcome.framePhase !== 'attack_active';

  return {
    trial: index,
    targetTtc,
    actualTtc: dispatch.actualTtc,
    inputElapsedSeconds: dispatch.elapsed,
    activeStartSeconds: activeStart,
    activeEndSeconds: activeEnd,
    contactSeconds,
    activeWindowMs: (activeEnd - activeStart) * 1000,
    ...outcome,
    geometricWindowPosition,
    frameEndWindowPosition,
    geometricFromActiveStartMs: Number.isFinite(geometricElapsed) ? (geometricElapsed - activeStart) * 1000 : null,
    geometricFromActiveEndMs: Number.isFinite(geometricElapsed) ? (geometricElapsed - activeEnd) * 1000 : null,
    geometricFromContactMs: Number.isFinite(geometricElapsed) ? (geometricElapsed - contactSeconds) * 1000 : null,
    frameEndFromActiveEndMs: Number.isFinite(frameEndElapsed) ? (frameEndElapsed - activeEnd) * 1000 : null,
    eligibilityMismatch,
  };
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
  let contacts = 0;
  let whiffs = 0;
  for (let i = 1; i <= maxTrials; i += 1) {
    const trial = await runTrial(i);
    trials.push(trial);
    if (trial.confirmed) contacts += 1;
    if (trial.whiff) whiffs += 1;
    console.log(`R18N3_V63_TRIAL=${JSON.stringify(trial)}`);
    if (contacts >= minContacts && whiffs >= minWhiffs) break;
    await sleep(70);
  }
  const mismatches = trials.filter((row) => row.eligibilityMismatch);
  const outside = trials.filter((row) => row.whiff && row.whiffCategory === 'CONTACT_OUTSIDE_ACTIVE_WINDOW');
  const data = {
    stage: 'R18N.3-v6.3-right-active-window-boundary',
    targetTtc,
    requested: { maxTrials, minContacts, minWhiffs },
    contacts,
    whiffs,
    outsideActiveWhiffs: outside.length,
    eligibilityMismatches: mismatches.length,
    trials,
  };
  console.log(`R18N3_V63_PROBE_JSON=${JSON.stringify(data)}`);
} finally {
  await cleanup();
}
