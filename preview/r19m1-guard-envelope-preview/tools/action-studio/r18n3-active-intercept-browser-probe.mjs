import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 probe requires BROWSER');
const debugPort = Number(process.env.R18N3_DEBUG_PORT || 9443);
const pageUrl = process.env.R18N3_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-chrome-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`, '--window-size=1440,1000', pageUrl,
], { stdio: ['ignore', 'ignore', 'inherit'] });

async function pageTarget() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.includes('shield-driven-contact-coupling-lab.html'));
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error('R18N.3 probe could not attach to standalone lab');
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
  throw new Error(`R18N.3 probe timeout waiting for ${expression}; state=${JSON.stringify(state)}`);
}

await cdp('Runtime.enable');
await waitFor("window.__G43B5R281_LAB__ && document.documentElement.dataset.g43b5r281 !== 'fail'");
await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.action");

async function diagnoseDirection(direction) {
  const restarted = await evaluate(`window.__G43B5R281_LAB__.restartAttack(${JSON.stringify(direction)})`);
  if (restarted !== true) throw new Error(`R18N.3 could not restart ${direction} attack`);
  const timelineWindow = `(() => { const s = window.__G43B5R281_LAB__.attackRuntime.snapshot; const r = s?.action?.runtime; if (!r || s.direction !== ${JSON.stringify(direction)}) return false; const ttc = Number(r.contactSeconds) - Number(s.elapsedSeconds); return Number(s.elapsedSeconds) >= Number(r.movementStartSeconds) && ttc >= 0.08 && ttc <= 0.16; })()`;
  await waitFor(timelineWindow);
  const inputResult = await evaluate(`window.__G43B5R281_LAB__.dispatchParryInput('r18n3-browser-probe')`);
  await waitFor(`window.__G43B5R281_LAB__.latestInterceptDriveReport?.activeInterceptPoseAuthority === 'post-guard-post-predictive-absolute-world-offset-last-writer'`);

  const samples = [];
  const started = Date.now();
  while (Date.now() - started < 900) {
    const sample = await evaluate(`({
      drive: window.__G43B5R281_LAB__.latestInterceptDriveReport,
      confirmation: window.__G43B5R281_LAB__.latestParryConfirmation,
      whiff: window.__G43B5R281_LAB__.latestParryWhiff,
    })`);
    const drive = sample.drive;
    if (drive?.activeInterceptPoseAuthority === 'post-guard-post-predictive-absolute-world-offset-last-writer') {
      const intent = drive.activeInterceptIntent || null;
      const support = drive.residualBodyReach || null;
      samples.push({
        targetCenter: intent?.targetCenter ?? null,
        remaining: intent?.remainingDistanceMeters ?? drive.planRequiredDistanceMeters ?? null,
        targetErrorBefore: drive.activeInterceptTargetErrorBeforeMeters ?? null,
        targetErrorAfter: drive.activeInterceptTargetErrorAfterMeters ?? null,
        primaryCarry: drive.activeInterceptPrimaryCarryMeters ?? null,
        residualCarry: drive.activeInterceptResidualCarryMeters ?? null,
        supportAuthority: drive.activeInterceptSupportAuthority ?? null,
        supportActive: support?.active === true,
        supportOffset: support?.supportOffsetDistance ?? null,
        supportTargetErrorBefore: support?.targetErrorBeforeMeters ?? null,
        supportTargetErrorAfter: support?.targetErrorAfterMeters ?? null,
        supportChestDegrees: support?.appliedDegrees?.chest ?? null,
        supportSpineDegrees: support?.appliedDegrees?.spine ?? null,
        achieved: drive.trackingAchievedDistanceMeters ?? null,
        correctionDirectionDot: drive.correctionDirectionDot ?? null,
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
    inputAccepted: inputResult?.accepted === true,
    samples,
    confirmation: final?.confirmation?.accepted === true,
    whiff: Boolean(final?.whiff),
  };
}

function finite(values) { return values.map(Number).filter(Number.isFinite); }
function avg(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function distance(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}

function summarize(row) {
  const before = finite(row.samples.map((sample) => sample.targetErrorBefore));
  const after = finite(row.samples.map((sample) => sample.targetErrorAfter));
  const carry = finite(row.samples.map((sample) => sample.primaryCarry));
  const residual = finite(row.samples.map((sample) => sample.residualCarry));
  const support = finite(row.samples.map((sample) => sample.supportOffset));
  const supportAfter = finite(row.samples.map((sample) => sample.supportTargetErrorAfter));
  const supportChest = finite(row.samples.map((sample) => sample.supportChestDegrees));
  const supportSpine = finite(row.samples.map((sample) => sample.supportSpineDegrees));
  const remaining = finite(row.samples.map((sample) => sample.remaining));
  const achieved = finite(row.samples.map((sample) => sample.achieved));
  const improvements = row.samples
    .map((sample) => Number(sample.targetErrorBefore) - Number(sample.targetErrorAfter))
    .filter(Number.isFinite);
  const targets = row.samples.map((sample) => sample.targetCenter).filter(Boolean);
  const targetDriftMeters = targets.length
    ? Math.max(...targets.map((value) => distance(value, targets[0])))
    : null;
  return {
    inputAccepted: row.inputAccepted,
    confirmation: row.confirmation,
    whiff: row.whiff,
    frames: row.samples.length,
    firstTargetErrorBeforeCm: before.length ? before[0] * 100 : null,
    minTargetErrorAfterCm: after.length ? Math.min(...after) * 100 : null,
    lastTargetErrorAfterCm: after.length ? after[after.length - 1] * 100 : null,
    bestPerFrameImprovementCm: improvements.length ? Math.max(...improvements) * 100 : null,
    meanPerFrameImprovementCm: avg(improvements) == null ? null : avg(improvements) * 100,
    maxPrimaryCarryCm: carry.length ? Math.max(...carry) * 100 : null,
    maxResidualCarryCm: residual.length ? Math.max(...residual) * 100 : null,
    maxSupportCarryCm: support.length ? Math.max(...support) * 100 : null,
    minSupportTargetErrorAfterCm: supportAfter.length ? Math.min(...supportAfter) * 100 : null,
    maxSupportChestDegrees: supportChest.length ? Math.max(...supportChest) : null,
    maxSupportSpineDegrees: supportSpine.length ? Math.max(...supportSpine) : null,
    supportActiveFrames: row.samples.filter((sample) => sample.supportActive).length,
    supportAuthority: row.samples.find((sample) => sample.supportAuthority)?.supportAuthority ?? null,
    firstRemainingCm: remaining.length ? remaining[0] * 100 : null,
    minRemainingCm: remaining.length ? Math.min(...remaining) * 100 : null,
    maxAchievedCm: achieved.length ? Math.max(...achieved) * 100 : null,
    targetDriftCm: targetDriftMeters == null ? null : targetDriftMeters * 100,
  };
}

async function stopChromeAndCleanup() {
  try { socket.close(); } catch {}
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(1200)]);
  }
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(500)]);
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === 5) return;
      await sleep(100 * (attempt + 1));
    }
  }
}

try {
  const top = await diagnoseDirection('top');
  const right = await diagnoseDirection('right');
  const summary = { top: summarize(top), right: summarize(right) };
  console.log(`R18N3_METRICS=${JSON.stringify(summary)}`);
  console.log(`R18N3_PROBE_JSON=${JSON.stringify({ stage: 'R18N.3', top, right, summary })}`);
} finally {
  await stopChromeAndCleanup();
}
