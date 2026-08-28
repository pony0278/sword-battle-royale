import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY,
  R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE,
  createBoundedShieldArmAdditiveRuntime,
  planBoundedShieldArmAdditive,
} from '../src/combat/predictive-parry-arm-additive.js';

const identity = () => ({ x: 0, y: 0, z: 0, w: 1 });

function axisAngleZ(degrees) {
  const radians = degrees * Math.PI / 180;
  return { x: 0, y: 0, z: Math.sin(radians / 2), w: Math.cos(radians / 2) };
}

function angleDegrees(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const w = Math.min(1, Math.max(-1, Math.abs(q.w / length)));
  return 2 * Math.acos(w) * 180 / Math.PI;
}

function authored({ upper = 0, lower = 0, wrist = 0 } = {}) {
  return {
    deltas: {
      'upperarm.l': { quaternion: axisAngleZ(upper), angleDegrees: Math.abs(upper) },
      'lowerarm.l': { quaternion: axisAngleZ(lower), angleDegrees: Math.abs(lower) },
      'wrist.l': { quaternion: axisAngleZ(wrist), angleDegrees: Math.abs(wrist) },
    },
  };
}

function rig() {
  return {
    bones: {
      'upperarm.l': { quaternion: identity() },
      'lowerarm.l': { quaternion: identity() },
      'wrist.l': { quaternion: identity() },
    },
  };
}

test('R18N.4.3-B.1 keeps wrist solver-only and caps shoulder/elbow authored motion', () => {
  assert.equal(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_STAGE, 'R18N.4.3-B.1');
  assert.deepEqual(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY.bones['upperarm.l'], {
    weight: 0.72, maxAngleDegrees: 18, enabled: true,
  });
  assert.deepEqual(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY.bones['lowerarm.l'], {
    weight: 0.72, maxAngleDegrees: 22, enabled: true,
  });
  assert.equal(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY.bones['wrist.l'].enabled, false);
  assert.equal(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY.bones['wrist.l'].solverOnly, true);

  const plan = planBoundedShieldArmAdditive(authored({ upper: 46.84, lower: 62.80, wrist: 25.90 }));
  assert.ok(Math.abs(plan.bones['upperarm.l'].targetAngleDegrees - 18) < 1e-9);
  assert.ok(Math.abs(plan.bones['lowerarm.l'].targetAngleDegrees - 22) < 1e-9);
  assert.equal(plan.bones['wrist.l'].targetAngleDegrees, 0);
  assert.equal(plan.bones['upperarm.l'].capped, true);
  assert.equal(plan.bones['lowerarm.l'].capped, true);
  assert.equal(plan.authority, 'bounded-authored-target-planning-no-rig-write-no-contact-authority');
});

test('R18N.4.3-B.1 applies only the authored bounded delta increment so identical frames do not accumulate', () => {
  const defenderRig = rig();
  const runtime = createBoundedShieldArmAdditiveRuntime();
  const first = runtime.update({
    rig: defenderRig,
    authoredDelta: authored({ upper: 30, lower: 40, wrist: 90 }),
    sequence: 7,
    enabled: true,
  });
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['upperarm.l'].quaternion) - 18) < 1e-6);
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['lowerarm.l'].quaternion) - 22) < 1e-6);
  assert.ok(angleDegrees(defenderRig.bones['wrist.l'].quaternion) < 1e-9);
  assert.deepEqual(first.appliedBones, ['upperarm.l', 'lowerarm.l']);

  const second = runtime.update({
    rig: defenderRig,
    authoredDelta: authored({ upper: 30, lower: 40, wrist: 90 }),
    sequence: 7,
    enabled: true,
  });
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['upperarm.l'].quaternion) - 18) < 1e-6);
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['lowerarm.l'].quaternion) - 22) < 1e-6);
  assert.ok(second.bones['upperarm.l'].incrementalAngleDegrees < 1e-6);
  assert.ok(second.bones['lowerarm.l'].incrementalAngleDegrees < 1e-6);
  assert.deepEqual(second.appliedBones, []);
});

test('R18N.4.3-B.1 follows the authored curve progressively before the caps', () => {
  const defenderRig = rig();
  const runtime = createBoundedShieldArmAdditiveRuntime();
  runtime.update({ rig: defenderRig, authoredDelta: authored({ upper: 4, lower: 6 }), sequence: 2, enabled: true });
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['upperarm.l'].quaternion) - 2.88) < 1e-6);
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['lowerarm.l'].quaternion) - 4.32) < 1e-6);

  const next = runtime.update({ rig: defenderRig, authoredDelta: authored({ upper: 10, lower: 14 }), sequence: 2, enabled: true });
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['upperarm.l'].quaternion) - 7.2) < 1e-6);
  assert.ok(Math.abs(angleDegrees(defenderRig.bones['lowerarm.l'].quaternion) - 10.08) < 1e-6);
  assert.ok(Math.abs(next.bones['upperarm.l'].incrementalAngleDegrees - 4.32) < 1e-6);
  assert.ok(Math.abs(next.bones['lowerarm.l'].incrementalAngleDegrees - 5.76) < 1e-6);
});

test('R18N.4.3-B.1 disabled path owns no pose and clears prior authored target carry', () => {
  const defenderRig = rig();
  const runtime = createBoundedShieldArmAdditiveRuntime();
  runtime.update({ rig: defenderRig, authoredDelta: authored({ upper: 8 }), sequence: 1, enabled: true });
  const disabled = runtime.update({ rig: defenderRig, authoredDelta: authored({ upper: 20 }), sequence: 1, enabled: false });
  assert.equal(disabled.applied, false);
  assert.equal(disabled.active, false);
  assert.equal(disabled.finalPoseOwner, 'active-intercept-final-arm-closure');
});

test('R18N.4.3-B.1 additive runtime has pose authority only and no contact authority', async () => {
  const source = await readFile(new URL('../src/combat/predictive-parry-arm-additive.js', import.meta.url), 'utf8');
  assert.match(source, /bounded-authored-increment-before-active-intercept-final-solve-no-contact-authority/);
  assert.doesNotMatch(source, /parryGate|resolveContact|probeSweptSwordBucklerContact|confirm\(/);
});

test('R18N.4.3-B.1 is wired after stance and before final Active Intercept closure', async () => {
  const preContact = await readFile(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
  // R18S.3: the stance is the last writer of the director's reach ladder.
  const stanceIndex = preContact.indexOf('parryInterceptDirector.reach({');
  const additiveIndex = preContact.indexOf('shieldArmAdditiveRuntime.update({');
  const additiveTapIndex = preContact.indexOf('visualOwnership.afterShieldArmAdditive(shieldArmBoundedAdditive)');
  const closureIndex = preContact.indexOf('parryInterceptDirector.finalClosure({');
  const closureTapIndex = preContact.indexOf('visualOwnership.afterFinalClosure(activeInterceptArmClosure)');
  assert.ok(stanceIndex >= 0);
  assert.ok(additiveIndex > stanceIndex, 'bounded additive must run after stance/body support');
  assert.ok(additiveTapIndex > additiveIndex, 'telemetry must observe the additive writer immediately');
  assert.ok(closureIndex > additiveTapIndex, 'Active Intercept final closure must run after bounded additive');
  assert.ok(closureTapIndex > closureIndex, 'final closure telemetry must remain the last arm writer tap');
  assert.doesNotMatch(preContact, /parryGate\.confirm\(|combat\.resolveContact\(|probeSweptSwordBucklerContact\(/);
});
