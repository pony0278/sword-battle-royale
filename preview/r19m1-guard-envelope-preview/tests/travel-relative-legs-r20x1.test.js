import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKWARD_CLIP_THRESHOLD_RADIANS,
  MEASURED_SIDESTEP_DRIFT,
  MAXIMUM_HIP_YAW_RADIANS,
  SIDESTEP_HIP_YAW_RADIANS,
  TRAVEL_RELATIVE_LEGS_STAGE,
  TRAVEL_YAW_BONES,
  TRAVEL_YAW_FORBIDDEN_BONE,
  hipYawDeltaQuaternion,
  planTravelRelativeLegs,
} from '../src/combat/travel-relative-legs.js';
import { WALK_OVERLAY_BONES } from '../src/combat/guard-walk-overlay.js';
import { MEASURED_LOCOMOTION_CLIPS } from '../src/combat/locomotion-clip-measurements.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { ORBIT_CROSSOVER_RADIUS_METERS } from '../src/combat/orbit-steering-budget.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';

const degrees = (radians) => radians * 180 / Math.PI;

test('R20X.1 the stride turns to face travel, and a sidestep is a right angle', () => {
  assert.equal(TRAVEL_RELATIVE_LEGS_STAGE, 'R20X.1');
  const straight = planTravelRelativeLegs({ forwardMeters: 0.02, lateralMeters: 0 });
  assert.equal(straight.legYawRadians, 0);
  assert.equal(straight.signedTravelMeters, 0.02);

  const sidestep = planTravelRelativeLegs({ forwardMeters: 0, lateralMeters: 0.0125 });
  assert.ok(Math.abs(degrees(sidestep.legYawRadians) - 90) < 1e-9);
  assert.equal(sidestep.backwards, false);
  assert.equal(sidestep.signedTravelMeters, 0.0125);
  assert.equal(Math.abs(sidestep.legYawRadians), SIDESTEP_HIP_YAW_RADIANS);

  const other = planTravelRelativeLegs({ forwardMeters: 0, lateralMeters: -0.0125 });
  assert.ok(Math.abs(degrees(other.legYawRadians) + 90) < 1e-9, 'and it turns the other way');

  const diagonal = planTravelRelativeLegs({ forwardMeters: 0.01, lateralMeters: 0.01 });
  assert.ok(Math.abs(degrees(diagonal.legYawRadians) - 45) < 1e-9);
  assert.ok(Math.abs(diagonal.magnitudeMeters - Math.hypot(0.01, 0.01)) < 1e-12,
    'the gait gets the whole distance, not its forward projection');
});

test('R20X.1 a backpedal keeps its own clip, and every turn stays inside a right angle', () => {
  const back = planTravelRelativeLegs({ forwardMeters: -0.0125, lateralMeters: 0 });
  assert.equal(back.backwards, true);
  assert.equal(back.signedTravelMeters, -0.0125);
  assert.equal(back.legYawRadians, 0, 'the backwards clip already goes backwards');

  // Sweeping the whole circle for the real bound. It is NOT the right angle a sidestep needs: the
  // deadband hands the forward clip to travel up to 108 degrees off the nose, and that band is the
  // most the hip is ever asked for.
  let worst = 0;
  for (let angle = -180; angle <= 180; angle += 5) {
    const radians = angle * Math.PI / 180;
    const plan = planTravelRelativeLegs({
      forwardMeters: Math.cos(radians) * 0.02, lateralMeters: Math.sin(radians) * 0.02,
    });
    worst = Math.max(worst, Math.abs(plan.legYawRadians));
    assert.ok(Math.abs(plan.legYawRadians) <= MAXIMUM_HIP_YAW_RADIANS + 1e-9,
      `${angle} degrees of travel asked for ${degrees(plan.legYawRadians).toFixed(1)} at the hip`);
    assert.ok(Math.abs(plan.magnitudeMeters - 0.02) < 1e-9);
  }
  assert.ok(worst > SIDESTEP_HIP_YAW_RADIANS, 'the worst case really is past the sidestep');
  assert.ok(Math.abs(degrees(worst) - degrees(MAXIMUM_HIP_YAW_RADIANS)) < 5,
    `worst case ${degrees(worst).toFixed(1)} degrees at the hip`);
});

test('R20X.1 a sidestep is not classified as a backpedal by a drifting sign', () => {
  // Measured: walking a straight line while the facing tracks the opponent puts a small negative
  // forward component in the body frame, so a sidestep judged by that sign alone flips to the
  // backwards clip within a frame of the press. The deadband is what stops it.
  assert.ok(BACKWARD_CLIP_THRESHOLD_RADIANS > Math.PI / 2, 'past square is still a sidestep');
  assert.equal(MEASURED_SIDESTEP_DRIFT.deadbandRadians, BACKWARD_CLIP_THRESHOLD_RADIANS);
  const drifting = planTravelRelativeLegs({ forwardMeters: -0.0004, lateralMeters: 0.0125 });
  assert.equal(drifting.backwards, false, 'a hair of backwards drift must not swap the clip');
  const genuinelyBacking = planTravelRelativeLegs({ forwardMeters: -0.0125, lateralMeters: 0.004 });
  assert.equal(genuinelyBacking.backwards, true, 'and a real backpedal still gets its own clip');
});

test('R20X.1 standing still asks for nothing', () => {
  const still = planTravelRelativeLegs({ forwardMeters: 0, lateralMeters: 0 });
  assert.equal(still.magnitudeMeters, 0);
  assert.equal(still.legYawRadians, 0);
  assert.equal(still.signedTravelMeters, 0);
  assert.equal(planTravelRelativeLegs().magnitudeMeters, 0);
  assert.equal(planTravelRelativeLegs({ forwardMeters: Number.NaN, lateralMeters: 'x' }).magnitudeMeters, 0);
});

test('R20X.1 the hip yaw is a world turn expressed in the parent frame', () => {
  // With an unrotated pelvis the delta is just the yaw itself.
  const upright = hipYawDeltaQuaternion(Math.PI / 2, { x: 0, y: 0, z: 0, w: 1 });
  assert.ok(Math.abs(upright.y - Math.sin(Math.PI / 4)) < 1e-12);
  assert.ok(Math.abs(upright.w - Math.cos(Math.PI / 4)) < 1e-12);

  // A pelvis already yawed commutes with a yaw, so the delta is unchanged - the whole point of
  // conjugating is that the axis stays the world's vertical however the body is turned.
  const spun = hipYawDeltaQuaternion(Math.PI / 2, { x: 0, y: Math.sin(0.7), z: 0, w: Math.cos(0.7) });
  for (const key of ['x', 'y', 'z', 'w']) assert.ok(Math.abs(spun[key] - upright[key]) < 1e-12, key);

  // A pelvis tipped forward does not: the delta has to tilt with it, or the legs would swing about
  // the pelvis's own axis instead of about the ground's.
  const pitched = hipYawDeltaQuaternion(Math.PI / 2, { x: Math.sin(0.4), y: 0, z: 0, w: Math.cos(0.4) });
  assert.ok(Math.abs(pitched.z) > 1e-3, 'a tipped pelvis needs a tipped delta');
  assert.ok(Math.abs(Math.hypot(pitched.x, pitched.y, pitched.z, pitched.w) - 1) < 1e-12, 'still a rotation');

  // Zero yaw is the identity, so nothing is touched when travel is already straight ahead.
  const none = hipYawDeltaQuaternion(0, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(none, { x: 0, y: 0, z: 0, w: 1 });
  // A missing parent is treated as upright rather than as a crash.
  assert.deepEqual(hipYawDeltaQuaternion(0, null), { x: 0, y: 0, z: 0, w: 1 });
});

test('R20X.1 turns the legs the overlay already owns, and stops one bone short of the pelvis', () => {
  for (const bone of TRAVEL_YAW_BONES) {
    assert.ok(WALK_OVERLAY_BONES.includes(bone), `${bone} must already belong to the walk`);
  }
  // R19E.1 measured by screenshot that the pelvis takes the guard torso with it. This is the bone
  // that must never be added here, and naming it is what keeps that finding attached to the code.
  assert.equal(TRAVEL_YAW_FORBIDDEN_BONE, 'hips');
  assert.ok(!TRAVEL_YAW_BONES.includes(TRAVEL_YAW_FORBIDDEN_BONE));
  assert.ok(!WALK_OVERLAY_BONES.includes(TRAVEL_YAW_FORBIDDEN_BONE));
});

test('R20X.1 the reason there is no strafe clip to reach for, in numbers', () => {
  // The only lateral cycles in the pack, and what they would cost at the speed we sidestep at.
  const strafe = MEASURED_LOCOMOTION_CLIPS.Running_Strafe_Left;
  const rate = LANE_LOCOMOTION_PROFILE.lateralSpeedMps / strafe.authoredSpeedMps;
  assert.ok(rate < 0.3, `the running strafe would play at ${rate.toFixed(2)}x`);
  assert.ok(strafe.airborneFraction > 0.75, 'and it is airborne for most of its cycle');

  // And why raising the sidestep to suit it is a combat change, not an animation one: the radius
  // where circling out-turns a windup's aim scales with the sidestep speed, and today it sits
  // inside the contact floor - which is exactly why an orbit is not a dodge.
  assert.ok(ORBIT_CROSSOVER_RADIUS_METERS > MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  const doubled = ORBIT_CROSSOVER_RADIUS_METERS * 2;
  assert.ok(doubled > 1.8, `at twice the sidestep speed the crossover reaches ${doubled.toFixed(2)}m`);
});
