import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
  MEASURED_FULL_COVERAGE_BAND_METERS,
  MEASURED_UNDEFENDED_BODY_REACH_METERS,
  effectiveSeparationAtContact,
  ENGAGEMENT_SPACING_STAGE,
  normalizeEngagementSeparation,
  planEngagementStance,
} from '../src/combat/engagement-spacing.js';

test('R18T.1 the default stance is symmetric about the origin and reports its own geometry', () => {
  assert.equal(ENGAGEMENT_SPACING_STAGE, 'R18T.1');
  // R18X.2 moved this from 2.3m. The original 2.3m reproduced the hardcoded lab coordinates that
  // predated this module; it was never a measured distance, and both measurements below now say
  // it was the wrong one.
  assert.equal(CALIBRATED_ENGAGEMENT_SEPARATION_METERS, 2.4);
  const stance = planEngagementStance();
  assert.deepEqual(stance.attacker.position, { x: 0, y: 0, z: -1.2 });
  assert.deepEqual(stance.defender.position, { x: 0, y: 0, z: 1.2 });
  assert.equal(stance.attacker.facingRadians, 0);
  assert.equal(stance.defender.facingRadians, Math.PI);
  assert.equal(stance.calibrated, true);
  assert.equal(stance.offsetFromCalibrationMeters, 0);
});

test('R18T.1 the fighters stay symmetric about the origin at any separation', () => {
  // Symmetry is not cosmetic: every measurement taken so far assumed the midpoint is the origin.
  for (const separation of [1.2, 2.0, 2.3, 3.4]) {
    const stance = planEngagementStance(separation);
    assert.equal(stance.separationMeters, separation);
    assert.ok(Math.abs(stance.attacker.position.z + stance.defender.position.z) < 1e-9);
    assert.ok(Math.abs(
      (stance.defender.position.z - stance.attacker.position.z) - separation,
    ) < 1e-9);
  }
});

test('R18T.1 a stance away from calibration says so, and by how much', () => {
  const far = planEngagementStance(2.7);
  assert.equal(far.calibrated, false);
  assert.ok(Math.abs(far.offsetFromCalibrationMeters - 0.3) < 1e-9);
  const near = planEngagementStance(1.4);
  assert.equal(near.calibrated, false);
  assert.ok(Math.abs(near.offsetFromCalibrationMeters + 1.0) < 1e-9);
});

test('R18T.1 nonsense separations are clamped rather than allowed to place a fighter inside another', () => {
  assert.equal(normalizeEngagementSeparation(0), 0.2);
  assert.equal(normalizeEngagementSeparation(-5), 0.2);
  assert.equal(normalizeEngagementSeparation(1000), 8);
  assert.equal(normalizeEngagementSeparation('nonsense'), CALIBRATED_ENGAGEMENT_SEPARATION_METERS);
  assert.equal(normalizeEngagementSeparation(undefined), CALIBRATED_ENGAGEMENT_SEPARATION_METERS);
});

test('R18T.1 the lab places its fighters from the module and can only move them between exchanges', async () => {
  const scene = await readFile(
    new URL('../src/game/scene.js', import.meta.url),
    'utf8',
  );
  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
    'utf8',
  );
  assert.match(scene, /planEngagementStance\(/);
  assert.doesNotMatch(scene, /position\.set\(0, 0, -?1\.15\)/, 'the coordinates belong to the module now');
  assert.match(scene, /function setEngagementSeparation\(meters\)/);
  // Moving a fighter mid-exchange would move the geometry the swept contact probe is measuring.
  assert.match(entry, /if \(combat\.active \|\| attackRuntime\.active\) return null;/);
  assert.match(entry, /labScene\.setEngagementSeparation\(meters\)/);
});

test('R19D.1 the lab returns to the calibrated stance after boot and after a stance change', async () => {
  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
    'utf8',
  );
  // The ground ledger persists between exchanges by design, which broke two things silently: the
  // boot demo attack banked ~0.5m before the player touched anything, and a runtime stance change
  // moved the scene while the ledger kept its old base. This lock is the invariant nothing else
  // guards -- the unit suite cannot see composed browser state.
  //
  // R19I.1 settled the first half by deletion rather than by compensation: there is no boot demo
  // attack any more, so nothing can spend the player's opening ground before they touch anything.
  // Restoring one would need this assertion changed, which is the point of keeping it.
  assert.doesNotMatch(entry, /startAttack\('right'\);/, 'the lab must not open by attacking on its own');
  const stanceChange = entry.indexOf('labScene.setEngagementSeparation(meters)');
  const laneReset = entry.indexOf('laneController.resetLane()', stanceChange);
  assert.notEqual(stanceChange, -1);
  assert.ok(laneReset > stanceChange, 'a stance change must rebase the ledger or the two describe different worlds');
});

test('R18V.1 replaces the provisional band with the measured one', () => {
  const band = MEASURED_FULL_COVERAGE_BAND_METERS;
  assert.ok(band.minimum < band.maximum, 'a placeholder band collapses to a point; a measured one does not');
  assert.equal(band.limitedBy.maximum, 'left');
  assert.equal(band.limitedBy.minimum, 'right');
  // This asserted the opposite until R18X.2: the band did not contain the calibrated separation,
  // because at 2.3m only two directions of three reached the guard. Both halves moved -- the band
  // widened downward when the swept test started following the blade's arc, and the default moved
  // into it. The default standing inside the measured band is the property worth holding now.
  // R18Y.1: the comparison moved to the contact-time separation, because that is what the band is
  // a fact about. The fighters now start outside it on purpose and close into it during the swing.
  const contact = effectiveSeparationAtContact(CALIBRATED_ENGAGEMENT_SEPARATION_METERS, 0.663);
  assert.ok(contact >= band.minimum);
  assert.ok(contact <= band.maximum);
  assert.ok(CALIBRATED_ENGAGEMENT_SEPARATION_METERS > band.maximum, 'the start is deliberately outside it');
  // Bounds must stay inside what was actually swept; anything else is extrapolation.
  assert.ok(band.minimum >= band.testedRange.minimum);
  assert.ok(band.maximum <= band.testedRange.maximum);
});

test('R18X.1 records where an unopposed attack still reaches the body', () => {
  const reach = MEASURED_UNDEFENDED_BODY_REACH_METERS;
  const coverage = MEASURED_FULL_COVERAGE_BAND_METERS;
  for (const direction of ['top', 'right', 'left']) {
    assert.ok(reach[direction] >= reach.testedRange.minimum, direction);
    assert.ok(reach[direction] <= reach.testedRange.maximum, direction);
  }
  // LEFT is the outlier the whole guard stack exists for: it lands from far enough out that the
  // resting shield never covers it, where TOP and RIGHT finish short.
  assert.ok(reach.left > reach.top && reach.left > reach.right);

  // The two measurements meet at a point rather than over a band, and saying so is the point of
  // keeping them side by side: the guard becomes fully reliable exactly where TOP and RIGHT stop
  // being able to land at all.
  assert.equal(coverage.minimum, reach.top);
  assert.equal(coverage.minimum, reach.right);
  // Past that, only LEFT still threatens anything, and it does so right up to the far end of the
  // guard's own band.
  assert.equal(reach.left, coverage.maximum);
});
