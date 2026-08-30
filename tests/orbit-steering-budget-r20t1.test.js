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
  assert.equal(MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.status, 'root-cause-established-design-decision-open');
});

test('R20T.1 the root cause is being inside the arc, and the numbers have to stay consistent', () => {
  const reach = MEASURED_LEFT_CLOSE_RANGE_BODY_REACH;
  // The sweep passes at a radius; a body closer than that radius is behind the blade, not in
  // front of it. Every number here is one of the three legs of that statement.
  assert.ok(reach.bladeSweepRadiusMeters > reach.requiredSeparationAtContactMeters,
    'the blade passes further out than the separation it needs, which is what "inside the arc" means');
  assert.ok(reach.requiredSeparationAtContactMeters > MINIMUM_ENGAGEMENT_SEPARATION_METERS,
    'and the ledger clamps the pair closer than the sweep needs - which is why the stance decides it');
  // The overshoot is what the closest-approach reading measured, and the miss is the perpendicular
  // distance that follows from it. The miss must be the smaller of the two, or the geometry is
  // being described wrongly.
  assert.ok(reach.missDistanceMeters < reach.overshootBeyondBodyMeters);
  assert.equal(reach.rootCause, 'the-defender-is-inside-the-sweep-arc-clamped-below-the-radius-it-passes-at');
});
