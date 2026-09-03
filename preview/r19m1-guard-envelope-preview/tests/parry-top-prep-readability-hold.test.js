import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  R18N_TOP_PREP_READABILITY_HOLD_POLICY,
  createTopPrepReadabilityHoldRuntime,
  planTopPrepReadabilityHold,
} from '../src/combat/parry-top-prep-readability-hold.js';

function mutableQuaternion(x = 0, y = 0, z = 0, w = 1) {
  return {
    x, y, z, w,
    set(nx, ny, nz, nw) { this.x = nx; this.y = ny; this.z = nz; this.w = nw; return this; },
    normalize() {
      const length = Math.hypot(this.x, this.y, this.z, this.w) || 1;
      this.x /= length; this.y /= length; this.z /= length; this.w /= length;
      return this;
    },
  };
}

function axisAngle(axis, degrees) {
  const radians = degrees * Math.PI / 180;
  const half = radians / 2;
  const sin = Math.sin(half);
  return mutableQuaternion(axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)).normalize();
}

function angleDegrees(q) {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const w = Math.max(-1, Math.min(1, Math.abs(q.w / length)));
  return 2 * Math.acos(w) * 180 / Math.PI;
}

function rigWithIdentityArm() {
  return {
    bones: {
      'upperarm.l': { quaternion: mutableQuaternion() },
      'lowerarm.l': { quaternion: mutableQuaternion() },
      'wrist.l': { quaternion: mutableQuaternion() },
    },
  };
}

test('R18N.4.3-B.1.3 policy keeps wrist solver-only and final closure authoritative', () => {
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.stage, 'R18N.4.3-B.1.3');
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.direction, 'top');
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.bones['upperarm.l'].maxAngleDegrees, 6);
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.bones['lowerarm.l'].maxAngleDegrees, 8);
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.bones['wrist.l'].enabled, false);
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.bones['wrist.l'].solverOnly, true);
  assert.equal(R18N_TOP_PREP_READABILITY_HOLD_POLICY.finalPoseOwner, 'active-intercept-final-arm-closure');
  assert.match(R18N_TOP_PREP_READABILITY_HOLD_POLICY.authority, /no-contact-authority/);
});

test('R18N.4.3-B.1.3 envelope holds briefly, fades, and is forced out by contact safety', () => {
  const full = planTopPrepReadabilityHold({
    enabled: true, direction: 'top', presentationElapsedMs: 20, timeToContactSeconds: 0.14,
  });
  assert.equal(full.active, true);
  assert.equal(full.envelopeWeight, 1);
  assert.equal(full.reason, 'top-prep-readability-hold');

  const fading = planTopPrepReadabilityHold({
    enabled: true, direction: 'top', presentationElapsedMs: 61, timeToContactSeconds: 0.10,
  });
  assert.ok(fading.envelopeWeight > 0.45 && fading.envelopeWeight < 0.55);
  assert.equal(fading.reason, 'top-prep-readability-release');

  const safetyRelease = planTopPrepReadabilityHold({
    enabled: true, direction: 'top', presentationElapsedMs: 20, timeToContactSeconds: 0.0375,
  });
  assert.ok(Math.abs(safetyRelease.envelopeWeight - 0.5) < 1e-9);

  const released = planTopPrepReadabilityHold({
    enabled: true, direction: 'top', presentationElapsedMs: 80, timeToContactSeconds: 0.03,
  });
  assert.equal(released.active, false);
  assert.equal(released.envelopeWeight, 0);
});

test('R18N.4.3-B.1.3 is TOP-only', () => {
  for (const direction of ['right', 'left', '', null]) {
    const report = planTopPrepReadabilityHold({
      enabled: true, direction, presentationElapsedMs: 10, timeToContactSeconds: 0.15,
    });
    assert.equal(report.active, false);
    assert.equal(report.envelopeWeight, 0);
  }
});

test('R18N.4.3-B.1.3 retains a captured first-final-closure TOP prep pose without touching wrist', () => {
  const rig = rigWithIdentityArm();
  const runtime = createTopPrepReadabilityHoldRuntime();

  // Integration arms only after the first authoritative Active Intercept final closure,
  // so this pose represents the already-correct high TOP preparation pose, not pre-F Guard.
  rig.bones['upperarm.l'].quaternion = axisAngle([0, 1, 0], 12);
  rig.bones['lowerarm.l'].quaternion = axisAngle([1, 0, 0], 18);
  const arm = runtime.arm({ rig, sequence: 7, direction: 'top' });
  assert.equal(arm.accepted, true);
  assert.deepEqual(arm.anchorBones, ['upperarm.l', 'lowerarm.l']);

  rig.bones['upperarm.l'].quaternion = axisAngle([0, 1, 0], 32);
  rig.bones['lowerarm.l'].quaternion = axisAngle([1, 0, 0], 48);
  rig.bones['wrist.l'].quaternion = axisAngle([0, 0, 1], 18);

  const report = runtime.update({
    rig,
    sequence: 7,
    direction: 'top',
    enabled: true,
    presentationElapsedMs: 20,
    timeToContactSeconds: 0.14,
  });

  assert.equal(report.active, true);
  assert.equal(report.applied, true);
  assert.deepEqual(report.appliedBones, ['upperarm.l', 'lowerarm.l']);
  assert.ok(Math.abs(report.bones['upperarm.l'].targetAngleDegrees - 6) < 1e-6);
  assert.ok(Math.abs(report.bones['lowerarm.l'].targetAngleDegrees - 8) < 1e-6);
  assert.ok(Math.abs(angleDegrees(rig.bones['upperarm.l'].quaternion) - 26) < 1e-5);
  assert.ok(Math.abs(angleDegrees(rig.bones['lowerarm.l'].quaternion) - 40) < 1e-5);
  assert.ok(Math.abs(angleDegrees(rig.bones['wrist.l'].quaternion) - 18) < 1e-5);
  assert.equal(report.finalPoseOwner, 'active-intercept-final-arm-closure');
});

test('R18N.4.3-B.1.3 requires the same armed sequence and releases cleanly', () => {
  const rig = rigWithIdentityArm();
  const runtime = createTopPrepReadabilityHoldRuntime();
  runtime.arm({ rig, sequence: 11, direction: 'top' });
  rig.bones['upperarm.l'].quaternion = axisAngle([0, 1, 0], 20);

  const wrongSequence = runtime.update({
    rig, sequence: 12, direction: 'top', enabled: true,
    presentationElapsedMs: 10, timeToContactSeconds: 0.14,
  });
  assert.equal(wrongSequence.active, false);
  assert.equal(wrongSequence.applied, false);

  const late = runtime.update({
    rig, sequence: 11, direction: 'top', enabled: true,
    presentationElapsedMs: 90, timeToContactSeconds: 0.02,
  });
  assert.equal(late.active, false);
  assert.equal(late.applied, false);
});

test('R18N.4.3-B.1.3 integration captures anchor only after first actual-target final closure', async () => {
  const [preContact, holdSource] = await Promise.all([
    readFile(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/combat/parry-top-prep-readability-hold.js', import.meta.url), 'utf8'),
  ]);

  assert.match(preContact, /createTopPrepReadabilityHoldRuntime/);
  const additiveIndex = preContact.indexOf('shieldArmAdditiveRuntime.update({');
  const holdIndex = preContact.indexOf('topPrepReadabilityHoldRuntime.update({');
  const holdTapIndex = preContact.indexOf('visualOwnership.afterTopPrepReadabilityHold(topPrepReadabilityHold)');
  const closureIndex = preContact.indexOf('parryInterceptDirector.finalClosure({ activeIntent, deltaSeconds, timeToContactSeconds:'); // R24D.1: paced against the clock
  const captureIndex = preContact.indexOf('topPrepReadabilityHoldRuntime.arm({', closureIndex);
  const closureTapIndex = preContact.indexOf('visualOwnership.afterFinalClosure(activeInterceptArmClosure)');
  assert.ok(additiveIndex >= 0 && holdIndex > additiveIndex, 'readability hold must run after authored bounded additive');
  assert.ok(holdTapIndex > holdIndex, 'ownership telemetry must observe the readability writer immediately');
  assert.ok(closureIndex > holdTapIndex, 'actual-target Active Intercept final closure must remain after readability writer');
  assert.ok(captureIndex > closureIndex, 'golden TOP prep anchor must be captured only after first final closure');
  assert.ok(closureTapIndex > captureIndex, 'post-closure anchor capture must be read-only before closure telemetry');
  assert.equal(preContact.indexOf('topPrepReadabilityHoldRuntime.arm({'), captureIndex, 'there must be no pre-F/entry-pose anchor capture');
  assert.doesNotMatch(holdSource, /parryGate\.confirm\(|combat\.resolveContact\(|probeSweptSwordBucklerContact\(/);
  assert.match(holdSource, /'wrist\.l': Object\.freeze\(\{ weight: 0, maxAngleDegrees: 0, enabled: false, solverOnly: true \}\)/);
});
