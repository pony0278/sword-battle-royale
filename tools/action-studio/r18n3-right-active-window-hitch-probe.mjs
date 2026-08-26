import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6.3 hitch probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V63_HITCH_DEBUG_PORT || 9464);
const pageUrl = process.env.R18N3_V63_HITCH_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const targetTtc = Number(process.env.R18N3_V63_HITCH_TTC || 0.110);
const hitchAtSeconds = Number(process.env.R18N3_V63_HITCH_AT || 0.235);
const hitchMs = Number(process.env.R18N3_V63_HITCH_MS || 55);
const trialCount = Number(process.env.R18N3_V63_HITCH_TRIALS || 4);
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v63-hitch-chrome-'));
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
  throw new Error('R18N.3 v6.3 hitch probe could not attach to lab');
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
  if (restarted !== true) throw new Error(`RIGHT restart failed for hitch trial ${index}`);
  await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.direction === 'right'");

  const setup = await evaluate(`new Promise((resolve, reject) => {
    const lab = window.__G43B5R281_LAB__;
    const targetTtc = ${JSON.stringify(targetTtc)};
    const hitchAt = ${JSON.stringify(hitchAtSeconds)};
    const hitchMs = ${JSON.stringify(hitchMs)};
    const deadline = performance.now() + 3000;
    let dispatched = null;
    let hitch = null;
    function tick() {
      const s = lab?.attackRuntime?.snapshot;
      const r = s?.action?.runtime;
      if (!s || !r || s.direction !== 'right') {
        if (performance.now() > deadline) return reject(new Error('RIGHT runtime missing'));
        return requestAnimationFrame(tick);
      }
      const elapsed = Number(s.elapsedSeconds);
      const ttc = Number(r.contactSeconds) - elapsed;
      if (!dispatched && elapsed >= Number(r.movementStartSeconds) && ttc > 0 && ttc <= targetTtc) {
        const result = lab.dispatchParryInput(${JSON.stringify(`r18n3-v63-hitch-${index}`)});
        if (result?.accepted !== true) return reject(new Error('F rejected'));
        dispatched = {
          actualTtc: ttc,
          inputElapsedSeconds: elapsed,
          activeStartSeconds: Number(r.activeStartSeconds),
          activeEndSeconds: Number(r.activeEndSeconds),
          contactSeconds: Number(r.contactSeconds),
        };
      }
      if (dispatched && !hitch && elapsed >= hitchAt && s.phase === 'attack_active') {
        const before = performance.now();
        while (performance.now() - before < hitchMs) {}
        hitch = {
          requestedMs: hitchMs,
          actualMs: performance.now() - before,
          beforeElapsedSeconds: elapsed,
          beforePhase: s.phase,
        };
        return resolve({ dispatched, hitch });
      }
      if (performance.now() > deadline) return reject(new Error('hitch scheduling deadline'));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })`);

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
    const sweepAlpha = confirmed ? Number(contact?.sweepAlpha) : Number(outside?.sweepAlpha);
    const geometricElapsed = Number.isFinite(frameEndElapsed) && Number.isFinite(deltaSeconds) && Number.isFinite(sweepAlpha)
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
      planeGapMeters: outside?.planeGapMeters ?? null,
      radialGapMeters: outside?.radialGapMeters ?? null,
      combinedGapMeters: outside?.combinedGapMeters ?? null,
      outsideProbeReason: outside?.probeReason ?? null,
      outsideTimeToContactSeconds: outside?.timeToContactSeconds ?? null,
    };
  })()`);

  const activeStart = Number(setup.dispatched.activeStartSeconds);
  const activeEnd = Number(setup.dispatched.activeEndSeconds);
  const contactSeconds = Number(setup.dispatched.contactSeconds);
  const geometricElapsed = Number(outcome.geometricElapsed);
  const frameEndElapsed = Number(outcome.frameEndElapsed);
  const geometricWindowPosition = classifyWindow(geometricElapsed, activeStart, activeEnd);
  const frameEndWindowPosition = classifyWindow(frameEndElapsed, activeStart, activeEnd);
  const eligibilityMismatch = outcome.whiff === true
    && outcome.whiffCategory === 'CONTACT_OUTSIDE_ACTIVE_WINDOW'
    && geometricWindowPosition === 'inside-active-window'
    && outcome.framePhase !== 'attack_active';

  return {
    trial: index,
    targetTtc,
    hitchAtSeconds,
    hitch: setup.hitch,
    actualTtc: setup.dispatched.actualTtc,
    inputElapsedSeconds: setup.dispatched.inputElapsedSeconds,
    activeStartSeconds: activeStart,
    activeEndSeconds: activeEnd,
    contactSeconds,
    ...outcome,
    geometricWindowPosition,
    frameEndWindowPosition,
    geometricFromActiveEndMs: Number.isFinite(geometricElapsed) ? (geometricElapsed - activeEnd) * 1000 : null,
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
  for (let i = 1; i <= trialCount; i += 1) {
    const trial = await runTrial(i);
    trials.push(trial);
    console.log(`R18N3_V63_HITCH_TRIAL=${JSON.stringify(trial)}`);
    await sleep(70);
  }
  const data = {
    stage: 'R18N.3-v6.3-right-active-window-hitch-reproduction',
    targetTtc,
    hitchAtSeconds,
    hitchMs,
    trials,
    outsideActiveWhiffs: trials.filter((r) => r.whiffCategory === 'CONTACT_OUTSIDE_ACTIVE_WINDOW').length,
    eligibilityMismatches: trials.filter((r) => r.eligibilityMismatch).length,
  };
  console.log(`R18N3_V63_HITCH_JSON=${JSON.stringify(data)}`);
} finally {
  await cleanup();
}
