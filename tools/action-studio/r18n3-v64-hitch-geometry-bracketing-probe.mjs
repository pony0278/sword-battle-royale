import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6.4.2 geometry probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V641_DEBUG_PORT || 9466);
const pageUrl = process.env.R18N3_V641_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const targetTtc = Number(process.env.R18N3_V641_TTC || 0.110);
const requestedHitchAtSeconds = Number(process.env.R18N3_V641_HITCH_AT || 0.235);
// Observer sampling happens after the gameplay frame. Arm the diagnostic hitch early enough
// that the following ~50ms gameplay frame brackets the ~258.6ms real RIGHT contact instead
// of racing a 235ms threshold that may only be observed after contact has already resolved.
const hitchAtSeconds = Math.min(requestedHitchAtSeconds, 0.225);
const hitchMs = Number(process.env.R18N3_V641_HITCH_MS || 55);
const trialsPerVariant = Number(process.env.R18N3_V641_TRIALS || 4);
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v642-chrome-'));
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
  throw new Error('R18N.3 v6.4.2 could not attach to lab');
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

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactFrame(frame) {
  const closest = frame.closest || null;
  const motion = frame.shieldLead || null;
  const drive = frame.drive || null;
  return {
    elapsedSeconds: finiteOrNull(frame.elapsedSeconds),
    phase: frame.phase || null,
    contact: frame.contact === true,
    geometricContact: frame.geometricContact === true,
    contactReason: frame.contactReason || null,
    contactDeltaSeconds: finiteOrNull(frame.contactDeltaSeconds),
    maxEndpointTravel: finiteOrNull(frame.maxEndpointTravel),
    planeGapMeters: finiteOrNull(closest?.planeGapMeters),
    radialGapMeters: finiteOrNull(closest?.radialGapMeters),
    combinedGapMeters: finiteOrNull(closest?.combinedGapMeters),
    closestSweepAlpha: finiteOrNull(closest?.sweepAlpha),
    closestBladeFraction: finiteOrNull(closest?.bladeFraction),
    closestSignedDistance: finiteOrNull(closest?.signedDistance),
    surfaceCenter: frame.surfaceCenter || null,
    shieldLeadDeltaSeconds: finiteOrNull(motion?.deltaSeconds),
    shieldLeadTranslationMeters: finiteOrNull(motion?.translationMeters),
    shieldLeadTranslation: motion?.translation || null,
    shieldLeadSpeedMps: finiteOrNull(motion?.translationSpeedMps),
    shieldStepTranslationMeters: finiteOrNull(drive?.shieldStepTranslationMeters),
    plannedCorrectionMeters: finiteOrNull(drive?.plannedCorrectionMeters),
    correctionDirectionDot: finiteOrNull(drive?.correctionDirectionDot),
    drivePlanSource: drive?.drivePlanSource || null,
  };
}

async function runTrial(variant, index) {
  const applyHitch = variant === 'hitch';
  const restarted = await evaluate("window.__G43B5R281_LAB__.restartAttack('right')");
  if (restarted !== true) throw new Error(`RIGHT restart failed for ${variant} trial ${index}`);
  await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.direction === 'right'");

  const result = await evaluate(`new Promise((resolve, reject) => {
    const lab = window.__G43B5R281_LAB__;
    const targetTtc = ${JSON.stringify(targetTtc)};
    const hitchAt = ${JSON.stringify(hitchAtSeconds)};
    const hitchMs = ${JSON.stringify(hitchMs)};
    const applyHitch = ${JSON.stringify(applyHitch)};
    const deadline = performance.now() + 5000;
    const frames = [];
    let dispatched = null;
    let hitch = null;
    let lastElapsed = null;

    function snapshotFrame() {
      const s = lab?.attackRuntime?.snapshot;
      const r = s?.action?.runtime;
      const contact = lab?.latestContact || null;
      const closest = contact?.diagnostics?.closestApproach || null;
      const motion = lab?.latestShieldLeadMotion || null;
      const drive = lab?.latestInterceptDriveReport || null;
      return {
        elapsedSeconds: Number(s?.elapsedSeconds),
        phase: s?.phase || null,
        movementStartSeconds: Number(r?.movementStartSeconds),
        contactSeconds: Number(r?.contactSeconds),
        activeStartSeconds: Number(r?.activeStartSeconds),
        activeEndSeconds: Number(r?.activeEndSeconds),
        contact: contact?.contact === true,
        geometricContact: contact?.geometricContact === true,
        contactReason: contact?.reason ?? null,
        contactDeltaSeconds: contact?.diagnostics?.deltaSeconds ?? null,
        maxEndpointTravel: contact?.diagnostics?.maxEndpointTravel ?? null,
        closest,
        surfaceCenter: contact?.surface?.center || null,
        surfaceNormal: contact?.surface?.normal || null,
        shieldLead: motion ? {
          deltaSeconds: motion.deltaSeconds ?? null,
          translationMeters: motion.translationMeters ?? null,
          translation: motion.translation || null,
          translationSpeedMps: motion.translationSpeedMps ?? null,
        } : null,
        drive: drive ? {
          shieldStepTranslationMeters: drive.shieldStepTranslationMeters ?? null,
          plannedCorrectionMeters: drive.plannedCorrectionMeters ?? null,
          correctionDirectionDot: drive.correctionDirectionDot ?? null,
          drivePlanSource: drive.drivePlanSource ?? null,
        } : null,
      };
    }

    function finish() {
      const confirmation = lab.latestParryConfirmation || null;
      const whiff = lab.latestParryWhiff || null;
      const contact = lab.latestContact || null;
      resolve({
        variant: ${JSON.stringify(variant)},
        index: ${JSON.stringify(index)},
        dispatched,
        hitch,
        confirmed: confirmation?.accepted === true,
        whiff: Boolean(whiff),
        whiffCategory: whiff?.category ?? null,
        whiffReason: whiff?.reason ?? null,
        finalContactReason: contact?.reason ?? null,
        finalGeometricContact: contact?.geometricContact === true,
        finalContact: contact?.contact === true,
        frames,
      });
    }

    function step() {
      if (performance.now() > deadline) return reject(new Error('${variant} diagnostic deadline'));
      const frame = snapshotFrame();
      const elapsed = frame.elapsedSeconds;
      if (Number.isFinite(elapsed) && elapsed !== lastElapsed) {
        if (elapsed >= 0.175 && elapsed <= 0.335) frames.push(frame);
        lastElapsed = elapsed;
      }
      if (!dispatched && Number.isFinite(elapsed) && Number.isFinite(frame.contactSeconds)
        && elapsed >= frame.movementStartSeconds) {
        const ttc = frame.contactSeconds - elapsed;
        if (ttc > 0 && ttc <= targetTtc) {
          const armed = lab.dispatchParryInput(${JSON.stringify(`r18n3-v642-${variant}-${index}`)});
          if (armed?.accepted !== true) return reject(new Error('F rejected'));
          dispatched = { actualTtc: ttc, inputElapsedSeconds: elapsed };
        }
      }
      if (applyHitch && dispatched && !hitch && elapsed >= hitchAt && frame.phase === 'attack_active') {
        const before = performance.now();
        while (performance.now() - before < hitchMs) {}
        hitch = {
          requestedMs: hitchMs,
          actualMs: performance.now() - before,
          beforeElapsedSeconds: elapsed,
          beforePhase: frame.phase,
        };
      }
      if (lab.latestParryConfirmation?.accepted === true || lab.latestParryWhiff) return finish();
      if (Number.isFinite(elapsed) && elapsed > 0.325) return finish();
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  })`);

  const frames = (result.frames || []).map(compactFrame);
  const candidates = frames.filter((row) => Number.isFinite(row.combinedGapMeters));
  const closestFrame = candidates.reduce((best, row) => (
    !best || row.combinedGapMeters < best.combinedGapMeters ? row : best
  ), null);
  const maxShieldTranslation = frames.reduce((max, row) => Math.max(max, row.shieldLeadTranslationMeters || 0), 0);
  const maxSwordEndpointTravel = frames.reduce((max, row) => Math.max(max, row.maxEndpointTravel || 0), 0);
  return {
    variant,
    trial: index,
    targetTtc,
    requestedHitchAtSeconds,
    hitchAtSeconds,
    hitchMs: applyHitch ? hitchMs : 0,
    ...result.dispatched,
    hitch: result.hitch,
    confirmed: result.confirmed,
    whiff: result.whiff,
    whiffCategory: result.whiffCategory,
    whiffReason: result.whiffReason,
    finalContactReason: result.finalContactReason,
    finalGeometricContact: result.finalGeometricContact,
    finalContact: result.finalContact,
    closestFrame,
    maxShieldTranslationMeters: maxShieldTranslation,
    maxSwordEndpointTravelMeters: maxSwordEndpointTravel,
    frames,
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
  const controls = [];
  const hitches = [];
  for (let i = 1; i <= trialsPerVariant; i += 1) {
    const control = await runTrial('control', i);
    controls.push(control);
    console.log(`R18N3_V641_CONTROL=${JSON.stringify(control)}`);
    await sleep(70);
  }
  for (let i = 1; i <= trialsPerVariant; i += 1) {
    const hitch = await runTrial('hitch', i);
    hitches.push(hitch);
    console.log(`R18N3_V641_HITCH=${JSON.stringify(hitch)}`);
    await sleep(70);
  }
  const data = {
    stage: 'R18N.3-v6.4.2-deterministic-hitch-geometry-bracketing',
    targetTtc,
    requestedHitchAtSeconds,
    hitchAtSeconds,
    hitchMs,
    controls,
    hitches,
    controlConfirmed: controls.filter((row) => row.confirmed).length,
    hitchConfirmed: hitches.filter((row) => row.confirmed).length,
    hitchGeometric: hitches.filter((row) => row.finalGeometricContact).length,
  };
  console.log(`R18N3_V641_PROBE_JSON=${JSON.stringify(data)}`);
} finally {
  await cleanup();
}
