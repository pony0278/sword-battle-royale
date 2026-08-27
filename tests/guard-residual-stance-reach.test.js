import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GUARD_MODE_STANCE_REACH_PROFILE,
  GUARD_RESIDUAL_STANCE_REACH_STAGE,
  classifyGuardArmCorrectionStall,
  classifyGuardKneeLineThreat,
  planGuardResidualStanceReach,
  selectGuardResidualStanceThreatPlan,
} from '../src/combat/guard-residual-stance-reach.js';

const surface = Object.freeze({
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.26,
  thickness: 0.075,
});

const recordedStall = Object.freeze({
  extensionRatio: 0.80,
  correctionAttemptedMeters: 0.041,
  correctionAchievedMeters: 0.001,
  edgeGapBeforeMeters: 0.031,
  edgeGapAfterMeters: 0.031,
});

const kneeSurface = Object.freeze({
  ...surface,
  center: { x: 0, y: 1, z: 0 },
});
const kneeLineApproach = Object.freeze({ point: { x: 0.06, y: 0.707, z: 0 } });
const bodyReference = Object.freeze({
  knees: Object.freeze({
    l: Object.freeze({ x: 0.17, y: 0.70, z: 0 }),
    r: Object.freeze({ x: -0.17, y: 0.69, z: 0 }),
  }),
  feet: Object.freeze({
    l: Object.freeze({ x: 0.17, y: 0.08, z: 0 }),
    r: Object.freeze({ x: -0.17, y: 0.07, z: 0 }),
  }),
});

test('R18B detects the recorded 80% arm as directionally stalled despite reach reserve', () => {
  const stall = classifyGuardArmCorrectionStall(recordedStall);
  assert.equal(stall.saturated, false);
  assert.equal(stall.attempted, true);
  assert.equal(stall.lowAchievement, true);
  assert.equal(stall.stalled, true);
});

test('R18C measures the recorded low miss against shield bottom, knees, and feet', () => {
  const threat = classifyGuardKneeLineThreat({
    bucklerSurface: kneeSurface,
    closestApproach: kneeLineApproach,
    bodyReference,
  });
  assert.equal(threat.measured, true);
  assert.equal(threat.zone, 'KNEE_LINE_THREAT');
  assert.equal(threat.kneeLineThreat, true);
  assert.equal(threat.lowGuardGapThreat, true);
  assert.ok(threat.downwardRatio > 0.97);
  assert.ok(Math.abs(threat.shieldBottomY - 0.74) < 1e-9);
  assert.ok(Math.abs(threat.verticalGapBelowShieldMeters - 0.033) < 1e-9);
  assert.ok(threat.kneeLineDistanceMeters < 0.01);
  assert.equal(threat.aboveFeet, true);
});

test('R18C recruits planted crouch immediately for a measured knee-line threat while arm still moves', () => {
  const plan = planGuardResidualStanceReach({
    mode: 'parry',
    bucklerSurface: kneeSurface,
    closestApproach: kneeLineApproach,
    bodyReference,
    armEvidence: {
      extensionRatio: 0.80,
      correctionAttemptedMeters: 0.041,
      correctionAchievedMeters: 0.012,
      edgeGapBeforeMeters: 0.039,
      edgeGapAfterMeters: 0.029,
    },
  });
  assert.equal(plan.arm.stalled, false);
  assert.equal(plan.threat.kneeLineThreat, true);
  assert.equal(plan.earlyKneeRecruitment, true);
  assert.equal(plan.earlyLowThreatRecruitment, true);
  assert.equal(plan.activeCandidate, true);
  assert.equal(plan.reason, 'knee-line-threat-recruit-planted-crouch-early');
  assert.ok(plan.requestedCrouchMeters > 0.044);
  assert.ok(plan.requestedCrouchMeters <= 0.045);
});

test('R18C also recruits early for a measured shield-to-feet low gap outside the knee band', () => {
  const plan = planGuardResidualStanceReach({
    mode: 'parry',
    bucklerSurface: kneeSurface,
    closestApproach: kneeLineApproach,
    bodyReference: {
      ...bodyReference,
      knees: {
        l: { x: 0.17, y: 0.45, z: 0 },
        r: { x: -0.17, y: 0.44, z: 0 },
      },
    },
    armEvidence: {
      extensionRatio: 0.80,
      correctionAttemptedMeters: 0.041,
      correctionAchievedMeters: 0.012,
      edgeGapBeforeMeters: 0.039,
      edgeGapAfterMeters: 0.029,
    },
  });
  assert.equal(plan.threat.zone, 'LOW_GUARD_GAP');
  assert.equal(plan.earlyKneeRecruitment, false);
  assert.equal(plan.earlyLowThreatRecruitment, true);
  assert.equal(plan.activeCandidate, true);
  assert.equal(plan.reason, 'low-guard-gap-recruit-planted-crouch-early');
});

test('R18D uses a future physical sword point to recruit low stance up to 180ms early', () => {
  const selection = selectGuardResidualStanceThreatPlan({
    mode: 'parry',
    bucklerSurface: kneeSurface,
    closestApproach: { point: { x: 0, y: 0.90, z: 0 } },
    anticipatedClosestApproach: kneeLineApproach,
    anticipatedLeadSeconds: 0.12,
    bodyReference,
    armEvidence: {
      extensionRatio: 0.80,
      correctionAttemptedMeters: 0.041,
      correctionAchievedMeters: 0.012,
      edgeGapBeforeMeters: 0.039,
      edgeGapAfterMeters: 0.029,
    },
  });
  assert.equal(selection.measuredPlan.activeCandidate, false);
  assert.equal(selection.anticipatedWithinLead, true);
  assert.equal(selection.anticipatedEligible, true);
  assert.equal(selection.anticipatedEligibilityReason, 'predicted-low-guard-threat-eligible');
  assert.equal(selection.source, 'predicted-future-sword-point');
  assert.equal(selection.driveClosestApproach, kneeLineApproach);
  assert.equal(selection.drivePlan.earlyKneeRecruitment, true);
  assert.equal(
    selection.authority,
    'predictive-point-for-pre-contact-posture-only-real-swept-contact-remains-success-authority',
  );
});

test('R18D rejects predicted stance guidance beyond the 180ms posture horizon', () => {
  const selection = selectGuardResidualStanceThreatPlan({
    mode: 'parry',
    bucklerSurface: kneeSurface,
    closestApproach: { point: { x: 0, y: 0.90, z: 0 } },
    anticipatedClosestApproach: kneeLineApproach,
    anticipatedLeadSeconds: 0.181,
    bodyReference,
    armEvidence: {
      extensionRatio: 0.80,
      correctionAttemptedMeters: 0.041,
      correctionAchievedMeters: 0.012,
      edgeGapBeforeMeters: 0.039,
      edgeGapAfterMeters: 0.029,
    },
  });
  assert.equal(selection.anticipatedWithinLead, false);
  assert.equal(selection.anticipatedEligible, false);
  assert.equal(selection.anticipatedEligibilityReason, 'predicted-lead-exceeds-debug-window');
  assert.equal(selection.source, 'none');
  assert.equal(selection.drivePlan, selection.measuredPlan);
});

test('R18B turns a solved-plane low edge miss into a bounded planted crouch', () => {
  const plan = planGuardResidualStanceReach({
    mode: 'parry',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0, y: -0.298, z: 0 } },
    armEvidence: recordedStall,
  });
  assert.equal(plan.stage, GUARD_RESIDUAL_STANCE_REACH_STAGE);
  assert.equal(plan.planeSolved, true);
  assert.equal(plan.edgeOutside, true);
  assert.equal(plan.lowResidual, true);
  assert.equal(plan.arm.stalled, true);
  assert.equal(plan.activeCandidate, true);
  assert.equal(plan.reason, 'arm-stalled-recruit-planted-crouch');
  assert.ok(Math.abs(plan.requestedCrouchMeters - 0.044) < 1e-9);
  assert.equal(plan.downwardRatio, 1);
  assert.ok(plan.desiredRadialCorrection.y < -0.043);
});

test('R18B does not crouch for a lateral-only edge miss', () => {
  const plan = planGuardResidualStanceReach({
    mode: 'parry',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0.298, y: 0, z: 0 } },
    armEvidence: recordedStall,
  });
  assert.equal(plan.edgeOutside, true);
  assert.equal(plan.lowResidual, false);
  assert.equal(plan.activeCandidate, false);
  assert.equal(plan.reason, 'residual-not-low-enough-for-crouch');
});

test('R18B keeps stance off while arm correction still reduces the edge miss', () => {
  const plan = planGuardResidualStanceReach({
    mode: 'parry',
    bucklerSurface: surface,
    closestApproach: { point: { x: 0, y: -0.298, z: 0 } },
    armEvidence: {
      extensionRatio: 0.80,
      correctionAttemptedMeters: 0.041,
      correctionAchievedMeters: 0.012,
      edgeGapBeforeMeters: 0.038,
      edgeGapAfterMeters: 0.026,
    },
  });
  assert.equal(plan.arm.stalled, false);
  assert.equal(plan.activeCandidate, false);
  assert.equal(plan.reason, 'arm-correction-still-effective');
});

test('R18D latches low stance for the reaching modes, and plants feet without root translation or stepping', async () => {
  // R18R.10: Parry and Guard both reach with the stance; nothing else does.
  const inert = {
    bucklerSurface: surface,
    closestApproach: { point: { x: 0, y: -0.298, z: 0 } },
    armEvidence: recordedStall,
  };
  for (const mode of ['block', 'off', 'brace']) {
    const rejected = planGuardResidualStanceReach({ ...inert, mode });
    assert.equal(rejected.activeCandidate, false, `${mode} should not reach with the stance`);
    assert.equal(rejected.reason, 'reach-modes-only');
  }
  assert.equal(planGuardResidualStanceReach({ ...inert, mode: 'guard' }).reason !== 'reach-modes-only', true);

  const source = await readFile(new URL('../src/combat/guard-residual-stance-reach.js', import.meta.url), 'utf8');
  const runtimeStart = source.indexOf('export function createGuardResidualStanceReachRuntime');
  const runtime = source.slice(runtimeStart);
  assert.match(runtime, /rig\.bones\.hips\.position\.y -= crouchMeters/);
  assert.match(runtime, /upperleg\.\$\{side\}/);
  assert.match(runtime, /lowerleg\.\$\{side\}/);
  assert.match(runtime, /foot\.\$\{side\}/);
  assert.match(runtime, /restoreWorldQuaternion/);
  assert.match(runtime, /const poleDistance = Math\.sqrt/);
  assert.match(runtime, /desiredKnee\.copy\(hipPoint\)/);
  assert.match(runtime, /feetPlanted/);
  assert.match(runtime, /captureBodyReference/);
  assert.match(runtime, /initialPlan\.earlyLowThreatRecruitment/);
  assert.match(runtime, /predicted-future-sword-point/);
  assert.match(runtime, /anticipatedClosestApproach/);
  assert.match(runtime, /stanceEngaged/);
  assert.match(runtime, /stanceHeld/);
  assert.match(runtime, /engagedTargetCrouchMeters/);
  assert.match(runtime, /clearEngagement\(\)/);
  assert.doesNotMatch(runtime, /rig\.root\.position/);
  assert.match(runtime, /rootTranslated: false/);
  assert.match(runtime, /feetStepped: false/);
  assert.match(runtime, /held-until-contact-or-reset-real-swept-contact-remains-success-authority/);
});

test('inactive residual stance skips both feet IK while preserving active planting', async () => {
  const source = await readFile(new URL('../src/combat/guard-residual-stance-reach.js', import.meta.url), 'utf8');
  const runtimeStart = source.indexOf('export function createGuardResidualStanceReachRuntime');
  const runtime = source.slice(runtimeStart);
  const skipGate = runtime.indexOf('const stanceNeedsPlanting = stanceEngaged || crouchMeters > 1e-6');
  const captureGate = runtime.indexOf('const footBefore = stanceNeedsPlanting', skipGate);
  const plantGate = runtime.indexOf('const footPlant = stanceNeedsPlanting', captureGate);

  assert.ok(skipGate >= 0 && captureGate > skipGate && plantGate > captureGate);
  assert.ok(runtime.includes("captureFoot('l')") && runtime.includes(': null;'));
  assert.ok(runtime.includes("plantFoot('l'") && runtime.includes(': SKIPPED_FOOT_PLANT_PAIR;'));
  assert.ok(runtime.includes('footPlantSkipped: !stanceNeedsPlanting'));
  assert.ok(runtime.includes('const finalSurface = stanceNeedsPlanting ?'));
});

test('R18R.10 Guard drops for a low threat its arm cannot reach, on a cue Parry would still be waiting on', () => {
  // A blade below the shield and 4cm off its plane: Guard's arm has run out of envelope there.
  const offPlaneApproach = Object.freeze({ point: { x: 0.06, y: 0.707, z: -0.078 } });
  const shared = {
    bucklerSurface: kneeSurface,
    closestApproach: offPlaneApproach,
    armEvidence: recordedStall,
    bodyReference,
  };

  const parry = planGuardResidualStanceReach({ ...shared, mode: 'parry' });
  assert.equal(parry.activeCandidate, false);
  assert.equal(parry.reason, 'shield-plane-not-solved');

  const guard = planGuardResidualStanceReach({
    ...shared, mode: 'guard', profile: GUARD_MODE_STANCE_REACH_PROFILE,
  });
  assert.equal(guard.activeCandidate, true);
  assert.equal(guard.threat.planeNear, true);
  assert.ok(guard.requestedCrouchMeters > 0);
  assert.ok(guard.requestedCrouchMeters <= guard.profile.maxCrouchMeters);
});

test('R18R.10 the Guard override relaxes the plane cues and nothing else', () => {
  assert.deepEqual(Object.keys(GUARD_MODE_STANCE_REACH_PROFILE).sort(),
    ['crouchSpeedMps', 'kneeThreatPlaneMeters', 'planeSolvedMeters']);
  const merged = planGuardResidualStanceReach({
    mode: 'guard',
    bucklerSurface: kneeSurface,
    closestApproach: kneeLineApproach,
    armEvidence: recordedStall,
    bodyReference,
    profile: GUARD_MODE_STANCE_REACH_PROFILE,
  }).profile;
  // Guard commits on a coarser read and gets down quicker, but never further.
  assert.ok(merged.planeSolvedMeters > 0.1);
  assert.ok(merged.crouchSpeedMps > 1.05);
  assert.equal(merged.maxCrouchMeters, 0.045);
  assert.equal(merged.hipsAimMaxDegrees, 3.2);
  assert.equal(merged.contactInsetMeters, 0.006);
});
