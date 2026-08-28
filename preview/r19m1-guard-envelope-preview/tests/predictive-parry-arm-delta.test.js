import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  R18N_SHIELD_ARM_DELTA_BONES,
  R18N_SHIELD_ARM_DELTA_EXTRACTION_STAGE,
  extractShieldArmAuthoredDelta,
} from '../src/combat/predictive-parry-arm-delta.js';

function axisAngleZ(degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: 0,
    y: 0,
    z: Math.sin(radians / 2),
    w: Math.cos(radians / 2),
  };
}

const identity = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

test('R18N.4.3-A tracks only the authored shield-arm presentation bones', () => {
  assert.equal(R18N_SHIELD_ARM_DELTA_EXTRACTION_STAGE, 'R18N.4.3-A');
  assert.deepEqual(R18N_SHIELD_ARM_DELTA_BONES, ['upperarm.l', 'lowerarm.l', 'wrist.l']);
});

test('R18N.4.3-A extracts local quaternion delta from entry/Guard reference to authored Parry pose', () => {
  const report = extractShieldArmAuthoredDelta({
    referencePose: {
      'upperarm.l': identity,
      'lowerarm.l': identity,
      'wrist.l': identity,
    },
    authoredPose: {
      'upperarm.l': axisAngleZ(30),
      'lowerarm.l': axisAngleZ(-20),
      'wrist.l': axisAngleZ(10),
    },
  });

  assert.ok(Math.abs(report.deltas['upperarm.l'].angleDegrees - 30) < 1e-9);
  assert.ok(Math.abs(report.deltas['lowerarm.l'].angleDegrees - 20) < 1e-9);
  assert.ok(Math.abs(report.deltas['wrist.l'].angleDegrees - 10) < 1e-9);
  assert.ok(Math.abs(report.maxAngleDegrees - 30) < 1e-9);
  assert.equal(report.authority, 'observer-only-authored-arm-delta-no-rig-write-no-contact-authority');
});

test('R18N.4.3-A treats q and -q as the same authored rotation', () => {
  const q = axisAngleZ(42);
  const report = extractShieldArmAuthoredDelta({
    referencePose: { 'upperarm.l': identity },
    authoredPose: {
      'upperarm.l': { x: -q.x, y: -q.y, z: -q.z, w: -q.w },
    },
    boneIds: ['upperarm.l'],
  });

  assert.ok(Math.abs(report.deltas['upperarm.l'].angleDegrees - 42) < 1e-9);
});

test('R18N.4.3-A output is detached and immutable', () => {
  const authored = axisAngleZ(15);
  const report = extractShieldArmAuthoredDelta({
    referencePose: { 'wrist.l': identity },
    authoredPose: { 'wrist.l': authored },
    boneIds: ['wrist.l'],
  });

  authored.z = 999;
  assert.notEqual(report.deltas['wrist.l'].quaternion.z, 999);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.deltas), true);
  assert.equal(Object.isFrozen(report.deltas['wrist.l']), true);
  assert.equal(Object.isFrozen(report.deltas['wrist.l'].quaternion), true);
});

test('R18N.4.3-A predictive runtime measures authored pose before restoring solver-owned arm pose', () => {
  const source = readFileSync(new URL('../src/combat/predictive-intercept-parry.js', import.meta.url), 'utf8');
  const blendIndex = source.indexOf('blendPresentationEntryPose(character, active.entryPose, entryBlendProgress);');
  const extractionIndex = source.indexOf('extractShieldArmAuthoredDelta({');
  const restoreIndex = source.indexOf('if (shieldArmPose) restoreBoneQuaternionPose(character, shieldArmPose);');

  assert.ok(blendIndex >= 0, 'entry blend anchor should remain present');
  assert.ok(extractionIndex > blendIndex, 'delta extraction must observe the fully blended authored pose');
  assert.ok(restoreIndex > extractionIndex, 'solver-owned shield arm must be restored after observation');
  assert.match(source, /shieldArmAuthoredDelta,/);
});

test('R18N.4.3-A extractor owns no rig/contact mutation surface', () => {
  const source = readFileSync(new URL('../src/combat/predictive-parry-arm-delta.js', import.meta.url), 'utf8');
  for (const forbidden of [
    '.copy(',
    '.slerp(',
    '.setFrom',
    'parryGate',
    'resolveContact',
    'confirm(',
    'rig.bones',
  ]) {
    assert.equal(source.includes(forbidden), false, `observer-only extractor must not contain ${forbidden}`);
  }
});
