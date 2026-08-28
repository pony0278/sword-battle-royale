import { PARRY_GATE_DIRECTIONS, judgeParryGateRun } from '../../../src/combat/parry-gate-verdict.js';

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

async function driveOneParry({ api, windowRef, direction }) {
  await waitFor(windowRef, () => !api.attackRuntime.active && !api.combat.active, EXCHANGE_TIMEOUT_MS);
  const settleUntil = windowRef.performance.now() + QUIESCENT_SETTLE_MS;
  while (windowRef.performance.now() < settleUntil) await nextFrame(windowRef);
  api.resetLane?.();
  // Choosing the mode is also what raises the guard now (R19I.1), so the gate exercises the same
  // path a person takes rather than assuming a defender who is already holding one.
  api.setMode('parry');
  // Readiness is asked for rather than inferred: restartAttack refuses until the assets are in,
  // so retrying it IS the wait. R19I.1 removed the boot demo attack this used to watch for, and
  // an unconditional single attempt would simply have raced it.
  const started = await waitFor(windowRef, () => api.restartAttack(direction), EXCHANGE_TIMEOUT_MS);
  if (!started) return { direction, outcome: 'attack-not-started' };

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
  return { direction, triggered, outcome, carryDirection };
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
  (async () => {
    const startedAt = windowRef.performance.now();
    root.dataset.parryGateT0 = String(Math.round(startedAt));
    const exchanges = [];
    for (const direction of PARRY_GATE_DIRECTIONS) {
      if (windowRef.performance.now() - startedAt > GATE_TIMEOUT_MS) break;
      root.dataset.parryGateProgress = `driving-${direction}@${Math.round(windowRef.performance.now())}`;
      exchanges.push(await driveOneParry({ api, windowRef, direction }));
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
