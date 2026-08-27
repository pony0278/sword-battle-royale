import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREDICTIVE_INTERCEPT_PARRY_STAGE,
  RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE,
  PREDICTIVE_PARRY_INPUT_GRADES,
  analyzePredictiveInterceptParry,
  analyzeRhythmParryTrigger,
  classifyPredictiveParryTiming,
  getCanonicalAttackTimeToContactSeconds,
  getPredictiveParryTriggerTtcSeconds,
} from '../src/combat/predictive-intercept-parry.js';

const surface = {
  center: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.26,
  thickness: 0.075,
};

function blade(z, y = 0.30) {
  return [
    { x: -0.24, y, z },
    { x: 0, y, z },
    { x: 0.24, y, z },
  ];
}

function attackSnapshot(elapsedSeconds, contactSeconds = 0.30) {
  return {
    action: { id: 'test-attack' },
    direction: 'left',
    elapsedSeconds,
    contactSeconds,
    phase: 'attack_windup',
  };
}

function close(actual, expected, epsilon = 0.02) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('G4.3B.5R.1 keeps the existing rhythm grades', () => {
  assert.equal(PREDICTIVE_INTERCEPT_PARRY_STAGE, 'G4.3B.5R');
  assert.equal(RHYTHM_TRIGGER_ACTIVE_PARRY_STAGE, 'G4.3B.5R.1');
  assert.equal(classifyPredictiveParryTiming(0.30), PREDICTIVE_PARRY_INPUT_GRADES.TOO_EARLY);
  assert.equal(classifyPredictiveParryTiming(0.18), PREDICTIVE_PARRY_INPUT_GRADES.EARLY);
  assert.equal(classifyPredictiveParryTiming(0.065), PREDICTIVE_PARRY_INPUT_GRADES.PERFECT);
  assert.equal(classifyPredictiveParryTiming(0.03), PREDICTIVE_PARRY_INPUT_GRADES.LATE);
  assert.equal(classifyPredictiveParryTiming(0.01), PREDICTIVE_PARRY_INPUT_GRADES.TOO_LATE);
});

test('G4.3B.5R.1 derives rhythm TTC from the authored attack contact time', () => {
  close(getCanonicalAttackTimeToContactSeconds(attackSnapshot(0.165)), 0.135, 1e-9);
  close(getCanonicalAttackTimeToContactSeconds(attackSnapshot(0.235)), 0.065, 1e-9);
  assert.equal(getCanonicalAttackTimeToContactSeconds({ elapsedSeconds: 0.1 }), null);
});

test('G4.3B.5R.1 normal Parry starts at canonical 135ms TTC regardless of geometry', () => {
  const rhythm = analyzeRhythmParryTrigger({
    attackSnapshot: attackSnapshot(0.165),
    requestedGrade: 'parry',
  });
  assert.equal(rhythm.available, true);
  assert.equal(rhythm.shouldTrigger, true);
  assert.equal(rhythm.reason, 'rhythm-trigger-window');
  close(rhythm.timeToContactSeconds, 0.135, 1e-9);
  close(rhythm.triggerTtcSeconds, 0.135, 1e-9);
});

test('G4.3B.5R.1 Perfect starts at canonical 65ms TTC inside the authoritative 75ms window', () => {
  const rhythm = analyzeRhythmParryTrigger({
    attackSnapshot: attackSnapshot(0.235),
    requestedGrade: 'perfect',
  });
  assert.equal(rhythm.shouldTrigger, true);
  assert.equal(rhythm.timingGrade, PREDICTIVE_PARRY_INPUT_GRADES.PERFECT);
  close(getPredictiveParryTriggerTtcSeconds('perfect'), 0.065, 1e-9);
  assert.ok(getPredictiveParryTriggerTtcSeconds('perfect') < 0.075);
});

test('G4.3B.5R.1 waits before the rhythm trigger window', () => {
  const rhythm = analyzeRhythmParryTrigger({
    attackSnapshot: attackSnapshot(0.10),
    requestedGrade: 'parry',
  });
  assert.equal(rhythm.shouldTrigger, false);
  assert.equal(rhythm.reason, 'rhythm-waiting');
  assert.ok(rhythm.timeToContactSeconds > rhythm.triggerTtcSeconds);
});

test('G4.3B.5R.1 geometry guides tracking but reachable=false cannot veto Parry start', () => {
  const plan = analyzePredictiveInterceptParry({
    attackSnapshot: attackSnapshot(0.20),
    previousBlade: blade(0.20, 0.55),
    currentBlade: blade(0.10, 0.55),
    bucklerSurface: surface,
    deltaSeconds: 0.10,
    requestedGrade: 'parry',
  });

  assert.equal(plan.shouldTrigger, true);
  assert.equal(plan.interceptable, false);
  assert.equal(plan.trackingPlan.reachable, false);
  assert.equal(plan.trackingPlan.appliedDistance, 0.18);
  assert.equal(plan.reason, 'rhythm-trigger-reach-independent');
  assert.equal(plan.geometryReason, 'predicted-intercept-out-of-parry-reach');
});

test('G4.3B.5R.1 can start active Parry even when predictive geometry is temporarily absent', () => {
  const plan = analyzePredictiveInterceptParry({
    attackSnapshot: attackSnapshot(0.20),
    requestedGrade: 'parry',
  });
  assert.equal(plan.shouldTrigger, true);
  assert.equal(plan.threat, null);
  assert.equal(plan.trackingPlan, null);
  assert.equal(plan.reason, 'rhythm-trigger-no-predicted-geometry');
});

test('G4.3B.5R.1 still exposes trackable geometry when it is available', () => {
  const plan = analyzePredictiveInterceptParry({
    attackSnapshot: attackSnapshot(0.20),
    previousBlade: blade(0.20, 0.32),
    currentBlade: blade(0.10, 0.32),
    bucklerSurface: surface,
    deltaSeconds: 0.10,
    requestedGrade: 'parry',
  });

  assert.equal(plan.shouldTrigger, true);
  assert.equal(plan.trackingPlan.mode, 'parry');
  assert.equal(plan.parryTrackingProfile.maxCorrectionMeters, 0.18);
  assert.ok(plan.trackingPlan.requiredDistance > 0.15);
  assert.ok(plan.trackingPlan.requiredDistance <= 0.18 + 1e-6);
});
