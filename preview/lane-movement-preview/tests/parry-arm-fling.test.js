import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARRY_ARM_FLING_PROFILES,
  PARRY_ARM_FLING_STAGE,
  computeParryArmFlingImpulse,
  createParryArmFlingIntegrator,
  planParryArmFling,
} from '../src/combat/parry-arm-fling.js';

// A TOP exchange as the swept probe reports it: the sword comes down onto a
// shield whose face is tilted up toward the attacker, while the defender's
// parry sweep carries the surface up and outward.
const TOP = Object.freeze({
  outcome: 'parry',
  contactPoint: { x: 0.05, y: 1.25, z: 0.35 },
  surfaceNormal: { x: 0, y: 0.42, z: 0.91 },
  incomingVelocity: { x: 0.2, y: -6.4, z: -0.6 },
  shieldSweepVelocity: { x: 0.1, y: 1.4, z: 0.3 },
  jointOrigins: {
    shoulder: { x: 0.18, y: 1.38, z: 0.78 },
    elbow: { x: 0.16, y: 1.30, z: 0.55 },
    wrist: { x: 0.10, y: 1.27, z: 0.42 },
  },
});

test('R18P.1 rebounds the closing speed along the normal and drags along the sweep', () => {
  const report = computeParryArmFlingImpulse(TOP);
  assert.equal(report.accepted, true);
  assert.equal(report.stage, PARRY_ARM_FLING_STAGE);
  assert.ok(report.closingSpeed < 0, 'the sword must be closing on the shield');
  assert.ok(report.normalImpulseNs > 0);
  assert.ok(report.tangentImpulseNs > 0, 'the shield sweep must contribute drag');
  // The impulse must throw the sword up and back out of the defender.
  assert.ok(report.impulse.y > 0);
  assert.ok(report.impulse.z > 0);
  assert.ok(report.impulseMagnitudeNs <= report.profile.maximumImpulseNs + 1e-9);

  // With no sweep the impulse is the normal rebound plus the knock-aside;
  // for this downward chop the knock-aside points back up the face.
  const still = computeParryArmFlingImpulse({ ...TOP, shieldSweepVelocity: { x: 0, y: 0, z: 0 } });
  assert.equal(still.tangentImpulseNs, 0);
  assert.ok(still.carryDirection.y > 0.8, 'the chop is returned upward');
  assert.ok(still.impulse.y > 0);
});

test('R18P.1 floors the closing speed for a confirmed parry and refuses only a missing normal', () => {
  // The fling runs only after real swept contact confirmed the parry, so a
  // measured velocity mangled by the review clock must not kill the reaction:
  // the profile floor takes over.
  const floored = computeParryArmFlingImpulse({
    ...TOP,
    incomingVelocity: { x: 0, y: 2, z: 4 },
    shieldSweepVelocity: { x: 0, y: 0, z: 0 },
  });
  assert.equal(floored.accepted, true);
  assert.ok(floored.measuredClosingSpeed > 0, 'the raw measurement really was separating');
  assert.equal(floored.closingSpeed, -floored.profile.minimumClosingSpeedMetersPerSecond);
  assert.ok(floored.normalImpulseNs > 0);
  // With no floor authored, a separating contact still refuses.
  const bare = computeParryArmFlingImpulse({
    ...TOP,
    incomingVelocity: { x: 0, y: 2, z: 4 },
    shieldSweepVelocity: { x: 0, y: 0, z: 0 },
    profile: { minimumClosingSpeedMetersPerSecond: 0 },
  });
  assert.equal(bare.accepted, false);
  assert.equal(bare.reason, 'no-closing-contact-speed');
  assert.equal(computeParryArmFlingImpulse({ ...TOP, surfaceNormal: null }).reason, 'missing-surface-normal');
});

test('R18P.1 gives every joint an axis from its own lever arm and bounded speed', () => {
  const plan = planParryArmFling(TOP);
  assert.equal(plan.accepted, true);
  for (const name of ['shoulder', 'elbow', 'wrist']) {
    const joint = plan.joints[name];
    assert.ok(Math.abs(Math.hypot(joint.axis.x, joint.axis.y, joint.axis.z) - 1) < 1e-9);
    assert.ok(joint.initialVelocityRadPerSecond > 0);
    assert.ok(joint.initialVelocityRadPerSecond <= plan.profile.maximumJointSpeedRadPerSecond + 1e-9);
  }
  // For a TOP exchange the shoulder axis is dominantly lateral, which is what
  // swings the arm up over the shoulder rather than across the body.
  assert.ok(Math.abs(plan.joints.shoulder.axis.x) > 0.7);
  // The off-hand swings about the impulse's lateral axis, not the weapon
  // arm's own axis, so a hanging arm still rises.
  assert.ok(Math.abs(plan.offHandAxis.y) < 0.3);
  assert.equal(planParryArmFling({ ...TOP, jointOrigins: { shoulder: TOP.jointOrigins.shoulder } }).accepted, false);
});

test('R18P.1 perfect parry flings harder and travels further than parry', () => {
  const parry = PARRY_ARM_FLING_PROFILES.parry;
  const perfect = PARRY_ARM_FLING_PROFILES['perfect-parry'];
  assert.ok(perfect.restitution > parry.restitution);
  assert.ok(perfect.travelLimitsRad.shoulder[1] > parry.travelLimitsRad.shoulder[1]);
  assert.ok(perfect.offHandRatio > parry.offHandRatio);
  assert.ok(parry.offHandRatio > 0.4 && parry.offHandRatio < 0.85,
    'the off-hand is a follower, not a second fling');
});

test('R18P.1 fling is caught by the joint limit and hangs there through the off-balance beats', () => {
  const plan = planParryArmFling(TOP);
  const integrator = createParryArmFlingIntegrator(plan);
  const shoulderLimit = plan.profile.travelLimitsRad.shoulder[1];

  // The reference whip runs at ~635 deg/s, so the catch must land within
  // ~200ms of release to read as a fling rather than a lift.
  let report = null;
  for (let i = 0; i < 6; i += 1) report = integrator.advance(34);
  assert.ok(report.caughtByJointLimit, 'the shoulder must reach its limit fast');
  assert.ok(report.anglesRad.shoulder > shoulderLimit * 0.9);

  // Through the ~500ms of stillness/collapse the arm stays hung near the
  // limit: the return stiffness is authored too soft to rewind it.
  for (let ms = 0; ms < 500; ms += 20) report = integrator.advance(20);
  assert.ok(report.anglesRad.shoulder > shoulderLimit * 0.62,
    `arm must still hang after 500ms, got ${report.anglesRad.shoulder} vs limit ${shoulderLimit}`);
  assert.ok(report.anglesRad.shoulder <= shoulderLimit + 1e-6);
});

test('R18P.1 momentum scales the impulse inside the caps', () => {
  const slow = computeParryArmFlingImpulse({ ...TOP, momentum: 0.7, profile: { maximumImpulseNs: 99 } });
  const fast = computeParryArmFlingImpulse({ ...TOP, momentum: 1.4, profile: { maximumImpulseNs: 99 } });
  assert.ok(fast.normalImpulseNs > slow.normalImpulseNs * 1.8);
});

test('R18P.1 knock-aside carries a vertical chop upward and a horizontal cut across', () => {
  const top = computeParryArmFlingImpulse({
    ...TOP,
    // straight-down chop onto a nearly attacker-facing shield, no sweep
    surfaceNormal: { x: 0, y: 0.15, z: 0.99 },
    incomingVelocity: { x: 0.1, y: -6.4, z: -1.2 },
    shieldSweepVelocity: { x: 0, y: 0, z: 0 },
  });
  assert.ok(top.carryDirection.y > 0.85, 'a chop is returned up the face');
  assert.ok(top.impulse.y > Math.abs(top.impulse.x), 'the total impulse lifts');

  const side = computeParryArmFlingImpulse({
    ...TOP,
    surfaceNormal: { x: 0.35, y: 0.05, z: 0.93 },
    incomingVelocity: { x: -5.4, y: -0.5, z: -2.2 },
    shieldSweepVelocity: { x: 0, y: 0, z: 0 },
  });
  // A horizontal cut is returned horizontally, against its own travel.
  assert.ok(Math.abs(side.carryDirection.x) > 0.8);
  assert.ok(side.carryDirection.x > 0, 'the leftward cut is knocked back to the right');
  assert.ok(Math.abs(side.carryDirection.y) < 0.4);
});
