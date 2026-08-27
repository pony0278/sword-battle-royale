import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import {
  PARRY_ARM_FLING_PROFILES,
  computeParryArmFlingImpulse,
} from '../src/combat/parry-arm-fling.js';
import {
  DEFENDER_TORSO_WORLD_LEAN_PROFILES,
  PARRIED_TORSO_WORLD_LEAN_PROFILES,
  planParriedTorsoWorldLean,
} from '../src/combat/parried-torso-world-lean.js';
import {
  BLOCK_ROOT_DISPLACEMENT_PROFILES,
  PARRY_ROOT_DISPLACEMENT_PROFILES,
  planParryRootDisplacement,
} from '../src/combat/parry-root-displacement.js';

const BACKWARD = Object.freeze({ x: 0.1, y: -0.3, z: 0.95 });

// A block is absorption, a parry is redirection. The reaction system carries
// both, so every module has to answer on (outcome x role) rather than on one
// axis: root displacement only knew roles, torso lean only knew outcomes, and
// the first block wired through them leaned the winning defender back as far
// as the attacker it had just stopped.
test('R18Q.1 block trades the two actors places against parry', () => {
  const parryAttacker = PARRY_ROOT_DISPLACEMENT_PROFILES.attacker;
  const parryDefender = PARRY_ROOT_DISPLACEMENT_PROFILES.defender;
  const blockAttacker = BLOCK_ROOT_DISPLACEMENT_PROFILES.attacker;
  const blockDefender = BLOCK_ROOT_DISPLACEMENT_PROFILES.defender;

  // Parry: the parried attacker loses far more ground than the defender.
  assert.ok(parryAttacker.peakMeters > parryDefender.peakMeters * 2);
  // Block: the defender absorbs what it did not redirect and gives more
  // ground than the attacker it stopped.
  assert.ok(blockDefender.peakMeters > blockAttacker.peakMeters);
  // And a blocked attacker keeps far more of its footing than a parried one.
  assert.ok(blockAttacker.peakMeters < parryAttacker.peakMeters / 2);

  // Blocking never loses the stance, so the collapse segment is absent.
  for (const profile of [blockAttacker, blockDefender]) {
    assert.equal(profile.collapseMs, 0);
    assert.equal(profile.collapseDropMeters, 0);
  }
  assert.ok(parryAttacker.collapseDropMeters > 0);
});

test('R18Q.1 block root displacement runs on the block recoil timeline', () => {
  const plan = planParryRootDisplacement({ role: 'attacker', outcome: 'block', backwardDirection: BACKWARD });
  assert.equal(plan.accepted, true);
  assert.equal(plan.outcome, 'block');
  // The blocked reaction starts at impact and its recoil ends at 280ms; the
  // parried one is gated behind DEFLECT_IMPULSE and runs far longer.
  assert.equal(plan.durationMs, 280);
  const parried = planParryRootDisplacement({ role: 'attacker', outcome: 'parry', backwardDirection: BACKWARD });
  assert.ok(parried.durationMs > plan.durationMs * 2);

  assert.equal(
    planParryRootDisplacement({ role: 'attacker', outcome: 'nope', backwardDirection: BACKWARD }).reason,
    'unsupported-displacement-outcome',
  );
});

test('R18Q.1 a held shield rebounds the blade instead of carrying it', () => {
  const shared = {
    contactPoint: { x: 0.05, y: 1.25, z: 0.35 },
    surfaceNormal: { x: 0, y: 0.15, z: 0.99 },
    incomingVelocity: { x: 0.1, y: -6.4, z: -1.2 },
    shieldSweepVelocity: { x: 0, y: 0, z: 0 },
  };
  const block = computeParryArmFlingImpulse({ ...shared, outcome: 'block' });
  const parry = computeParryArmFlingImpulse({ ...shared, outcome: 'parry' });

  assert.equal(block.accepted, true);
  // No knock-aside: a block holds its line, so the impulse is pure rebound.
  assert.equal(block.carryImpulseNs, 0);
  assert.ok(parry.carryImpulseNs > 0);
  // Which leaves the block impulse on the surface normal.
  const n = shared.surfaceNormal;
  const cosine = (block.impulse.x * n.x + block.impulse.y * n.y + block.impulse.z * n.z)
    / (Math.hypot(block.impulse.x, block.impulse.y, block.impulse.z) * Math.hypot(n.x, n.y, n.z));
  assert.ok(cosine > 0.999);

  // The arm bounces to a short limit rather than being thrown open and hung.
  const blockProfile = PARRY_ARM_FLING_PROFILES.block;
  const parryProfile = PARRY_ARM_FLING_PROFILES.parry;
  assert.ok(blockProfile.travelLimitsRad.shoulder[1] < parryProfile.travelLimitsRad.shoulder[1] / 2);
  assert.ok(blockProfile.limitHoldMs < parryProfile.limitHoldMs / 2);
  assert.ok(blockProfile.returnStiffnessNmPerRad.shoulder > parryProfile.returnStiffnessNmPerRad.shoulder);
  assert.ok(blockProfile.offHandRatio < parryProfile.offHandRatio);
});

test('R18Q.1 torso lean answers on role as well as outcome', () => {
  const lean = (role, outcome) => planParriedTorsoWorldLean({ role, outcome, backwardDirection: BACKWARD, baseLeanDegrees: 10 });

  // A defender never leans back as far as the attacker it just stopped.
  for (const outcome of ['parry', 'block', 'perfect-parry']) {
    assert.ok(
      lean('defender', outcome).targetBackwardLeanDegrees < lean('attacker', outcome).targetBackwardLeanDegrees,
      `${outcome} defender must lean less than its attacker`,
    );
  }
  // Absorbing gives more ground than redirecting.
  assert.ok(
    lean('defender', 'block').targetBackwardLeanDegrees
      > lean('defender', 'parry').targetBackwardLeanDegrees,
  );
  // And a blocked attacker keeps more posture than a parried one.
  assert.ok(
    lean('attacker', 'block').targetBackwardLeanDegrees
      < lean('attacker', 'parry').targetBackwardLeanDegrees,
  );
  // Role defaults to attacker so existing callers keep their behaviour.
  assert.equal(
    planParriedTorsoWorldLean({ outcome: 'parry', backwardDirection: BACKWARD }).targetBackwardLeanDegrees,
    PARRIED_TORSO_WORLD_LEAN_PROFILES.parry.targetBackwardLeanDegrees,
  );
  assert.equal(DEFENDER_TORSO_WORLD_LEAN_PROFILES.block.outcome, 'block');
});

test('R18Q.1 the lab arms block at impact with no contact constraint', () => {
  // R18S.4: the arming and the outcome branch live in the lifecycle director now.
  const controller = readFileSync(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url),
    'utf8',
  );
  // Both outcomes go through one arming path, so they cannot drift apart.
  assert.match(controller, /function armReaction\(\{ outcome,/);
  assert.match(controller, /armReaction\(\{\s*\n\s*outcome: 'block',/);
  // A block never starts the live grip constraint: nothing takes the blade
  // hostage, so there is no DEFLECT_IMPULSE marker to gate the release on.
  const blockBranch = controller.slice(
    controller.indexOf("} else if (outcome === 'block') {"),
    controller.indexOf("} else if (selectedMode === 'parry') {"),
  );
  assert.ok(blockBranch.length > 0, 'the block branch must exist');
  assert.doesNotMatch(blockBranch, /swordGripConstraint\.start/);
  assert.match(blockBranch, /liveGripConstraint: false/);
  assert.match(blockBranch, /startedAtImpact: true/);
});
