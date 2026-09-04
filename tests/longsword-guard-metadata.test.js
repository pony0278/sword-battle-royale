import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LONGSWORD_GUARD_AUTHORING_STATE,
  LONGSWORD_GUARD_BASE,
  LONGSWORD_GUARD_CORRECTION_ORDER,
  LONGSWORD_TRIANGLE_GUARD_TARGETS,
  evaluateLongswordTriangleGuardTargets,
} from '../src/combat/longsword-guard-metadata.js';
import { GUARD_CORRECTION_SCOPE, getGuardCorrectionBones } from '../src/combat/guard-correction-scope.js';

test('G2.5.1 freezes shd_blockidle as an authored ADOPT WITH CORRECTIONS base', () => {
  assert.equal(LONGSWORD_GUARD_BASE.clipId, 'SKYRIM_GUARD/shd_blockidle');
  assert.equal(LONGSWORD_GUARD_BASE.adoptionDecision, 'ADOPT WITH CORRECTIONS');
  assert.equal(LONGSWORD_GUARD_BASE.lowLevelRetargetFrozen, true);
  assert.equal(LONGSWORD_GUARD_AUTHORING_STATE.authored, true);
  assert.equal(LONGSWORD_GUARD_AUTHORING_STATE.authoredStage, 'G2.5.1');
  assert.equal(LONGSWORD_GUARD_AUTHORING_STATE.validation.fiveSamplePass, true);
  assert.equal(LONGSWORD_GUARD_AUTHORING_STATE.validation.visualFourViewPass, true);
  assert.deepEqual(Object.keys(LONGSWORD_GUARD_AUTHORING_STATE.offsets), [
    'chest',
    'upperarm.r',
    'lowerarm.r',
    'wrist.r',
    'handslot.r',
  ]);
});

test('G2.5 correction scope cannot overwrite root or lower body', () => {
  const allowed = new Set(getGuardCorrectionBones());
  for (const bone of GUARD_CORRECTION_SCOPE.forbiddenBones) {
    assert.equal(allowed.has(bone), false, `${bone} must remain source-authored`);
  }

  assert.deepEqual(GUARD_CORRECTION_SCOPE.requiredBones, [
    'upperarm.r',
    'lowerarm.r',
    'wrist.r',
  ]);
  assert.equal(GUARD_CORRECTION_SCOPE.policy.equipmentTrimOnly, true);
  assert.equal(GUARD_CORRECTION_SCOPE.policy.equipmentTrimMaxDegrees, 15);
});

test('G2.5 canonical pre-correction shape isolates the three known failures', () => {
  const result = evaluateLongswordTriangleGuardTargets({
    weaponHandHeight: 0.41,
    offHandHeight: 0.73,
    weaponHandCenterDistance: 0.57,
    offHandCenterDistance: 0.58,
    swordTipHeight: 0.28,
    swordForwardDot: -0.80,
    triangleArea: 0.06,
    torsoYawDegrees: 35.9,
  });

  assert.equal(result.status, 'needs-correction');
  assert.deepEqual(result.failures, [
    'weaponHandHeight',
    'swordTipHeight',
    'swordForwardDot',
  ]);
});

test('G2.5.1 canonical 50 percent sample passes the authored target contract', () => {
  const result = evaluateLongswordTriangleGuardTargets({
    weaponHandHeight: 0.51909,
    offHandHeight: 0.69086,
    weaponHandCenterDistance: 0.52421,
    offHandCenterDistance: 0.58354,
    swordTipHeight: 0.73974,
    swordForwardDot: 0.73257,
    triangleArea: 0.64921,
    torsoYawDegrees: 34.47474,
  });

  assert.equal(result.status, 'good');
  assert.deepEqual(result.failures, []);
});

test('G2.5 target contract is intentionally tighter than the generic G2.4 suitability gate', () => {
  assert.equal(LONGSWORD_TRIANGLE_GUARD_TARGETS.weaponHandHeight.min, 0.50);
  assert.equal(LONGSWORD_TRIANGLE_GUARD_TARGETS.swordTipHeight.min, 0.70);
  assert.equal(LONGSWORD_TRIANGLE_GUARD_TARGETS.swordForwardDot.min, 0.65);
  assert.deepEqual(LONGSWORD_TRIANGLE_GUARD_TARGETS.triangleArea, { min: 0.035 });
  assert.deepEqual(LONGSWORD_TRIANGLE_GUARD_TARGETS.torsoYawDegrees, { min: 20, max: 38 });
  assert.equal(LONGSWORD_GUARD_CORRECTION_ORDER.includes('apply-g2.4.5-weapon-bind-calibration'), true);
});
