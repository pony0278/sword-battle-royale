import {
  DEFENCE_MATRIX_DIRECTIONS,
  PROBED_PRESS_TTC_MS,
  judgeDefenceMatrix,
} from '../../../src/combat/defence-matrix-verdict.js';

// R21P.1 — the defence matrix's driver: presses at a NAMED moment instead of at the prompt.
//
// The parry composition gate waits for latestParryOpportunity.accepted and then presses, so it only
// ever asks "does a perfectly timed parry compose". This asks the other half: press where the game
// says you may, and see whether you are defended at all. Same page, same lane, same real input
// path - the difference is only when the shield goes up.
//
// It drives BLOCK mode deliberately. setGuardHeld returns early unless the mode is 'block', so the
// guard's rising edge - which is both the shield and the parry attempt (R20H.1) - only exists
// there, and it is the path every tally in this project was recorded through.
const EXCHANGE_TIMEOUT_MS = 20000;
const QUIESCENT_SETTLE_MS = 1500;
const MATRIX_TIMEOUT_MS = 180000;

function nextFrame(windowRef) {
  return new Promise((resolve) => windowRef.requestAnimationFrame(() => resolve()));
}

async function waitFor(windowRef, predicate, timeoutMs) {
  const startedAt = windowRef.performance.now();
  while (windowRef.performance.now() - startedAt < timeoutMs) {
    if (predicate()) return true;
    await nextFrame(windowRef);
  }
  return predicate();
}

// The same pointer the parry gate aims with: a real event at the canvas, so the sector is chosen
// the way a player chooses it rather than through a back door.
function aimAt(documentRef, windowRef, direction) {
  const canvas = documentRef.getElementById('canvas');
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  const reach = Math.min(rect.width, rect.height) * 0.4;
  const offset = { top: { x: 0, y: -reach }, right: { x: reach, y: 0 }, left: { x: -reach, y: 0 } }[direction];
  if (!offset) return false;
  const PointerEventCtor = windowRef.PointerEvent || windowRef.MouseEvent;
  canvas.dispatchEvent(new PointerEventCtor('pointermove', {
    clientX: rect.left + rect.width / 2 + offset.x,
    clientY: rect.top + rect.height / 2 + offset.y,
    bubbles: true,
  }));
  return true;
}

async function driveOnePress({ api, windowRef, documentRef, direction, pressTtcMs }) {
  api.setGuardHeld(false);
  await waitFor(windowRef, () => !api.attackRuntime.active && !api.combat.active, EXCHANGE_TIMEOUT_MS);
  const settleUntil = windowRef.performance.now() + QUIESCENT_SETTLE_MS;
  while (windowRef.performance.now() < settleUntil) await nextFrame(windowRef);
  // Without this the fighters drift over a run of exchanges and the geometry being measured is not
  // the calibrated one. Five ad-hoc probes got the wrong answer for want of this line.
  api.resetLane?.();
  api.setMode('block');
  const aimed = aimAt(documentRef, windowRef, direction);
  const started = await waitFor(windowRef, () => api.restartAttack(direction), EXCHANGE_TIMEOUT_MS);
  if (!started) return { direction, pressTtcMs, outcome: null, reason: 'attack-not-started' };
  if (!aimed) return { direction, pressTtcMs, outcome: null, reason: 'probe-could-not-aim' };

  const contactSeconds = api.attackRuntime.snapshot?.action?.runtime?.contactSeconds ?? null;
  if (contactSeconds == null) return { direction, pressTtcMs, outcome: null, reason: 'no-attack-timeline' };
  let pressed = false;
  let outcome = null;
  const startedAt = windowRef.performance.now();
  while (windowRef.performance.now() - startedAt < EXCHANGE_TIMEOUT_MS) {
    await nextFrame(windowRef);
    const elapsed = api.attackRuntime.snapshot?.elapsedSeconds ?? 0;
    if (!pressed && (contactSeconds - elapsed) * 1000 <= pressTtcMs) {
      // The press: one action that raises the shield AND arms the attempt. Held from here, because
      // releasing would test the release rather than the timing.
      api.setGuardHeld(true);
      pressed = true;
    }
    const resolved = api.latestCombatResult?.resolution?.outcome;
    if (resolved && !outcome) outcome = resolved;
    if (outcome) break;
    if (pressed && !api.attackRuntime.active && !api.combat.active) break;
  }
  api.setGuardHeld(false);
  return { direction, pressTtcMs, outcome, reason: outcome ? null : 'no-resolution' };
}

function stamp(documentRef, run, observations) {
  const root = documentRef.documentElement;
  root.dataset.defenceMatrix = run.pass ? 'pass' : 'fail';
  root.dataset.defenceMatrixDetail = observations
    .map((row) => `${row.direction}@${row.pressTtcMs}:${row.outcome || row.reason || 'none'}`)
    .join(' ');
  if (!run.pass) {
    root.dataset.defenceMatrixFailures = run.failures
      .map((row) => `${row.direction}@${row.pressTtcMs} expected ${row.expected} got ${row.actual}`)
      .join(' | ');
  }
}

export function maybeStartDefenceMatrixProbe({ api, windowRef, documentRef }) {
  const params = new URLSearchParams(windowRef.location.search);
  if (params.get('defenceMatrix') !== '1') return false;
  const root = documentRef.documentElement;
  root.dataset.defenceMatrix = 'running';
  // The review aid rescales the pre-contact phase, which is exactly the thing being timed here.
  const slowReview = documentRef.getElementById('slowReview');
  if (slowReview) slowReview.checked = false;
  (async () => {
    const observations = [];
    const observed = {};
    const startedAt = windowRef.performance.now();
    for (const direction of DEFENCE_MATRIX_DIRECTIONS) {
      for (const pressTtcMs of PROBED_PRESS_TTC_MS) {
        if (windowRef.performance.now() - startedAt > MATRIX_TIMEOUT_MS) break;
        const row = await driveOnePress({ api, windowRef, documentRef, direction, pressTtcMs });
        observations.push(row);
        (observed[direction] ||= {})[pressTtcMs] = row.outcome;
      }
    }
    stamp(documentRef, judgeDefenceMatrix(observed), observations);
  })().catch((error) => {
    root.dataset.defenceMatrix = 'fail';
    root.dataset.defenceMatrixFailures = `probe threw: ${String(error?.message || error).slice(0, 200)}`;
  });
  return true;
}
