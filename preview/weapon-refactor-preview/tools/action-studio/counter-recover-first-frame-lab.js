import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { loadKayKitAnimationLibrary } from '../../src/animation/kaykit-animation-library.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../../src/animation/skyrim-weapon-bind-calibration.js';
import { GUARD_EVENTS, GUARD_STATES, createGuardStateMachine } from '../../src/combat/guard-state-machine.js';
import { createGuardPresentationRuntime } from '../../src/combat/guard-presentation-runtime.js';
import { GUARD_COUNTER_PROFILE_IDS, GUARD_WEAPON_MOUNT_PROFILE_IDS } from '../../src/combat/guard-counter-presentation.js';
import { createGuardWeaponMountRuntime } from '../../src/combat/guard-weapon-mount-runtime.js';
import { GUARD_RECOVERY_PROFILES, captureRigPose } from '../../src/combat/guard-recovery-bridge.js';
import { quaternionAngleDegrees } from '../../src/combat/guard-world-sword-orientation.js';

const THREE = window.THREE;
if (!THREE?.GLTFLoader) throw new Error('G3.4.1.2 requires Three.js + GLTFLoader');

const status = document.getElementById('status');
const reportNode = document.getElementById('report');
const RIGHT_CHAIN = ['upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r', 'handslot.r'];
const FRAME_MS = 1000 / 60;
const character = createDefaultCharacter(THREE);
const machine = createGuardStateMachine();
let sword;
let mountRuntime;
let runtime;

function mountSnapshot() {
  const object = sword?.object3d;
  if (!object) return null;
  return {
    position: [object.position.x, object.position.y, object.position.z],
    quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function mountDelta(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(
    ...a.position.map((value, index) => Math.abs(value - b.position[index])),
    ...a.quaternion.map((value, index) => Math.abs(value - b.quaternion[index])),
    ...a.scale.map((value, index) => Math.abs(value - b.scale[index])),
  );
}

function worldSwordQuaternion() {
  const object = sword?.object3d;
  if (!object) return null;
  character.object3d.updateMatrixWorld(true);
  object.updateWorldMatrix?.(true, false);
  const q = new THREE.Quaternion();
  object.getWorldQuaternion(q);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function chainDeltaDegrees(a, b) {
  return Object.fromEntries(RIGHT_CHAIN.map((boneId) => [
    boneId,
    quaternionAngleDegrees(a?.[boneId]?.quaternion, b?.[boneId]?.quaternion),
  ]));
}

function chainDistanceToTarget(pose, targetPose) {
  return Object.fromEntries(RIGHT_CHAIN.map((boneId) => [
    boneId,
    quaternionAngleDegrees(pose?.[boneId]?.quaternion, targetPose?.[boneId]?.quaternion),
  ]));
}

function maxValue(record) {
  return Math.max(...Object.values(record));
}

function everyNotFarther(current, source, tolerance = 0.25) {
  return RIGHT_CHAIN.every((boneId) => current[boneId] <= source[boneId] + tolerance);
}

function applyMount(profileId) {
  mountRuntime?.apply(profileId);
  sword?.update();
}

function captureState() {
  return {
    pose: captureRigPose(character.rig),
    mount: mountSnapshot(),
    worldSword: worldSwordQuaternion(),
  };
}

function enterStableHold() {
  machine.send(GUARD_EVENTS.RESET);
  runtime.sync();
  machine.send(GUARD_EVENTS.GUARD_PRESS);
  runtime.sync();
  const enter = runtime.update(180);
  if (enter.snapshot.state !== GUARD_STATES.ENTER || !enter.report.complete) {
    throw new Error(`Guard Enter did not reach completion boundary: ${enter.snapshot.state}`);
  }
  const completed = machine.send(GUARD_EVENTS.ENTER_COMPLETE, { source: 'g3.4.1.2-lab' });
  if (!completed.accepted || completed.snapshot.state !== GUARD_STATES.HOLD) {
    throw new Error('Could not enter stable Guard Hold');
  }
  runtime.sync();
  return captureState();
}

async function main() {
  const loader = new THREE.GLTFLoader();
  const [skyrim, kaykit] = await Promise.all([
    loadSkyrimConvertedAnimationLibrary(loader, { THREE, rig: character.rig, fps: 30 }),
    loadKayKitAnimationLibrary(loader, { packIds: ['melee'] }),
  ]);
  character.registerAnimations(skyrim);
  character.registerAnimations(kaykit);

  const bind = skyrim.clips.get('SKYRIM_GUARD/shd_blockidle')?.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error('Skyrim Guard weapon bind calibration missing');
  const skyrimMount = composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind);
  sword = createDebugSword(THREE);
  mountDebugSword(character, sword, skyrimMount);
  mountRuntime = createGuardWeaponMountRuntime({
    weapon: sword,
    profiles: {
      [GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD]: skyrimMount,
      [GUARD_WEAPON_MOUNT_PROFILE_IDS.KAYKIT_DEFAULT]: DEFAULT_KAYKIT_SWORD_MOUNT,
    },
  });
  runtime = createGuardPresentationRuntime(THREE, {
    machine,
    character,
    weaponObject3d: sword.object3d,
    applyWeaponMountProfile: applyMount,
    autoComplete: false,
  });

  const hold = enterStableHold();
  machine.send(GUARD_EVENTS.PARRY_CONFIRMED, { perfect: false, verification: 'g3412-parry' });
  runtime.sync();
  const windowResult = runtime.update(100);
  if (!windowResult.report.counterWindowOpen) throw new Error('Counter window did not open');
  const confirmed = machine.send(GUARD_EVENTS.COUNTER_CONFIRMED, { authorityTick: 3412 });
  if (!confirmed.accepted || confirmed.snapshot.state !== GUARD_STATES.COUNTER) {
    throw new Error('COUNTER_CONFIRMED rejected');
  }
  runtime.sync();

  const counterDurationMs = Number(kaykit.clips.get('Melee_Block_Attack')?.duration || 0) * 1000;
  const counterEnd = runtime.update(counterDurationMs);
  if (counterEnd.snapshot.state !== GUARD_STATES.COUNTER || !counterEnd.report.complete) {
    throw new Error('Could not hold exact Counter final frame');
  }
  const finalCounter = captureState();

  const completion = machine.send(GUARD_EVENTS.COUNTER_COMPLETE, {
    source: 'g3.4.1.2-lab',
    counterProfileId: GUARD_COUNTER_PROFILE_IDS.LONGSWORD,
    clipId: 'Melee_Block_Attack',
  });
  if (!completion.accepted || completion.snapshot.state !== GUARD_STATES.RECOVER) {
    throw new Error('COUNTER_COMPLETE did not enter Recover');
  }

  const recoverZeroReport = runtime.sync();
  const recoverZero = captureState();
  const firstFrameReport = runtime.update(FRAME_MS);
  const firstFrame = captureState();
  const secondFrameReport = runtime.update(FRAME_MS);
  const secondFrame = captureState();

  const zeroChainDelta = chainDeltaDegrees(finalCounter.pose, recoverZero.pose);
  const firstChainDelta = chainDeltaDegrees(finalCounter.pose, firstFrame.pose);
  const secondChainStep = chainDeltaDegrees(firstFrame.pose, secondFrame.pose);
  const sourceToHoldDeg = chainDistanceToTarget(finalCounter.pose, hold.pose);
  const secondToHoldDeg = chainDistanceToTarget(secondFrame.pose, hold.pose);
  const zeroMountDelta = mountDelta(finalCounter.mount, recoverZero.mount);
  const firstMountDelta = mountDelta(finalCounter.mount, firstFrame.mount);
  const zeroWorldDeltaDeg = quaternionAngleDegrees(finalCounter.worldSword, recoverZero.worldSword);
  const firstWorldDeltaDeg = quaternionAngleDegrees(finalCounter.worldSword, firstFrame.worldSword);
  const sourceWorldToHoldDeg = quaternionAngleDegrees(finalCounter.worldSword, hold.worldSword);
  const secondWorldToHoldDeg = quaternionAngleDegrees(secondFrame.worldSword, hold.worldSword);
  const holdMs = Number(GUARD_RECOVERY_PROFILES.counter.continuityHoldMs) || 0;

  const gates = {
    counterDurationUnchanged: Math.abs(counterDurationMs - 1066.6667222976685) < 1,
    recoveryDurationUnchanged: recoverZeroReport.report.recoveryDurationMs === 310,
    continuityHoldIsOne60HzFrame: Math.abs(holdMs - FRAME_MS) < 1e-6,
    recoverZeroBodyExact: maxValue(zeroChainDelta) < 0.01,
    recoverZeroMountExact: zeroMountDelta < 1e-5,
    recoverZeroSwordExact: zeroWorldDeltaDeg < 0.01,
    firstFrameBodyLatched: maxValue(firstChainDelta) < 0.01,
    firstFrameMountLatched: firstMountDelta < 1e-5,
    firstFrameSwordLatched: firstWorldDeltaDeg < 0.01,
    firstFrameStillRecovering: firstFrameReport.snapshot.state === GUARD_STATES.RECOVER,
    secondFrameBeginsBlend: maxValue(secondChainStep) > 0.001,
    secondFrameStepBounded: maxValue(secondChainStep) < 12,
    secondFrameDoesNotMoveArmAway: everyNotFarther(secondToHoldDeg, sourceToHoldDeg),
    secondFrameSwordDoesNotMoveAway: secondWorldToHoldDeg <= sourceWorldToHoldDeg + 0.25,
    counterAuthorityPreserved: confirmed.snapshot.lastTransition?.authority === 'authoritative-combat',
  };
  const failures = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key);
  const report = {
    stage: 'G3.4.1.2',
    pass: failures.length === 0,
    counterDurationMs,
    recoveryDurationMs: recoverZeroReport.report.recoveryDurationMs,
    continuityHoldMs: holdMs,
    frameMs: FRAME_MS,
    states: {
      counterEnd: counterEnd.snapshot.state,
      recoverZero: recoverZeroReport.snapshot.state,
      firstFrame: firstFrameReport.snapshot.state,
      secondFrame: secondFrameReport.snapshot.state,
    },
    zeroChainDeltaDeg: zeroChainDelta,
    firstFrameChainDeltaDeg: firstChainDelta,
    secondFrameStepDeg: secondChainStep,
    sourceToHoldDeg,
    secondToHoldDeg,
    zeroMountDelta,
    firstMountDelta,
    zeroWorldDeltaDeg,
    firstWorldDeltaDeg,
    sourceWorldToHoldDeg,
    secondWorldToHoldDeg,
    gates,
    failures,
  };

  document.documentElement.dataset.g3412 = report.pass ? 'pass' : 'fail';
  document.documentElement.dataset.g3412Zero = gates.recoverZeroBodyExact && gates.recoverZeroMountExact && gates.recoverZeroSwordExact ? 'pass' : 'fail';
  document.documentElement.dataset.g3412FirstFrame = gates.firstFrameBodyLatched && gates.firstFrameMountLatched && gates.firstFrameSwordLatched ? 'pass' : 'fail';
  document.documentElement.dataset.g3412SecondFrame = gates.secondFrameStepBounded && gates.secondFrameDoesNotMoveArmAway && gates.secondFrameSwordDoesNotMoveAway ? 'pass' : 'fail';
  status.textContent = `G3.4.1.2 ${report.pass ? 'PASS' : 'FAIL'} · Counter final → Recover first-frame continuity`;
  status.className = report.pass ? 'good' : 'bad';
  reportNode.textContent = JSON.stringify(report, null, 2);
}

main().catch((error) => {
  document.documentElement.dataset.g3412 = 'fail';
  status.textContent = `G3.4.1.2 FAIL · ${error?.message || error}`;
  status.className = 'bad';
  reportNode.textContent = error?.stack || String(error);
});
