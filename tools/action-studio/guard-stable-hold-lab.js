import { createDefaultCharacter } from '../../src/character/default-character.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import {
  PRODUCTION_PARRY_DEFLECT_VARIANTS,
  getProductionParryDeflectProfile,
} from '../../src/animation/parry-contact-deflect-runtime-clip.js';
import {
  GUARD_EVENTS,
  GUARD_STATES,
  createGuardStateMachine,
} from '../../src/combat/guard-state-machine.js';
import {
  PRODUCTION_GUARD_HOLD_STAGE,
  STABLE_GUARD_HOLD_STAGE,
  canonicalGuardSourceTime,
  createGuardPresentationRuntime,
} from '../../src/combat/guard-presentation-runtime.js';
import { LONGSWORD_GUARD_AUTHORING_STATE } from '../../src/combat/longsword-guard-metadata.js';

const THREE = window.THREE;
if (!THREE?.GLTFLoader || !THREE?.Quaternion) throw new Error(`${PRODUCTION_GUARD_HOLD_STAGE} requires Three.js + GLTFLoader`);

const character = createDefaultCharacter(THREE);
const machine = createGuardStateMachine();
const runtime = createGuardPresentationRuntime(THREE, { machine, character });
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const STEP_MS = 1000 / 60;
const HOLD_DURATION_MS = 40000;
const WATCH_BONES = Object.freeze(['root', 'hips', 'chest', 'upperarm.r', 'wrist.r', 'handslot.r']);
const ACTIVE_BONES = Object.freeze(['chest', 'upperarm.r', 'wrist.r', 'handslot.r']);

function quaternionAngleDegrees(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.dot(b))));
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function snapshotBoneQuaternion(id) {
  const bone = character.rig?.bones?.[id];
  if (!bone?.getWorldQuaternion) throw new Error(`Missing Living Guard probe bone: ${id}`);
  character.object3d.updateMatrixWorld(true);
  return bone.getWorldQuaternion(new THREE.Quaternion());
}

function resetToHold() {
  machine.send(GUARD_EVENTS.RESET, { verification: 'g365-reset' });
  runtime.sync();
  machine.send(GUARD_EVENTS.GUARD_PRESS, { verification: 'g365-guard-press' });
  runtime.sync();
  const result = runtime.update(180);
  if (result.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error(`${PRODUCTION_GUARD_HOLD_STAGE} failed to enter HOLD: ${result.snapshot.state}`);
  }
  return result;
}

function measureLivingHold(canonicalSeconds) {
  const initial = Object.fromEntries(WATCH_BONES.map((id) => [id, snapshotBoneQuaternion(id)]));
  const previous = Object.fromEntries(WATCH_BONES.map((id) => [id, initial[id].clone()]));
  const metrics = Object.fromEntries(WATCH_BONES.map((id) => [id, {
    maxStepDegrees: 0,
    maxExcursionDegrees: 0,
    seamStepDegrees: 0,
  }]));
  let elapsedMs = 0;
  let previousSourceTime = canonicalSeconds;
  let sourceAdvanced = false;
  let wraps = 0;
  let stageStable = true;

  while (elapsedMs < HOLD_DURATION_MS) {
    const nextMs = Math.min(HOLD_DURATION_MS, elapsedMs + STEP_MS);
    const result = runtime.update(nextMs - elapsedMs);
    elapsedMs = nextMs;
    if (result.snapshot.state !== GUARD_STATES.HOLD) {
      throw new Error(`${PRODUCTION_GUARD_HOLD_STAGE} left HOLD early at ${elapsedMs.toFixed(2)}ms`);
    }
    const sourceTime = result.report.sourceTimeSeconds;
    const wrappedNow = sourceTime + 0.25 < previousSourceTime;
    if (wrappedNow) wraps += 1;
    sourceAdvanced = sourceAdvanced || Math.abs(sourceTime - canonicalSeconds) > 0.25;
    stageStable = stageStable
      && result.report.stableGuardStage === STABLE_GUARD_HOLD_STAGE
      && result.report.livingGuardStage === PRODUCTION_GUARD_HOLD_STAGE
      && result.report.livingGuardSourceRate === 1
      && result.report.canonicalGuardSample === LONGSWORD_GUARD_AUTHORING_STATE.baseSample;

    for (const id of WATCH_BONES) {
      const current = snapshotBoneQuaternion(id);
      const step = quaternionAngleDegrees(previous[id], current);
      const excursion = quaternionAngleDegrees(initial[id], current);
      metrics[id].maxStepDegrees = Math.max(metrics[id].maxStepDegrees, step);
      metrics[id].maxExcursionDegrees = Math.max(metrics[id].maxExcursionDegrees, excursion);
      if (wrappedNow) metrics[id].seamStepDegrees = Math.max(metrics[id].seamStepDegrees, step);
      previous[id].copy(current);
    }
    previousSourceTime = sourceTime;
  }

  for (const metric of Object.values(metrics)) {
    metric.maxStepDegrees = Number(metric.maxStepDegrees.toFixed(6));
    metric.maxExcursionDegrees = Number(metric.maxExcursionDegrees.toFixed(6));
    metric.seamStepDegrees = Number(metric.seamStepDegrees.toFixed(6));
  }

  const rootLocked = metrics.root.maxStepDegrees <= 0.1 && metrics.root.maxExcursionDegrees <= 0.1;
  const livingMotionVisible = metrics.chest.maxExcursionDegrees >= 1
    && metrics['upperarm.r'].maxExcursionDegrees >= 1;
  const frameContinuous = ACTIVE_BONES.every((id) => metrics[id].maxStepDegrees <= 8);
  const seamContinuous = wraps >= 1 && ACTIVE_BONES.every((id) => metrics[id].seamStepDegrees <= 3);
  return {
    durationMs: HOLD_DURATION_MS,
    sourceAdvanced,
    wraps,
    stageStable,
    rootLocked,
    livingMotionVisible,
    frameContinuous,
    seamContinuous,
    metrics,
    pass: sourceAdvanced && wraps >= 1 && stageStable && rootLocked
      && livingMotionVisible && frameContinuous && seamContinuous,
  };
}

function verifyRecoverTarget(canonicalSeconds) {
  const sent = machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { verification: 'g365-parry-recover' });
  if (!sent.accepted) throw new Error(`${PRODUCTION_GUARD_HOLD_STAGE} Parry event rejected`);
  runtime.sync();
  const production = getProductionParryDeflectProfile(PRODUCTION_PARRY_DEFLECT_VARIANTS.PARRY);
  const reactionDurationMs = production.reactionDurationSeconds * 1000;
  let result = runtime.update(reactionDurationMs);
  if (result.snapshot.state !== GUARD_STATES.RECOVER) {
    throw new Error(`${PRODUCTION_GUARD_HOLD_STAGE} expected RECOVER after ${reactionDurationMs}ms Parry, got ${result.snapshot.state}`);
  }
  const recoveryCanonical = Math.abs(result.report.sourceTimeSeconds - canonicalSeconds) <= 1e-6
    && result.report.stableGuardStage === STABLE_GUARD_HOLD_STAGE
    && result.report.canonicalGuardSample === LONGSWORD_GUARD_AUTHORING_STATE.baseSample;
  const recoveryDurationMs = result.report.recoveryDurationMs;
  result = runtime.update(recoveryDurationMs);
  const returnedToHold = result.snapshot.state === GUARD_STATES.HOLD;
  const holdCanonical = returnedToHold
    && Math.abs(result.report.sourceTimeSeconds - canonicalSeconds) <= 1e-6
    && result.report.stableGuardStage === STABLE_GUARD_HOLD_STAGE
    && result.report.livingGuardStage === PRODUCTION_GUARD_HOLD_STAGE;
  result = runtime.update(500);
  const livingResumed = result.snapshot.state === GUARD_STATES.HOLD
    && Math.abs(result.report.sourceTimeSeconds - (canonicalSeconds + 0.5)) <= 1e-5
    && result.report.livingGuardStage === PRODUCTION_GUARD_HOLD_STAGE;
  return {
    reactionDurationMs,
    recoveryCanonical,
    recoveryDurationMs,
    returnedToHold,
    holdCanonical,
    livingResumed,
    pass: recoveryCanonical && returnedToHold && holdCanonical && livingResumed,
  };
}

async function main() {
  status.textContent = `${PRODUCTION_GUARD_HOLD_STAGE} loading production Skyrim Guard clips…`;
  const library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig: character.rig,
    fps: 30,
  });
  character.registerAnimations(library);

  const holdClipId = 'SKYRIM_GUARD/shd_blockidle';
  const holdDuration = character.getAnimationDuration(holdClipId);
  const canonicalSeconds = canonicalGuardSourceTime(holdDuration);
  const entry = resetToHold();
  const entryCanonical = Math.abs(entry.report.sourceTimeSeconds - canonicalSeconds) <= 1e-6
    && entry.report.stableGuardStage === STABLE_GUARD_HOLD_STAGE
    && entry.report.livingGuardStage === PRODUCTION_GUARD_HOLD_STAGE
    && entry.report.canonicalGuardSample === LONGSWORD_GUARD_AUTHORING_STATE.baseSample;
  const hold = measureLivingHold(canonicalSeconds);
  const recover = verifyRecoverTarget(canonicalSeconds);
  const pass = entryCanonical && hold.pass && recover.pass;
  const report = {
    stage: PRODUCTION_GUARD_HOLD_STAGE,
    stableFoundationStage: STABLE_GUARD_HOLD_STAGE,
    pass,
    holdClipId,
    holdDuration,
    authoredBaseSample: LONGSWORD_GUARD_AUTHORING_STATE.baseSample,
    canonicalSeconds,
    entryCanonical,
    hold,
    recover,
    thresholds: {
      rootMaxStepDegrees: 0.1,
      rootMaxExcursionDegrees: 0.1,
      activeBoneMaxStepDegrees: 8,
      activeBoneSeamStepDegrees: 3,
      minimumChestExcursionDegrees: 1,
      minimumWeaponUpperArmExcursionDegrees: 1,
    },
  };

  document.documentElement.dataset.g352 = pass ? 'pass' : 'fail';
  document.documentElement.dataset.g352Entry = entryCanonical ? 'pass' : 'fail';
  document.documentElement.dataset.g352HoldSource = hold.sourceAdvanced ? 'pass' : 'fail';
  document.documentElement.dataset.g352HoldPose = hold.rootLocked && hold.frameContinuous ? 'pass' : 'fail';
  document.documentElement.dataset.g352Recover = recover.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g365 = pass ? 'pass' : 'fail';
  document.documentElement.dataset.g365Living = hold.livingMotionVisible ? 'pass' : 'fail';
  document.documentElement.dataset.g365Root = hold.rootLocked ? 'pass' : 'fail';
  document.documentElement.dataset.g365Seam = hold.seamContinuous ? 'pass' : 'fail';
  document.documentElement.dataset.g365Recover = recover.pass ? 'pass' : 'fail';
  reportNode.textContent = JSON.stringify(report, null, 2);
  status.textContent = `${PRODUCTION_GUARD_HOLD_STAGE} ${pass ? 'PASS' : 'FAIL'} · full 40s Skyrim Living Hold @60fps + seam + Recover handoff`;
  status.className = pass ? 'good' : 'bad';
  window.__G365_LIVING_GUARD_RESULT__ = report;
  window.__G352_RESULT__ = report;
}

main().catch((error) => {
  document.documentElement.dataset.g352 = 'fail';
  document.documentElement.dataset.g365 = 'fail';
  status.textContent = `${PRODUCTION_GUARD_HOLD_STAGE} FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
  window.__G365_LIVING_GUARD_RESULT__ = { stage: PRODUCTION_GUARD_HOLD_STAGE, pass: false, error: error?.stack || String(error) };
});
