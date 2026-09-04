import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagementGround } from '../src/combat/engagement-ground.js';

// R20N.1 - the ledger learns a second vocabulary. The relative verbs (close the gap, circle them)
// are the language of a locked duel; the world verb is the language of a player walking where they
// pushed. Both address the same 2D state; what differs is what the instruction means.

const near = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('R20N.1 a world step goes where it was aimed, while a sidestep still circles', () => {
  // Put the fight off the axis first, where the two vocabularies visibly disagree.
  const orbiting = createEngagementGround({ startSeparationMeters: 3 });
  orbiting.moveDefenderWorld(1, 0);
  const beforeOrbit = orbiting.report;
  orbiting.moveDefenderLateral(0.5);
  const afterOrbit = orbiting.report;
  // Circling spends the step on both axes, because perpendicular-to-the-line is not world x.
  assert.notEqual(afterOrbit.defenderPosition.z, beforeOrbit.defenderPosition.z);
  assert.notEqual(afterOrbit.defenderPosition.x, beforeOrbit.defenderPosition.x);

  const walking = createEngagementGround({ startSeparationMeters: 3 });
  walking.moveDefenderWorld(1, 0);
  const beforeWalk = walking.report;
  walking.moveDefenderWorld(0.5, 0);
  const afterWalk = walking.report;
  // A world step spends itself on exactly the axis it was asked for.
  near(afterWalk.defenderPosition.x, beforeWalk.defenderPosition.x + 0.5);
  near(afterWalk.defenderPosition.z, beforeWalk.defenderPosition.z);
});

test('R20N.1 world movement lands both fighters where the arithmetic says, and separation is euclidean', () => {
  const ground = createEngagementGround({ startSeparationMeters: 4 });
  const base = ground.report;
  near(base.attackerPosition.z, -2);
  near(base.defenderPosition.z, 2);

  ground.moveDefenderWorld(3, 0);
  const stepped = ground.report;
  near(stepped.defenderPosition.x, 3);
  near(stepped.defenderPosition.z, 2);
  near(stepped.separationMeters, 5, 1e-9); // 3-4-5

  ground.moveAttackerWorld(-1, 0.5);
  const both = ground.report;
  near(both.attackerPosition.x, -1);
  near(both.attackerPosition.z, -1.5);
  near(both.separationMeters, Math.hypot(3 - -1, 2 - -1.5));
});

test('R20N.1 whoever walks is the one who stops - a world step may not shove the person standing still', () => {
  const ground = createEngagementGround({ startSeparationMeters: 3, minimumSeparationMeters: 1 });
  const attackerBefore = ground.report.attackerPosition;
  // The defender walks straight into the attacker, far past the floor.
  ground.moveDefenderWorld(0, -5);
  const after = ground.report;
  near(after.separationMeters, 1, 1e-9);
  near(after.attackerPosition.x, attackerBefore.x, 1e-12);
  near(after.attackerPosition.z, attackerBefore.z, 1e-12);

  // And the same from the attacker's side.
  const other = createEngagementGround({ startSeparationMeters: 3, minimumSeparationMeters: 1 });
  const defenderBefore = other.report.defenderPosition;
  other.moveAttackerWorld(0, 5);
  const afterAttack = other.report;
  near(afterAttack.separationMeters, 1, 1e-9);
  near(afterAttack.defenderPosition.x, defenderBefore.x, 1e-12);
  near(afterAttack.defenderPosition.z, defenderBefore.z, 1e-12);
});

test('R20N.1 facing is the bearing until somebody owns it, and null hands it back', () => {
  const ground = createEngagementGround({ startSeparationMeters: 3 });
  const derived = ground.report;
  assert.equal(derived.attackerFacingSource, 'derived-from-bearing');
  assert.equal(derived.defenderFacingSource, 'derived-from-bearing');
  near(derived.attackerFacingRadians, derived.attackerBearingRadians);
  near(derived.defenderFacingRadians, derived.defenderBearingRadians);
  near(derived.attackerBearingRadians, 0);
  // Square on the lane the defender's bearing comes out of atan2(-0, -z), so it reports -PI. That
  // is the same direction as +PI and is what the ledger has always returned here; the assertion
  // says which one rather than pretending the sign is free.
  near(Math.abs(derived.defenderBearingRadians), Math.PI);
  near(derived.defenderBearingRadians, -Math.PI);

  // Turning away does not move anyone, and does not disturb the other fighter's facing.
  ground.setDefenderFacing(1.2);
  const owned = ground.report;
  assert.equal(owned.defenderFacingSource, 'owned');
  near(owned.defenderFacingRadians, 1.2);
  assert.equal(owned.attackerFacingSource, 'derived-from-bearing');
  near(owned.defenderPosition.x, derived.defenderPosition.x);
  near(owned.defenderPosition.z, derived.defenderPosition.z);
  // The bearing is a geometric fact and keeps telling the truth while the fighter looks away.
  near(owned.defenderBearingRadians, -Math.PI);

  ground.setDefenderFacing(null);
  assert.equal(ground.report.defenderFacingSource, 'derived-from-bearing');
  near(ground.report.defenderFacingRadians, -Math.PI);
});

test('R20N.1 an owned facing survives the exchange resetting, because it is a stance not ground', () => {
  const ground = createEngagementGround({ startSeparationMeters: 3 });
  ground.setDefenderFacing(-0.4);
  ground.moveDefenderWorld(1, 1);
  ground.reset();
  const after = ground.report;
  near(after.defenderPosition.x, 0, 1e-12);
  near(after.defenderPosition.z, 1.5, 1e-12);
  assert.equal(after.defenderFacingSource, 'owned', 'unlocking is the caller\'s decision, not the reset\'s');
  near(after.defenderFacingRadians, -0.4);
});

test('R20N.1 the locked vocabulary is untouched: on the axis the relative verbs are exactly as before', () => {
  const ground = createEngagementGround({ startSeparationMeters: 2.4 });
  ground.moveDefender(0.3);
  ground.moveAttacker(0.1);
  const report = ground.report;
  // The legacy scalar path: separation is the plain sum, not a hypot of anything.
  near(report.separationMeters, 2.4 + 0.3 + 0.1);
  near(report.lateralGapMeters, 0);
  near(report.defenderPosition.x, 0);
  near(report.attackerPosition.x, 0);
  assert.equal(report.attackerFacingSource, 'derived-from-bearing');
});
