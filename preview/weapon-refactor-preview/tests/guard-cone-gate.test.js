import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GUARD_CONE_GATE_STAGE, planGuardConeGate } from '../src/combat/guard-cone-gate.js';
import { MEASURED_GUARD_RELIABLE_CONE_DEGREES } from '../src/combat/guard-frontal-cone.js';

const rad = (degrees) => (degrees * Math.PI) / 180;

test('R19Z.1 inside each direction\'s measured band the gate changes nothing', () => {
  assert.equal(GUARD_CONE_GATE_STAGE, 'R19Z.1');
  // Square, and each direction's own measured edges, all engaged: TOP still answers at -45,
  // RIGHT tolerates a full -90, everyone survives +90 toward the shield.
  for (const [direction, errorDegrees] of [
    ['top', 0], ['top', -45], ['top', 150],
    ['right', -90], ['right', 120],
    ['left', 0], ['left', 90], ['left', -10], ['left', -20],
  ]) {
    const gate = planGuardConeGate({ direction, facingErrorRadians: rad(errorDegrees) });
    assert.equal(gate.engaged, true, `${direction} at ${errorDegrees} stays engaged`);
    assert.equal(gate.reason, 'facing-error-inside-the-measured-cone');
    assert.equal(gate.reliableCone, MEASURED_GUARD_RELIABLE_CONE_DEGREES[direction]);
  }
});

test('R19Z.1 outside the band coverage stands down, at each direction\'s own edge', () => {
  // The per-direction choice is the point: LEFT is out at -25 while TOP holds to -45 and
  // RIGHT to -90. And LEFT's edge is -20, not zero: R20C.1 sampled the gap R19X skipped,
  // after the zero edge was caught standing the guard down on -0.005 degrees of chase noise.
  for (const [direction, errorDegrees] of [
    ['top', -60], ['top', -110], ['top', 180],
    ['right', -100], ['right', 180],
    ['left', -25], ['left', -45],
  ]) {
    const gate = planGuardConeGate({ direction, facingErrorRadians: rad(errorDegrees) });
    assert.equal(gate.engaged, false, `${direction} at ${errorDegrees} stands down`);
    assert.equal(gate.reason, 'facing-error-outside-the-measured-cone-coverage-stands-down');
    assert.ok(Math.abs(gate.facingErrorDegrees - errorDegrees) < 1e-9);
  }
});

test('R19Z.1 doubt resolves to guarding, because taking a defence away needs a measurement', () => {
  const unmeasured = planGuardConeGate({ direction: 'thrust', facingErrorRadians: rad(180) });
  assert.equal(unmeasured.engaged, true);
  assert.equal(unmeasured.reason, 'unmeasured-direction-doubt-resolves-to-guarding');
  const unreadable = planGuardConeGate({ direction: 'top', facingErrorRadians: NaN });
  assert.equal(unreadable.engaged, true);
  assert.equal(unreadable.reason, 'unreadable-facing-error-doubt-resolves-to-guarding');
  assert.equal(planGuardConeGate({}).engaged, true);
});

test('R19Z.1 the gate is decided at commitment and stands the whole response down', async () => {
  const controller = await readFile(
    new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  // Per-exchange, keyed like the close-range posture - never re-decided mid-swing.
  assert.match(controller, /coneGate\?\.sequence !== snapshot\.sequence/);
  assert.match(controller, /facingErrorRadians: defenderFacingErrorRadians/);
  assert.match(controller, /exchangeState\.latestConeGate = coneGate\.plan/);
  // Folded into the one commitment flag, and into the guard turn's - the sweep measured turn
  // and coverage running together, so they stand down together.
  // R23T.1: the sector gate sits between the cone and the dodge in the same commitment.
  const engagedFlag = controller.indexOf('&& coneGate.plan.engaged\n      && sectorGate.covers\n      && !dodgeGuardDown\n      && closeRangePosture.plan.posture');
  assert.ok(engagedFlag >= 0, 'coverage commitment carries the cone gate and the dodge cost');
  assert.match(controller, /relevance\.relevant && coneGate\.plan\.engaged && !dodgeGuardDown,\n\s+posture:/);
});

test('R19Z.1 the facing error is the base facing against the bearing, guard turn excluded', async () => {
  // The name was always the spec; the assertion used to check the report's FACING, which was the
  // same number back when facing was only ever derived from the gap. R20V.1 separated them - a
  // fighter can own their facing now - and then the old comparison reported zero exactly when the
  // error mattered. Behavioural, because a source match is the check that missed it.
  const { createShieldParryLaneController } = await import('../src/game/lane-controller.js');
  const build = () => createShieldParryLaneController({
    labScene: {
      engagementStance: { separationMeters: 2.4 },
      setLanePositions: () => {}, setDefenderYawOffset: () => {}, defender: null, camera: null,
    },
    walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
    services: { captureRigPose: () => null, applyRigPose: () => {} },
  });
  const step = 1 / 60;

  // Derived facing: the body chases the opponent, so the error stays near zero however far the
  // fight travels. This is the case the golden grid holds, unchanged.
  const derived = build();
  derived.setDefenderLateralIntent(1);
  for (let i = 0; i < 60; i += 1) derived.walk(step, null);
  assert.ok(Math.abs(derived.defenderFacingErrorRadians) < 0.02,
    `derived facing stays square, got ${derived.defenderFacingErrorRadians}`);

  // Owned facing: turned away, the error has to say so - the cone gate reads this to decide
  // whether committing the whole coverage response is worth anything.
  const owned = build();
  owned.setDefenderFacing(Math.PI / 2);
  for (let i = 0; i < 120; i += 1) owned.walk(step, null);
  const turnedAway = Math.abs(owned.defenderFacingErrorRadians) * 180 / Math.PI;
  assert.ok(turnedAway > 60, `a fighter facing across the fight must read as turned away, got ${turnedAway.toFixed(1)} degrees`);

  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /defenderFacingErrorRadians: laneController\.defenderFacingErrorRadians/);
});
