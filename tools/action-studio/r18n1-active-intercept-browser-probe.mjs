import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.1 probe requires BROWSER');
const debugPort = Number(process.env.R18N1_DEBUG_PORT || 9441);
const pageUrl = process.env.R18N1_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const profileDir = mkdtempSync(join(tmpdir(), 'r18n1-chrome-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`, '--window-size=1440,1000', pageUrl,
], { stdio: ['ignore', 'ignore', 'inherit'] });

async function pageTarget() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.includes('shield-driven-contact-coupling-lab.html'));
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error('R18N.1 probe could not attach to standalone lab');
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let commandId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function cdp(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
  return result.result?.value;
}
async function waitFor(expression, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(20);
  }
  const state = await evaluate(`({
    href: location.href,
    readyState: document.readyState,
    status: document.querySelector('#status')?.textContent ?? null,
    dataset: document.documentElement.dataset.g43b5r281 ?? null,
    snapshot: window.__G43B5R281_LAB__?.attackRuntime?.snapshot ?? null,
  })`);
  throw new Error(`R18N.1 probe timeout waiting for ${expression}; state=${JSON.stringify(state)}`);
}

await cdp('Runtime.enable');
await waitFor("window.__G43B5R281_LAB__ && document.documentElement.dataset.g43b5r281 !== 'fail'");
await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.action && window.__G43B5R281_LAB__.attackRuntime.snapshot.direction === 'right'");

function compactFirst(first) {
  const intent = first?.drive?.activeInterceptIntent || null;
  return {
    drive: {
      drivePlanSource: first?.drive?.drivePlanSource ?? null,
      activeInterceptIntent: intent ? {
        leadMeters: intent.leadMeters ?? null,
        targetCenter: intent.targetCenter ?? null,
      } : null,
    },
    motion: { translationMeters: first?.motion?.translationMeters ?? null },
    presentation: {
      entryBlendProgress: first?.presentation?.entryBlendProgress ?? null,
      shieldArmOwnership: first?.presentation?.shieldArmOwnership ?? null,
    },
  };
}

function compactFinal(final) {
  return {
    confirmation: final?.confirmation ? { accepted: final.confirmation.accepted === true } : null,
    whiff: Boolean(final?.whiff),
  };
}

async function diagnoseDirection(direction) {
  const restarted = await evaluate(`window.__G43B5R281_LAB__.restartAttack(${JSON.stringify(direction)})`);
  if (restarted !== true) throw new Error(`R18N.1 could not restart ${direction} attack`);
  const timelineWindow = `(() => { const s = window.__G43B5R281_LAB__.attackRuntime.snapshot; const r = s?.action?.runtime; if (!r || s.direction !== ${JSON.stringify(direction)}) return false; const ttc = Number(r.contactSeconds) - Number(s.elapsedSeconds); return Number(s.elapsedSeconds) >= Number(r.movementStartSeconds) && ttc >= 0.08 && ttc <= 0.16; })()`;
  await waitFor(timelineWindow);
  const inputResult = await evaluate(`window.__G43B5R281_LAB__.dispatchParryInput('r18n1-browser-probe')`);
  await waitFor(`window.__G43B5R281_LAB__.latestInterceptDriveReport?.drivePlanSource === 'latched-f-active-intercept-intent'`);
  const first = await evaluate(`({
    drive: window.__G43B5R281_LAB__.latestInterceptDriveReport,
    motion: window.__G43B5R281_LAB__.latestShieldLeadMotion,
    presentation: window.__G43B5R281_LAB__.predictivePresentation?.report ?? null,
  })`);

  const samples = [];
  const started = Date.now();
  while (Date.now() - started < 900) {
    const sample = await evaluate(`({
      drive: window.__G43B5R281_LAB__.latestInterceptDriveReport,
      confirmation: window.__G43B5R281_LAB__.latestParryConfirmation,
      whiff: window.__G43B5R281_LAB__.latestParryWhiff,
    })`);
    if (sample.drive?.drivePlanSource === 'latched-f-active-intercept-intent') {
      const drive = sample.drive;
      const report = drive.activeInterceptIntent || null;
      samples.push({
        targetCenter: report?.targetCenter ?? null,
        remaining: report?.remainingDistanceMeters ?? drive.planRequiredDistanceMeters ?? null,
        achieved: drive.trackingAchievedDistanceMeters,
        correctionDirectionDot: drive.correctionDirectionDot ?? null,
        plannedCorrectionVector: drive.plannedCorrectionVector ?? null,
        shieldStepVector: drive.shieldStepVector ?? null,
        shieldStepTranslationMeters: drive.shieldStepTranslationMeters ?? null,
        residualEdgeReductionMeters: drive.residualEdgeReductionMeters ?? null,
        residualPlaneReductionMeters: drive.residualPlaneReductionMeters ?? null,
        bodyEdgeReductionMeters: drive.bodyEdgeReductionMeters ?? null,
        bodyPlaneReductionMeters: drive.bodyPlaneReductionMeters ?? null,
        stanceEdgeReductionMeters: drive.stanceEdgeReductionMeters ?? null,
        stancePlaneReductionMeters: drive.stancePlaneReductionMeters ?? null,
      });
    }
    if (sample.confirmation?.accepted === true || sample.whiff) break;
    await sleep(8);
  }
  await waitFor(`window.__G43B5R281_LAB__.latestParryConfirmation?.accepted === true || window.__G43B5R281_LAB__.latestParryWhiff`);
  const final = await evaluate(`({
    confirmation: window.__G43B5R281_LAB__.latestParryConfirmation,
    whiff: window.__G43B5R281_LAB__.latestParryWhiff,
  })`);
  return {
    direction,
    inputResult: { accepted: inputResult?.accepted === true },
    first: compactFirst(first),
    samples,
    final: compactFinal(final),
  };
}

function finiteValues(samples, key) {
  return samples.map((sample) => Number(sample[key])).filter(Number.isFinite);
}
function sum(values) { return values.reduce((total, value) => total + value, 0); }

function metricSummary(row) {
  const distance = (a, b) => Math.hypot(
    (a?.x ?? 0) - (b?.x ?? 0),
    (a?.y ?? 0) - (b?.y ?? 0),
    (a?.z ?? 0) - (b?.z ?? 0),
  );
  const targets = row.samples.map((sample) => sample.targetCenter).filter(Boolean);
  const remaining = finiteValues(row.samples, 'remaining');
  const achieved = finiteValues(row.samples, 'achieved');
  const dots = finiteValues(row.samples, 'correctionDirectionDot');
  const targetDrift = targets.length
    ? Math.max(...targets.map((target) => distance(target, targets[0])))
    : null;
  return {
    accepted: row.inputResult?.accepted === true,
    leadCm: Number.isFinite(row.first?.drive?.activeInterceptIntent?.leadMeters)
      ? row.first.drive.activeInterceptIntent.leadMeters * 100
      : null,
    firstJumpCm: Number.isFinite(row.first?.motion?.translationMeters)
      ? row.first.motion.translationMeters * 100
      : null,
    shieldArmOwnership: row.first?.presentation?.shieldArmOwnership ?? null,
    targetDriftCm: Number.isFinite(targetDrift) ? targetDrift * 100 : null,
    firstRemainingCm: remaining.length ? remaining[0] * 100 : null,
    minRemainingCm: remaining.length ? Math.min(...remaining) * 100 : null,
    maxRemainingCm: remaining.length ? Math.max(...remaining) * 100 : null,
    maxAchievedCm: achieved.length ? Math.max(...achieved) * 100 : null,
    minCorrectionDirectionDot: dots.length ? Math.min(...dots) : null,
    maxCorrectionDirectionDot: dots.length ? Math.max(...dots) : null,
    sumResidualEdgeReductionCm: sum(finiteValues(row.samples, 'residualEdgeReductionMeters')) * 100,
    sumResidualPlaneReductionCm: sum(finiteValues(row.samples, 'residualPlaneReductionMeters')) * 100,
    sumBodyEdgeReductionCm: sum(finiteValues(row.samples, 'bodyEdgeReductionMeters')) * 100,
    sumBodyPlaneReductionCm: sum(finiteValues(row.samples, 'bodyPlaneReductionMeters')) * 100,
    sumStanceEdgeReductionCm: sum(finiteValues(row.samples, 'stanceEdgeReductionMeters')) * 100,
    sumStancePlaneReductionCm: sum(finiteValues(row.samples, 'stancePlaneReductionMeters')) * 100,
    confirmation: row.final?.confirmation?.accepted === true,
    whiff: Boolean(row.final?.whiff),
    samples: remaining.length,
  };
}

async function stopChromeAndCleanup() {
  try { socket.close(); } catch {}
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => chrome.once('exit', resolve)),
      sleep(1200),
    ]);
  }
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => chrome.once('exit', resolve)),
      sleep(500),
    ]);
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === 5) {
        console.warn(`R18N1_CLEANUP_WARNING=${error?.code || error?.message || 'unknown'}`);
        return;
      }
      await sleep(100 * (attempt + 1));
    }
  }
}

try {
  const top = await diagnoseDirection('top');
  const right = await diagnoseDirection('right');
  console.log(`R18N1_METRICS_TOP=${JSON.stringify(metricSummary(top))}`);
  console.log(`R18N1_METRICS_RIGHT=${JSON.stringify(metricSummary(right))}`);
  console.log(`R18N1_PROBE_JSON=${JSON.stringify({ stage: 'R18N.1', top, right })}`);
} finally {
  await stopChromeAndCleanup();
}
