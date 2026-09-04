import {
  DEFENCE_MATRIX_DIRECTIONS,
  PROBED_PRESS_TTC_MS,
  judgeDefenceMatrix,
} from '../../../src/combat/defence-matrix-verdict.js';
import { defendedSectorFor } from '../../../src/combat/attack-direction-as-defended.js'; // R21Q.1

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
  // R21Q.1: point where the swing ARRIVES, not at the name of the clip. The offsets below are
  // screen pixels and the clip names are the attacker's frame, so aiming by the raw name pointed
  // this probe at the wrong half of the screen on every lateral attack - which is the same mistake
  // the gate itself was making, and the reason both had to be fixed together.
  const offset = { top: { x: 0, y: -reach }, right: { x: reach, y: 0 }, left: { x: -reach, y: 0 } }[defendedSectorFor(direction)];
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
  let pressedAtTtcMs = null;
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
      // The TTC the press ACTUALLY landed at, not the one it aimed for. Pinned, these should be
      // identical run to run; if they ever drift again, this is the number that says so.
      pressedAtTtcMs = (contactSeconds - elapsed) * 1000;
    }
    const resolved = api.latestCombatResult?.resolution?.outcome;
    if (resolved && !outcome) outcome = resolved;
    if (outcome) break;
    if (pressed && !api.attackRuntime.active && !api.combat.active) break;
  }
  api.setGuardHeld(false);
  // R21Z.1: what the press actually did, so a red cell is diagnosable. 'no-resolution' alone
  // cannot distinguish "the shield was late" from "the attack never reached anybody".
  return {
    direction,
    pressTtcMs,
    outcome,
    reason: outcome ? null : 'no-resolution',
    pressedAtTtcMs: pressedAtTtcMs == null ? null : Number(pressedAtTtcMs.toFixed(1)),
    contactSeconds: Number(contactSeconds.toFixed(4)),
  };
}

function stamp(documentRef, run, observations) {
  const root = documentRef.documentElement;
  root.dataset.defenceMatrix = run.pass ? 'pass' : 'fail';
  root.dataset.defenceMatrixDetail = observations
    .map((row) => `${row.direction}@${row.pressTtcMs}:${row.outcome || row.reason || 'none'}`
      + (row.pressedAtTtcMs == null ? '' : `(@${row.pressedAtTtcMs}ms)`))
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
  // R21Z.1: pin the step, for the reason R20K.1 already wrote down for the golden grid - and which
  // this probe was built without. On the wall clock a frame is however long the browser felt like,
  // so `contactSeconds - elapsed` crosses the press threshold at a different point in the swing on
  // every run, and a cell decided by a few milliseconds lands on either side of it.
  //
  // The evidence that this is not theoretical: across three consecutive runs of the CURRENT record,
  // top@180 came back 'parry', then 'block', then 'parry'. The gate normalises both to 'defended'
  // so it stayed green - but the same press was resolving by two different mechanisms, which means
  // the timing was moving. left@180 is the tightest cell in the matrix (R21O.3: LEFT arrives late)
  // and it is the one that went red, with no resolution at all.
  //
  // Pinned, every wait below is still wall-clock - rAF still fires in real time - but the SIM
  // advances by exactly 1/60 per frame, so the press lands on a deterministic frame of the swing.
  if (typeof api.setFixedStepMs !== 'function') {
    root.dataset.defenceMatrix = 'fail';
    root.dataset.defenceMatrixFailures = 'R21Z.1: lab has no pinned frame step; the matrix would be unreproducible';
    return true;
  }
  api.setFixedStepMs(1000 / 60);
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
