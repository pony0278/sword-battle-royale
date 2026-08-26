import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6.4 probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V64_DEBUG_PORT || 9465);
const pageUrl = process.env.R18N3_V64_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const targetTtc = Number(process.env.R18N3_V64_TTC || 0.110);
const hitchAtSeconds = Number(process.env.R18N3_V64_HITCH_AT || 0.235);
const hitchMs = Number(process.env.R18N3_V64_HITCH_MS || 55);
const trialCount = Number(process.env.R18N3_V64_TRIALS || 4);
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v64-chrome-'));
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
  throw new Error('R18N.3 v6.4 could not attach to lab');
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
const browserExceptions = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params?.exceptionDetails || {};
    browserExceptions.push({
      text: details.text || null,
      exception: details.exception?.description || details.exception?.value || null,
      lineNumber: details.lineNumber ?? null,
      columnNumber: details.columnNumber ?? null,
      url: details.url || null,
      timestamp: message.params?.timestamp ?? null,
    });
    if (browserExceptions.length > 12) browserExceptions.shift();
  }
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
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description;
    throw new Error(description || result.exceptionDetails.text || 'browser evaluation failed');
  }
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
async function captureFailureEvidence() {
  let page = null;
  try {
    page = await evaluate(`(() => {
      const lab = window.__G43B5R281_LAB__;
      const s = lab?.attackRuntime?.snapshot || null;
      return {
        dataset: document.documentElement.dataset.g43b5r281 || null,
        hasLab: Boolean(lab),
        readyState: document.readyState,
        attack: s ? {
          sequence: s.sequence ?? null,
          direction: s.direction ?? null,
          phase: s.phase ?? null,
          elapsedSeconds: s.elapsedSeconds ?? null,
          active: lab?.attackRuntime?.active ?? null,
          hasAction: Boolean(s.action),
          hasRuntime: Boolean(s.action?.runtime),
          interruption: s.interruption || null,
        } : null,
        latestContact: lab?.latestContact ? {
          contact: lab.latestContact.contact === true,
          geometricContact: lab.latestContact.geometricContact === true,
          reason: lab.latestContact.reason ?? null,
        } : null,
        latestParryConfirmation: lab?.latestParryConfirmation || null,
        latestParryWhiff: lab?.latestParryWhiff || null,
      };
    })()`);
  } catch (error) {
    page = { captureError: error instanceof Error ? error.message : String(error) };
  }
  return { page, browserExceptions: browserExceptions.slice(-8) };
}

await cdp('Runtime.enable');
await waitFor("window.__G43B5R281_LAB__ && document.documentElement.dataset.g43b5r281 !== 'fail'");
await waitFor('window.__G43B5R281_LAB__.attackRuntime.snapshot?.action');

async function runTrial(index) {
  const restarted = await evaluate("window.__G43B5R281_LAB__.restartAttack('right')");
  if (restarted !== true) throw new Error(`RIGHT restart failed for v6.4 trial ${index}`);
  await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.direction === 'right'");

  const setup = await evaluate(`new Promise((resolve, reject) => {
    const lab = window.__G43B5R281_LAB__;
    const targetTtc = ${JSON.stringify(targetTtc)};
    const hitchAt = ${JSON.stringify(hitchAtSeconds)};
    const hitchMs = ${JSON.stringify(hitchMs)};
    const hitchArmWindowMs = 50;
    const deadline = performance.now() + 3000;
    let dispatched = null;
    let hitchScheduled = false;
    let settled = false;
    let lastRuntimeState = null;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function scheduleHitch(s, elapsed) {
      const remainingMs = Math.max(0, (hitchAt - elapsed) * 1000);
      const scheduledAt = performance.now();
      const targetAt = scheduledAt + remainingMs;
      hitchScheduled = true;
      setTimeout(() => {
        if (settled) return;
        while (performance.now() < targetAt) {}
        const before = performance.now();
        const injectionSnapshot = lab?.attackRuntime?.snapshot;
        while (performance.now() - before < hitchMs) {}
        const after = performance.now();
        settled = true;
        resolve({
          dispatched,
          hitch: {
            requestedMs: hitchMs,
            actualMs: after - before,
            scheduledFromElapsedSeconds: elapsed,
            scheduledDelayMs: remainingMs,
            actualStartDelayMs: before - scheduledAt,
            beforeElapsedSeconds: Number(injectionSnapshot?.elapsedSeconds),
            phaseAtInjection: injectionSnapshot?.phase ?? null,
            directionAtInjection: injectionSnapshot?.direction ?? null,
          },
        });
      }, Math.max(0, remainingMs - 1));
    }

    function tick() {
      if (settled || hitchScheduled) return;
      const s = lab?.attackRuntime?.snapshot;
      const r = s?.action?.runtime;
      lastRuntimeState = s ? {
        sequence: s.sequence ?? null,
        direction: s.direction ?? null,
        phase: s.phase ?? null,
        elapsedSeconds: s.elapsedSeconds ?? null,
        hasAction: Boolean(s.action),
        hasRuntime: Boolean(r),
      } : null;
      if (!s || !r || s.direction !== 'right') {
        if (performance.now() > deadline) {
          return fail(new Error('RIGHT runtime missing: ' + JSON.stringify(lastRuntimeState)));
        }
        return requestAnimationFrame(tick);
      }
      const elapsed = Number(s.elapsedSeconds);
      const ttc = Number(r.contactSeconds) - elapsed;
      if (!dispatched && elapsed >= Number(r.movementStartSeconds) && ttc > 0 && ttc <= targetTtc) {
        const result = lab.dispatchParryInput(${JSON.stringify(`r18n3-v64-${index}`)});
        if (result?.accepted !== true) return fail(new Error('F rejected'));
        dispatched = { actualTtc: ttc, inputElapsedSeconds: elapsed };
      }
      if (dispatched && s.phase === 'attack_active') {
        const remainingMs = (hitchAt - elapsed) * 1000;
        if (remainingMs < 0) {
          return fail(new Error('hitch bracket missed: ' + JSON.stringify({ hitchAt, elapsed, remainingMs, lastRuntimeState })));
        }
        if (remainingMs <= hitchArmWindowMs) {
          scheduleHitch(s, elapsed);
          return;
        }
      }
      if (performance.now() > deadline) return fail(new Error('hitch scheduling deadline: ' + JSON.stringify(lastRuntimeState)));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })`);

  await waitFor('window.__G43B5R281_LAB__.latestParryConfirmation?.accepted === true || window.__G43B5R281_LAB__.latestParryWhiff', 5000);
  const outcome = await evaluate(`(() => {
    const lab = window.__G43B5R281_LAB__;
    const contact = lab.latestContact || null;
    const temporal = contact?.temporalEligibility || null;
    const relative = contact?.diagnostics?.relativeMovingShieldTranslation || null;
    const relativeClosest = relative?.closestApproach || null;
    const confirmation = lab.latestParryConfirmation || null;
    const combatResult = lab.latestCombatResult || null;
    const interruption = lab.attackRuntime?.snapshot?.interruption || null;
    return {
      confirmed: confirmation?.accepted === true,
      confirmationReason: confirmation?.reason ?? null,
      whiff: Boolean(lab.latestParryWhiff),
      contact: contact?.contact === true,
      geometricContact: contact?.geometricContact === true,
      contactReason: contact?.reason ?? null,
      sweepAlpha: contact?.sweepAlpha ?? null,
      relativeMovingShieldContact: relative?.contact === true,
      relativeMovingShieldGeometricContact: relative?.geometricContact === true,
      relativeMovingShieldReason: relative?.reason ?? null,
      relativeMovingShieldSweepAlpha: relative?.sweepAlpha ?? null,
      relativeMovingShieldClosestGapMeters: relativeClosest?.combinedGapMeters ?? null,
      relativeMovingShieldPlaneGapMeters: relativeClosest?.planeGapMeters ?? null,
      relativeMovingShieldRadialGapMeters: relativeClosest?.radialGapMeters ?? null,
      shieldTranslationMeters: relative?.shieldTranslationMeters ?? null,
      shieldAngularRadians: relative?.shieldAngularRadians ?? null,
      relativeMovingShieldAuthority: relative?.authority ?? null,
      temporalAuthority: temporal?.authority ?? null,
      temporalEligible: temporal?.eligible ?? null,
      contactElapsedSeconds: temporal?.contactElapsedSeconds ?? null,
      activeStartSeconds: temporal?.activeStartSeconds ?? null,
      activeEndSeconds: temporal?.activeEndSeconds ?? null,
      frameEndElapsedSeconds: temporal?.frameEndElapsedSeconds ?? null,
      frameEndPhase: temporal?.frameEndPhase ?? null,
      frameEndPhaseActive: temporal?.frameEndPhaseActive ?? null,
      combatAccepted: combatResult?.accepted === true,
      interruptionSourceTimeSeconds: interruption?.sourceTimeSeconds ?? null,
      interruptionPhaseAtInterrupt: interruption?.phaseAtInterrupt ?? null,
      interruptionFrameEndElapsedMs: interruption?.frameEndElapsedMs ?? null,
      interruptionTemporalAuthority: interruption?.contactTemporalAuthority ?? null,
    };
  })()`);

  return { trial: index, targetTtc, hitchAtSeconds, hitch: setup.hitch, ...setup.dispatched, ...outcome };
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
    try {
      const trial = await runTrial(i);
      trials.push(trial);
      console.log(`R18N3_V64_TRIAL=${JSON.stringify(trial)}`);
    } catch (error) {
      const failure = await captureFailureEvidence();
      console.error(`R18N3_V64_TRIAL_FAILURE=${JSON.stringify({
        trial: i,
        error: error instanceof Error ? error.message : String(error),
        ...failure,
      })}`);
      throw error;
    }
    await sleep(70);
  }
  console.log(`R18N3_V64_PROBE_JSON=${JSON.stringify({
    stage: 'R18N.3-v6.4.2-relative-moving-shield-observer',
    targetTtc,
    hitchAtSeconds,
    hitchMs,
    trials,
    confirmed: trials.filter((row) => row.confirmed).length,
    whiffs: trials.filter((row) => row.whiff).length,
    relativeRecovered: trials.filter((row) => row.geometricContact !== true && row.relativeMovingShieldGeometricContact === true).length,
    browserExceptions,
  })}`);
} finally {
  await cleanup();
}
