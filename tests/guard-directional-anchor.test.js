import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_DIRECTIONAL_ANCHOR_STAGE,
  GUARD_DIRECTIONAL_COVERAGE_ANCHORS,
  GUARD_DIRECTIONAL_ANCHOR_CALIBRATION,
  assessGuardAnchorCoverage,
  buildGuardDirectionalAnchorThreat,
  getGuardDirectionalAnchor,
  resolveGuardDirectionalAnchorPoint,
} from '../src/combat/guard-directional-anchor.js';
import {
  CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
  effectiveSeparationAtContact,
} from '../src/combat/engagement-spacing.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';

const surface = Object.freeze({
  center: Object.freeze({ x: 0, y: 1, z: 0.5 }),
  normal: Object.freeze({ x: 0, y: 0, z: 1 }),
  radius: 0.26,
  thickness: 0.02,
});

test('R18R.5 every attack direction has a measured coverage anchor', () => {
  assert.equal(GUARD_DIRECTIONAL_ANCHOR_STAGE, 'R18R.5');
  assert.deepEqual(Object.keys(GUARD_DIRECTIONAL_COVERAGE_ANCHORS), ['top', 'right', 'left']);
  for (const anchor of Object.values(GUARD_DIRECTIONAL_COVERAGE_ANCHORS)) {
    for (const axis of ['right', 'up', 'forward']) {
      assert.equal(typeof anchor[axis], 'number', `anchor is missing ${axis}`);
    }
  }
  assert.equal(getGuardDirectionalAnchor('LEFT'), GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left);
  assert.equal(getGuardDirectionalAnchor('nonsense'), null);
});

test('R18R.5 LEFT is the low sweep the high guard has to come down for', () => {
  const { top, right, left } = GUARD_DIRECTIONAL_COVERAGE_ANCHORS;
  assert.ok(left.up < right.up, 'LEFT should arrive lower than RIGHT');
  assert.ok(right.up < top.up, 'RIGHT should arrive lower than TOP');
  assert.ok(Math.abs(left.up) > 3 * Math.abs(top.up), 'TOP arrives roughly level with the guard');
});

test('R18R.5 resolves the anchor in the shield frame, depth included', () => {
  // normal = +z, so right = up x normal = (1, 0, 0) and up stays (0, 1, 0).
  const point = resolveGuardDirectionalAnchorPoint({ direction: 'left', bucklerSurface: surface });
  const anchor = GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left;
  assert.ok(Math.abs(point.x - (surface.center.x + anchor.right)) < 1e-9);
  assert.ok(Math.abs(point.y - (surface.center.y + anchor.up)) < 1e-9);
  assert.ok(Math.abs(point.z - (surface.center.z + anchor.forward)) < 1e-9);
  assert.equal(resolveGuardDirectionalAnchorPoint({ direction: 'left' }), null);
  assert.equal(resolveGuardDirectionalAnchorPoint({ direction: 'x', bucklerSurface: surface }), null);
});

test('R18R.5 the anchor threat carries no contact authority', () => {
  const threat = buildGuardDirectionalAnchorThreat({ direction: 'left', bucklerSurface: surface });
  assert.equal(threat.selection, 'directional-anchor');
  assert.equal(threat.direction, 'left');
  assert.equal(threat.futureSeconds, 0);
  assert.equal(threat.surface, surface);
  assert.match(threat.authority, /no-contact-authority/);
  const anchor = GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left;
  const expected = Math.hypot(anchor.right, anchor.up, anchor.forward);
  assert.ok(Math.abs(threat.radialDistance - expected) < 1e-9);
  assert.equal(buildGuardDirectionalAnchorThreat({ direction: 'left' }), null);
});

test('R18Y.1 every direction must contact inside its own verified band', () => {
  // R18X.2 checked the starting separation against these bands. Attacks carry a step now, so the
  // starting separation is not the one that decides anything -- the guard's success tracks the gap
  // at contact, and each direction closes a different amount of it. Checking the start would now
  // pass or fail for the wrong reason: LEFT's band tops out at 2.05m and the fighters start at
  // 2.4m, yet LEFT contacts at 1.95m and blocks 16/16 there.
  for (const direction of Object.keys(GUARD_DIRECTIONAL_COVERAGE_ANCHORS)) {
    const separationMeters = effectiveSeparationAtContact(
      CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
      ATTACK_ADVANCE_PROFILES[direction].metersByContact,
    );
    const coverage = assessGuardAnchorCoverage({ direction, separationMeters });
    assert.equal(
      coverage.verified,
      true,
      `${direction} contacts at ${separationMeters.toFixed(2)}m, outside its verified band (${coverage.reason})`
        + ' -- move the starting separation, change that direction\'s step, or re-measure the band',
    );
  }
  // Where they were captured is recorded literally, because it is a fact about the past rather
  // than a thing that follows the default around.
  assert.equal(GUARD_DIRECTIONAL_ANCHOR_CALIBRATION.measuredAtMeters, 2.3);
  assert.deepEqual(
    Object.keys(GUARD_DIRECTIONAL_ANCHOR_CALIBRATION.verifiedCoverage).sort(),
    Object.keys(GUARD_DIRECTIONAL_COVERAGE_ANCHORS).sort(),
    'every anchored direction needs a measured coverage band',
  );
});

test('R18Y.1 the step is what put LEFT inside its band, not a wider band', () => {
  // This began as a characterisation test recording that LEFT could not reach the guard where the
  // fight was calibrated. It closed in two moves, and both are worth keeping visible: the
  // arc-aware swept test widened LEFT's band down to 1.50m, and the attack step brought the
  // contact distance into it from above.
  const startMeters = CALIBRATED_ENGAGEMENT_SEPARATION_METERS;
  const leftContact = effectiveSeparationAtContact(startMeters, ATTACK_ADVANCE_PROFILES.left.metersByContact);
  assert.ok(leftContact < startMeters, 'LEFT was authored planted; the step is code-driven');
  assert.equal(assessGuardAnchorCoverage({ direction: 'left', separationMeters: leftContact }).verified, true);

  // Standing still at the same distance, LEFT would still be out of reach. That is the gap the
  // step closes, and it is the reason attacks that do not move cannot be mixed with ones that do.
  const planted = assessGuardAnchorCoverage({ direction: 'left', separationMeters: startMeters });
  assert.equal(planted.verified, false);
  assert.equal(planted.reason, 'beyond-verified-reach');
});

test('R18V.1 reports honestly outside the range that was actually tested', () => {
  // R18X.1 swept down to 1.40m and LEFT now clears the bar from 1.50m, so the closer-than-band
  // case has moved in with it.
  assert.equal(assessGuardAnchorCoverage({ direction: 'left', separationMeters: 1.5 }).verified, true);
  const close = assessGuardAnchorCoverage({ direction: 'left', separationMeters: 1.45 });
  assert.equal(close.verified, false);
  assert.equal(close.reason, 'closer-than-verified-band');
  assert.equal(close.beyondTestedRange, false, '1.45m was swept, it just failed');
  assert.equal(assessGuardAnchorCoverage({ direction: 'left', separationMeters: 1.2 }).beyondTestedRange, true);

  const far = assessGuardAnchorCoverage({ direction: 'top', separationMeters: 4 });
  assert.equal(far.verified, false);
  assert.equal(far.reason, 'beyond-verified-reach');
  assert.equal(far.beyondTestedRange, true);

  for (const bad of [
    { direction: 'nonsense', separationMeters: 2.3 },
    { direction: 'left', separationMeters: 'x' },
    {},
  ]) {
    const result = assessGuardAnchorCoverage(bad);
    assert.equal(result.verified, false, JSON.stringify(bad));
    assert.ok(['unknown-direction', 'unknown-separation'].includes(result.reason));
  }
});

test('R18V.1 does not silently correct the anchor for distance', () => {
  // No drift model has been measured, so the anchor itself must stay the same object at every
  // separation. Reporting that it is out of band is the whole contract.
  const nearThreat = buildGuardDirectionalAnchorThreat({ direction: 'left', bucklerSurface: surface });
  assert.deepEqual(nearThreat.point, resolveGuardDirectionalAnchorPoint({ direction: 'left', bucklerSurface: surface }));
  assert.equal(getGuardDirectionalAnchor('left'), GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left);
});
