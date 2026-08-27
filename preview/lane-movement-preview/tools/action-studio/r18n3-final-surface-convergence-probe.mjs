import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = process.env.BROWSER;
if (!browser) throw new Error('R18N.3 v6 probe requires BROWSER');
const debugPort = Number(process.env.R18N3_V6_DEBUG_PORT || 9456);
const pageUrl = process.env.R18N3_V6_PAGE_URL || 'http://127.0.0.1:4175/tools/action-studio/shield-driven-contact-coupling-lab.html';
const profileDir = mkdtempSync(join(tmpdir(), 'r18n3-v6-chrome-'));
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
  throw new Error('R18N.3 v6 probe could not attach to standalone lab');
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
  throw new Error(`R18N.3 v6 timeout waiting for ${expression}`);
}
function distance(a, b) {
  return Math.hypot(
    (Number(a?.x) || 0) - (Number(b?.x) || 0),
    (Number(a?.y) || 0) - (Number(b?.y) || 0),
    (Number(a?.z) || 0) - (Number(b?.z) || 0),
  );
}
function finite(values) { return values.map(Number).filter(Number.isFinite); }

await cdp('Runtime.enable');
await waitFor("window.__G43B5R281_LAB__ && document.documentElement.dataset.g43b5r281 !== 'fail'");
await waitFor("window.__G43B5R281_LAB__.attackRuntime.snapshot?.action");

async function diagnoseDirection(direction) {
  const restarted = await evaluate(`window.__G43B5R281_LAB__.restartAttack(${JSON.stringify(direction)})`);
  if (restarted !== true) throw new Error(`R18N.3 v6 could not restart ${direction} attack`);
  const timelineWindow = `(() => { const s = window.__G43B5R281_LAB__.attackRuntime.snapshot; const r = s?.action?.runtime; if (!r || s.direction !== ${JSON.stringify(direction)}) return false; const ttc = Number(r.contactSeconds) - Number(s.elapsedSeconds); return Number(s.elapsedSeconds) >= Number(r.movementStartSeconds) && ttc >= 0.08 && ttc <= 0.16; })()`;
  await waitFor(timelineWindow);
  const inputResult = await evaluate(`window.__G43B5R281_LAB__.dispatchParryInput('r18n3-v6-final-surface-probe')`);
  await waitFor(`window.__G43B5R281_LAB__.latestInterceptDriveReport?.activeInterceptPoseAuthority === 'post-guard-post-predictive-absolute-world-offset-last-writer'`);

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
    const drive = sample.drive;
    if (drive?.activeInterceptPoseAuthority === 'post-guard-post-predictive-absolute-world-offset-last-writer') {
      const intent = drive.activeInterceptIntent || null;
      const closure = drive.activeInterceptArmClosure || null;
      samples.push({
        targetCenter: intent?.targetCenter ?? null,
        intentRemaining: intent?.remainingDistanceMeters ?? null,
        finalSurfaceRemaining: closure?.targetErrorAfterMeters ?? null,
        closureBefore: closure?.targetErrorBeforeMeters ?? null,
        closureReduction: closure?.targetErrorReductionMeters ?? null,
        closureBudgetScale: closure?.jointBudgetScale ?? null,
        closureIterations: closure?.iterations ?? null,
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

  const targets = samples.map((sample) => sample.targetCenter).filter(Boolean);
  const intentRemaining = finite(samples.map((sample) => sample.intentRemaining));
  const finalSurfaceRemaining = finite(samples.map((sample) => sample.finalSurfaceRemaining));
  const achieved = finite(samples.map((sample) => sample.achieved));
  const directionDots = finite(samples.map((sample) => sample.correctionDirectionDot));
  const firstIntentRemaining = intentRemaining[0] ?? null;
  const minFinalSurfaceRemaining = finalSurfaceRemaining.length ? Math.min(...finalSurfaceRemaining) : null;
  const finalSurfaceConvergence = Number.isFinite(firstIntentRemaining) && Number.isFinite(minFinalSurfaceRemaining)
    ? firstIntentRemaining - minFinalSurfaceRemaining
    : null;
  const maxTargetDrift = targets.length ? Math.max(...targets.map((value) => distance(value, targets[0]))) : null;

  return {
    direction,
    inputAccepted: inputResult?.accepted === true,
    first: {
      drivePlanSource: first?.drive?.drivePlanSource ?? null,
      leadMeters: first?.drive?.activeInterceptIntent?.leadMeters ?? null,
      firstJumpMeters: first?.motion?.translationMeters ?? null,
      entryBlendProgress: first?.presentation?.entryBlendProgress ?? null,
    },
    samples,
    metrics: {
      targetDriftMeters: maxTargetDrift,
      firstIntentRemainingMeters: firstIntentRemaining,
      minFinalSurfaceRemainingMeters: minFinalSurfaceRemaining,
      finalSurfaceConvergenceMeters: finalSurfaceConvergence,
      maxAchievedMeters: achieved.length ? Math.max(...achieved) : null,
      minCorrectionDirectionDot: directionDots.length ? Math.min(...directionDots) : null,
      closureBudgetScale: finite(samples.map((sample) => sample.closureBudgetScale))[0] ?? null,
      closureIterations: finite(samples.map((sample) => sample.closureIterations))[0] ?? null,
    },
    confirmation: final?.confirmation?.accepted === true,
    whiff: Boolean(final?.whiff),
  };
}

async function stopChromeAndCleanup() {
  try { socket.close(); } catch {}
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(1200)]);
  }
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
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
  const data = { stage: 'R18N.3-v6-final-surface-convergence', top, right };
  console.log(`R18N3_V6_PROBE_JSON=${JSON.stringify(data)}`);
} finally {
  await stopChromeAndCleanup();
}
