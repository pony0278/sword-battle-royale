import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCK_ON_ACQUIRE_RANGE_METERS,
  LOCK_ON_BREAK_RANGE_METERS,
  LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS,
  lockOnAcquireHalfAngleRadians,
  createLockOnRuntime,
  selectLockOnCandidate,
} from '../src/combat/lock-on.js';
import { horizontalHalfFovRadians, THIRD_PERSON_CAMERA_PROFILE } from '../src/combat/third-person-camera.js';
import { MINIMUM_SUPPORTED_ASPECT_RATIO, describeViewport } from '../src/combat/supported-viewport.js';
import { MEASURED_SWING_FORWARD_REACH_METERS, SWING_RELEVANCE_MARGIN_METERS } from '../src/combat/swing-threat-relevance.js';

const at = (id, x, z) => ({ id, position: { x, z } });
const self = { x: 0, z: 0 };

test('R20P.1 the acquire range clears the furthest measured threat, and breaking is not the same number', () => {
  // The ranges answer to the reach measurements rather than taste: you are locked before anything
  // can touch you, and you leave a fight on purpose.
  const furthestThreat = Math.max(...Object.values(MEASURED_SWING_FORWARD_REACH_METERS))
    + SWING_RELEVANCE_MARGIN_METERS;
  assert.ok(LOCK_ON_ACQUIRE_RANGE_METERS > furthestThreat, `${LOCK_ON_ACQUIRE_RANGE_METERS} must clear ${furthestThreat}`);
  assert.ok(LOCK_ON_BREAK_RANGE_METERS > LOCK_ON_ACQUIRE_RANGE_METERS, 'hysteresis, or the lock flickers at the boundary');
  assert.ok(LOCK_ON_BREAK_RANGE_METERS - LOCK_ON_ACQUIRE_RANGE_METERS >= 1, 'and enough of it to be a decision');
});

test('R20P.1 distance filters, the view centre chooses', () => {
  // A distant figure dead centre must not outrank the one actually in swinging distance.
  const far = at('far', 0, 5);
  const near = at('near', 0.8, 1.5);   // 1.7m out, ~28 degrees off centre: inside the derived cone
  const selection = selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [far, near] });
  assert.equal(selection.accepted, true);
  assert.equal(selection.targetId, 'near', 'the far one is outside the threat circle and never competes');

  // Among those close enough, the camera decides. Both are inside the frontal cone and in range;
  // the one nearer the centre is the FURTHER of the two, so this can only be the angle choosing.
  const offCentre = at('off', Math.sin(0.5) * 1.5, Math.cos(0.5) * 1.5);   // ~29 degrees, 1.5m
  const onCentre = at('on', Math.sin(0.12) * 2.5, Math.cos(0.12) * 2.5);   // ~7 degrees, 2.5m
  const byCentre = selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [offCentre, onCentre] });
  assert.equal(byCentre.targetId, 'on');
  const offAlone = selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [offCentre] });
  assert.equal(offAlone.accepted, true, 'the loser must be a real candidate, or this proves nothing');
  assert.ok(byCentre.distanceMeters > offAlone.distanceMeters, 'the chosen one is further away, and still chosen');
});

test('R20P.1 refuses rather than locking onto nothing, and says which kind of nothing', () => {
  assert.deepEqual(
    ['nobody-within-lock-range', false],
    [selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [] }).reason, false],
  );
  const tooFar = selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [at('a', 0, 6)] });
  assert.equal(tooFar.accepted, false);
  assert.equal(tooFar.reason, 'nobody-within-lock-range');
  // In range but behind you: a different refusal, because the fix is to turn rather than approach.
  const behind = selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [at('b', 0, -2)] });
  assert.equal(behind.accepted, false);
  assert.equal(behind.reason, 'nobody-inside-the-frontal-view');
});

test('R20P.1 the frontal cone is narrower than the screen, and its edge is inclusive', () => {
  const justInside = LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS - 1e-6;
  const justOutside = LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS + 1e-6;
  const place = (angle) => at('t', Math.sin(angle) * 2, Math.cos(angle) * 2);
  assert.equal(selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [place(justInside)] }).accepted, true);
  assert.equal(selectLockOnCandidate({ self, viewForwardRadians: 0, candidates: [place(justOutside)] }).accepted, false);
  // The cone follows the camera, not the world.
  assert.equal(selectLockOnCandidate({
    self, viewForwardRadians: Math.PI, candidates: [at('behind', 0, -2)],
  }).accepted, true);
});

test('R20P.1 locking is manual: nothing acquires without a request, and the toggle only ever releases', () => {
  const lock = createLockOnRuntime();
  const world = { self, viewForwardRadians: 0, candidates: [at('a', 0, 2)] };
  assert.equal(lock.update(world).state, 'free', 'walking into range must not lock anybody');
  assert.equal(lock.requestToggle(world).targetId, 'a');
  // A second press releases rather than switching - a toggle that sometimes re-aims is untrustworthy.
  const other = { self, viewForwardRadians: 0, candidates: [at('a', 0, 2), at('b', 0.5, 1.5)] };
  assert.equal(lock.requestToggle(other).state, 'free');
  assert.equal(lock.report.reason, 'released-by-request');
});

test('R20P.1 a lock is kept through anything but distance and disappearance', () => {
  const lock = createLockOnRuntime();
  lock.requestToggle({ self, viewForwardRadians: 0, candidates: [at('a', 0, 2)] });
  // Behind you, and still locked: the camera is following them now.
  assert.equal(lock.update({ self, viewForwardRadians: 0, candidates: [at('a', 0, -2)] }).locked, true);
  // Out past the acquire range but inside the break range: still locked, which is the hysteresis.
  assert.equal(lock.update({ self, viewForwardRadians: 0, candidates: [at('a', 0, 4.5)] }).locked, true);
  assert.equal(lock.update({ self, viewForwardRadians: 0, candidates: [at('a', 0, 5.5)] }).locked, false);
  assert.equal(lock.report.reason, 'broke-by-distance');

  const gone = createLockOnRuntime();
  gone.requestToggle({ self, viewForwardRadians: 0, candidates: [at('a', 0, 2)] });
  assert.equal(gone.update({ self, viewForwardRadians: 0, candidates: [] }).locked, false);
  assert.equal(gone.report.reason, 'target-gone');
});

test('R20P.1 degenerate geometry does not drop a lock or refuse a request', () => {
  // Standing exactly on top of someone has no bearing to measure; they are certainly in front.
  const overlapping = selectLockOnCandidate({ self, viewForwardRadians: 1.1, candidates: [at('a', 0, 0)] });
  assert.equal(overlapping.accepted, true);
  assert.equal(overlapping.angleOffsetRadians, null);
  const lock = createLockOnRuntime();
  lock.requestToggle({ self, viewForwardRadians: 0, candidates: [at('a', 0, 2)] });
  assert.equal(lock.update({ self, viewForwardRadians: 0, candidates: [at('a', 0, 0)] }).locked, true);
  // Candidates without an identity are not targets.
  assert.equal(selectLockOnCandidate({
    self, viewForwardRadians: 0, candidates: [{ position: { x: 0, z: 1 } }],
  }).accepted, false);
});

test('R20Q.1 the frontal cone is derived from what is rendered, not from a constant', () => {
  // Same camera, two viewports: the cone must move with the aspect, because the amount of world on
  // screen does. A constant would be a promise the renderer does not keep.
  const wide = lockOnAcquireHalfAngleRadians({ fovDegrees: 50, aspectRatio: 16 / 9 });
  const narrow = lockOnAcquireHalfAngleRadians({ fovDegrees: 50, aspectRatio: 4 / 3 });
  assert.ok(wide > narrow, `${wide} should exceed ${narrow}`);
  // And it stays inside the frame: aiming at the very edge of the screen is not aiming.
  assert.ok(wide < horizontalHalfFovRadians(50, 16 / 9));
  assert.ok(narrow < horizontalHalfFovRadians(50, 4 / 3));
  // A wider lens sees more, so it may lock wider.
  assert.ok(lockOnAcquireHalfAngleRadians({ fovDegrees: 70, aspectRatio: 16 / 9 }) > wide);
  // The default is the desktop view of the shared profile, not a number typed in here.
  assert.equal(
    LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS,
    lockOnAcquireHalfAngleRadians({
      fovDegrees: THIRD_PERSON_CAMERA_PROFILE.locked.distanceKeys[0].fovDegrees,
      aspectRatio: 16 / 9,
    }),
  );
});

test('R20R.1 the cone never reaches past the screen, in any viewport the game supports', () => {
  // This is the invariant the orientation contract bought. It used to have an exception: a portrait
  // phone renders about +-14.6 degrees, too narrow to aim with, so the cone was floored at 25 and a
  // player could lock somebody off screen. Landscape-only deleted the case, so the rule holds with
  // no exception - which is worth more than the edge case it used to protect.
  for (let aspectRatio = MINIMUM_SUPPORTED_ASPECT_RATIO; aspectRatio <= 2.4; aspectRatio += 0.05) {
    for (const fovDegrees of [50, 59, 74]) {
      const cone = lockOnAcquireHalfAngleRadians({ fovDegrees, aspectRatio });
      const screen = horizontalHalfFovRadians(fovDegrees, aspectRatio);
      assert.ok(cone < screen, `cone must stay inside the frame at ${aspectRatio.toFixed(2)}:1, fov ${fovDegrees}`);
      assert.ok(cone > 0);
    }
  }
  // A window narrower than the contract is not this rule's problem: the cone stays honest and gets
  // small, and the contract is what stops play.
  const portrait = { fovDegrees: 59, aspectRatio: 9 / 19.5 };
  assert.ok(lockOnAcquireHalfAngleRadians(portrait) < horizontalHalfFovRadians(portrait.fovDegrees, portrait.aspectRatio) + 1e-9);
  assert.equal(describeViewport(portrait.aspectRatio).supported, false);
  // Garbage describes no viewport, so it gets the desktop default rather than a NaN cone.
  assert.equal(lockOnAcquireHalfAngleRadians({ fovDegrees: 'wide', aspectRatio: null }), LOCK_ON_ACQUIRE_HALF_ANGLE_RADIANS);
});

test('R20Q.1 selection reads this frame viewport, and an explicit cone still wins', () => {
  // 30 degrees off centre: inside the desktop cone, outside the 4:3 one.
  const candidates = [at('t', Math.sin(0.52) * 2, Math.cos(0.52) * 2)];
  const world = { self, viewForwardRadians: 0, candidates };
  assert.equal(selectLockOnCandidate(world).accepted, true);
  assert.equal(selectLockOnCandidate({ ...world, view: { fovDegrees: 50, aspectRatio: 4 / 3 } }).accepted, false);
  // A caller who states the cone outright is obeyed - that is how the camera lab sweeps it.
  assert.equal(selectLockOnCandidate({
    ...world, view: { fovDegrees: 50, aspectRatio: 4 / 3 }, profile: { acquireHalfAngleRadians: 1 },
  }).accepted, true);
  // The runtime passes the viewport through rather than swallowing it.
  const lock = createLockOnRuntime();
  assert.equal(lock.requestToggle({ ...world, view: { fovDegrees: 50, aspectRatio: 4 / 3 } }).locked, false);
  assert.equal(lock.requestToggle(world).locked, true);
});
