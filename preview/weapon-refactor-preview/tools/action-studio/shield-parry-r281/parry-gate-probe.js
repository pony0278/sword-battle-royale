import { PARRY_GATE_DIRECTIONS, judgeParryGateRun } from '../../../src/combat/parry-gate-verdict.js';
import { defendedSectorFor } from '../../../src/combat/attack-direction-as-defended.js'; // R21Q.1

// R19G.1 — the composition gate's driver: plays three parries the way a hand does.
//
// Activated only by ?parryGate=1 (CI's Pages workflow), it drives the lab through the same debug
// facade the hand-driven probes used - start an attack, press parry at the prompt, read what the
// exchange produced - then stamps verdicts onto document.documentElement.dataset for the shell
// gate to grep out of a DOM dump. The judgement itself lives in src/combat/parry-gate-verdict.js;
// this module only drives and reports. It exists because the R19F.1 regression sailed through 801
// green unit tests: the composed exchange is the thing that breaks silently, so the composed
// exchange is the thing CI must replay.
const EXCHANGE_TIMEOUT_MS = 20000;
// Long enough for the PREVIOUS exchange's recovery animation to finish, not just its combat
// flags to clear. Measured: at 350ms, RIGHT driven straight after TOP occasionally released
// downward (carry y -0.61..-0.94) while RIGHT in isolation repeated (-0.81, 0.28, 0.51) ten out
// of ten - the leak was the defender starting the next exchange from a half-recovered guard.
const QUIESCENT_SETTLE_MS = 1500;
const GATE_TIMEOUT_MS = 60000;

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

// R21C.1: the gate parries by direction now, so the probe has to point before it presses - and it
// points the way a player does, by dispatching a real pointer event at the canvas, rather than
// through a back door that would leave the input path unverified. The offset is 40% of the smaller
// dimension, comfortably past the dead zone, along the sector's own screen axis.
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

async function driveOneParry({ api, windowRef, documentRef, direction }) {
  await waitFor(windowRef, () => !api.attackRuntime.active && !api.combat.active, EXCHANGE_TIMEOUT_MS);
  const settleUntil = windowRef.performance.now() + QUIESCENT_SETTLE_MS;
  while (windowRef.performance.now() < settleUntil) await nextFrame(windowRef);
  api.resetLane?.();
  // Choosing the mode is also what raises the guard now (R19I.1), so the gate exercises the same
  // path a person takes rather than assuming a defender who is already holding one.
  api.setMode('parry');
  // Aim before the attack starts: the sector is held between frames, so pointing once is enough.
  const aimed = aimAt(documentRef, windowRef, direction);
  // Readiness is asked for rather than inferred: restartAttack refuses until the assets are in,
  // so retrying it IS the wait. R19I.1 removed the boot demo attack this used to watch for, and
  // an unconditional single attempt would simply have raced it.
  const started = await waitFor(windowRef, () => api.restartAttack(direction), EXCHANGE_TIMEOUT_MS);
  if (!started) return { direction, outcome: 'attack-not-started' };
  if (!aimed) return { direction, outcome: 'probe-could-not-aim' };

  let triggered = false;
  let outcome = null;
  let carryDirection = null;
  const startedAt = windowRef.performance.now();
  while (windowRef.performance.now() - startedAt < EXCHANGE_TIMEOUT_MS) {
    await nextFrame(windowRef);
    if (!triggered && api.latestParryOpportunity?.accepted) {
      api.triggerParryNow();
      triggered = true;
    }
    const resolved = api.latestCombatResult?.resolution?.outcome;
    if (resolved && !outcome) outcome = resolved;
    const fling = api.latestArmFling;
    if (fling?.carryDirection && !carryDirection) {
      carryDirection = { x: fling.carryDirection.x, y: fling.carryDirection.y, z: fling.carryDirection.z };
    }
    if (outcome && carryDirection) break;
    if (!api.attackRuntime.active && !api.combat.active && triggered && outcome) break;
  }
  return { direction, triggered, outcome, carryDirection, aimedSector: api.guardSector?.sector ?? null };
}

function stamp(documentRef, run, exchanges) {
  const root = documentRef.documentElement;
  root.dataset.parryGate = run.pass ? 'pass' : 'fail';
  for (const verdict of run.verdicts) {
    root.dataset[`parryGate${verdict.direction[0].toUpperCase()}${verdict.direction.slice(1)}`] = verdict.pass ? 'pass' : 'fail';
    if (!verdict.pass) {
      root.dataset[`parryGate${verdict.direction[0].toUpperCase()}${verdict.direction.slice(1)}Reasons`] = verdict.reasons.join('|');
    }
  }
  root.dataset.parryGateDetail = exchanges
    .map((exchange) => {
      const carry = exchange.carryDirection;
      const carryText = carry ? `${carry.x.toFixed(2)},${carry.y.toFixed(2)},${carry.z.toFixed(2)}` : 'none';
      return `${exchange.direction}:${exchange.outcome || 'none'}@${carryText}`;
    })
    .join(' ');
}

// Fire-and-forget from the entry: inert unless the query names the gate, and every failure path
// still stamps a verdict so CI reads "fail", never silence.
export function maybeStartParryGateProbe({ api, windowRef, documentRef }) {
  const params = new URLSearchParams(windowRef.location.search);
  if (params.get('parryGate') !== '1') return false;
  const root = documentRef.documentElement;
  root.dataset.parryGate = 'running';
  // Deliberately leaves the lab's slow-review default alone: the gate holds the exchange under
  // the same conditions every calibration was measured in and the hand approval was given in.
  // Measured while building this gate: at a forced 1.00x review rate the R19F envelope turns
  // marginal (TOP connects ~50%, RIGHT's release occasionally degenerates) - a real finding, but
  // full-speed parry timing is a gameplay design decision, not something a CI gate should decide
  // by silently testing a condition nobody plays in yet.
  // R23B.1: pin the step, the third and last of these probes to get it. R20K.1 wrote down why for
  // the golden grid and R21Z.1 repeated it for the defence matrix; this one was noted as unpinned
  // at the time and left, because it presses at the game's OWN prompt rather than at a named TTC
  // and so is far less sensitive. Less is not none: its reported contact points wander run to run
  // (top 0.93 to 0.94, left 0.10 to 0.17 across three consecutive runs of identical code), and it
  // failed once here with top resolving to nothing at all - then passed twice on the same commit.
  //
  // A gate that answers the same question two ways is not a gate, and this one is about to become
  // load-bearing for a mirror duel. Pinned, every wait below is still wall-clock - rAF fires in
  // real time - but the SIM advances exactly 1/60 per frame, so the swing is sampled at the same
  // phase every run.
  if (typeof api.setFixedStepMs !== 'function') {
    root.dataset.parryGate = 'fail';
    root.dataset.parryGateFailures = 'R23B.1: lab has no pinned frame step; the gate would be unreproducible';
    return true;
  }
  api.setFixedStepMs(1000 / 60);
  (async () => {
    const startedAt = windowRef.performance.now();
    root.dataset.parryGateT0 = String(Math.round(startedAt));
    const exchanges = [];
    for (const direction of PARRY_GATE_DIRECTIONS) {
      if (windowRef.performance.now() - startedAt > GATE_TIMEOUT_MS) break;
      root.dataset.parryGateProgress = `driving-${direction}@${Math.round(windowRef.performance.now())}`;
      exchanges.push(await driveOneParry({ api, windowRef, documentRef, direction }));
      root.dataset.parryGateProgress = `done-${direction}@${Math.round(windowRef.performance.now())}·${exchanges[exchanges.length-1].outcome||'none'}`;
    }
    root.dataset.parryGateProgress = `judged@${Math.round(windowRef.performance.now())}`;
    stamp(documentRef, judgeParryGateRun(exchanges), exchanges);
  })().catch((error) => {
    root.dataset.parryGate = 'fail';
    root.dataset.parryGateError = String(error?.message || error);
  });
  return true;
}
