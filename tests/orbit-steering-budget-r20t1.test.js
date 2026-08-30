import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEASURED_LEFT_CLOSE_RANGE_BODY_REACH,
  MEASURED_ORBIT_AIM_ERROR_DEGREES,
  ORBIT_CROSSOVER_RADIUS_METERS,
  ORBIT_IS_NOT_A_DODGE,
  planWindupSteeringResidual,
} from '../src/combat/orbit-steering-budget.js';
import { SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND } from '../src/combat/swing-windup-tracking.js';
import { LANE_LOCOMOTION_PROFILE, MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';
import { MEASURED_UNIVERSAL_GUARD_CONE_DEGREES } from '../src/combat/guard-frontal-cone.js';

test('R20T.1 the strafe can only out-turn the tracker inside a band the ledger will not allow', () => {
  // Speed over radius against a fixed turn rate: the crossover is a division, not a judgement.
  assert.ok(Math.abs(ORBIT_CROSSOVER_RADIUS_METERS
    - LANE_LOCOMOTION_PROFILE.lateralSpeedMps / SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND) < 1e-9);
  // And it sits just inside the minimum separation, so the exploitable band is five centimetres.
  assert.ok(ORBIT_CROSSOVER_RADIUS_METERS > MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  assert.ok(ORBIT_CROSSOVER_RADIUS_METERS - MINIMUM_ENGAGEMENT_SEPARATION_METERS < 0.1);
});

test('R20T.1 the tracker keeps up at every stance and direction, worst case under a degree', () => {
  let worst = 0;
  for (const direction of ['top', 'right', 'left']) {
    for (const startSeparationMeters of [1.0, 1.1, 1.4, 1.8, 2.4, 3.0]) {
      const plan = planWindupSteeringResidual({ direction, startSeparationMeters });
      assert.equal(plan.trackerKeepsUp, true, `${direction}@${startSeparationMeters}m`);
      worst = Math.max(worst, Math.abs(plan.residualDegrees));
    }
  }
  assert.ok(worst < 1, `worst residual ${worst}`);
  // A slower tracker would not: this is what the 45 deg/s is buying, so the test says so.
  const crippled = planWindupSteeringResidual({
    direction: 'top', startSeparationMeters: 1.1, trackingRateRadiansPerSecond: (10 * Math.PI) / 180,
  });
  assert.equal(crippled.trackerKeepsUp, false);
  assert.ok(crippled.residualDegrees > 5);
});

test('R20T.1 the browser agrees with the model, and both are far inside the delivery cone', () => {
  // The measured aim error at the moment aim stops being spent, against the prediction.
  for (const [direction, byStance] of Object.entries(MEASURED_ORBIT_AIM_ERROR_DEGREES)) {
    for (const [stance, measured] of Object.entries(byStance)) {
      const predicted = planWindupSteeringResidual({ direction, startSeparationMeters: Number(stance) });
      assert.ok(measured.windupEnd <= predicted.residualDegrees + 0.5,
        `${direction}@${stance}: measured ${measured.windupEnd} against predicted ${predicted.residualDegrees.toFixed(2)}`);
      assert.ok(measured.windupEnd < 1);
    }
  }
  // And nowhere near the tightest edge that could change an outcome.
  assert.ok(ORBIT_IS_NOT_A_DODGE.worstWindupAimErrorDegrees
    < Math.abs(MEASURED_UNIVERSAL_GUARD_CONE_DEGREES.fromDegrees) / 10);
  assert.equal(ORBIT_IS_NOT_A_DODGE.guardUpOrbitedExchanges.whiffs, 0);
  assert.equal(ORBIT_IS_NOT_A_DODGE.guardUpOrbitedExchanges.blocked,
    ORBIT_IS_NOT_A_DODGE.guardUpOrbitedExchanges.trials);
});

test('R20T.1 records LEFT as unable to reach an unguarded body inside 1.4m', () => {
  // Found by accident and recorded on purpose: the still control misses identically, so movement
  // is not the cause and nobody should later blame the orbit for it.
  const { hitsByStance, trialsPerStance, reliableFromMeters } = MEASURED_LEFT_CLOSE_RANGE_BODY_REACH;
  for (const [stance, hits] of Object.entries(hitsByStance)) {
    if (Number(stance) < 1.4) assert.equal(hits, 0, `LEFT must be recorded as missing at ${stance}m`);
    if (Number(stance) >= reliableFromMeters) assert.equal(hits, trialsPerStance, `LEFT lands at ${stance}m`);
  }
  assert.deepEqual(MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.unaffectedDirections, ['top', 'right']);
  assert.equal(MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.status, 'open-finding-root-cause-not-yet-established');
});
