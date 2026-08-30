import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINIMUM_SUPPORTED_ASPECT_RATIO,
  describeViewport,
  isSupportedViewport,
} from '../src/combat/supported-viewport.js';
import { fitLockedProfileToAspect, horizontalHalfFovRadians } from '../src/combat/third-person-camera.js';
import { lockOnAcquireHalfAngleRadians } from '../src/combat/lock-on.js';

// R20R.1 - landscape only, as a contract with a number behind it. What these lock is not the taste
// judgement (phones are held sideways for action games) but the two mechanical claims that made it
// the right call: inside the contract the lock cone never lies, and the camera never has to give up
// its framing to fit.

const DEVICES = Object.freeze({
  '21:9': 21 / 9,
  'phone landscape 19.5:9': 19.5 / 9,
  '16:9': 16 / 9,
  '3:2': 1.5,
  'iPad landscape 4:3': 4 / 3,
  '5:4': 1.25,
});
const REFUSED = Object.freeze({
  square: 1,
  'phone portrait 9:16': 9 / 16,
  'phone portrait 9:19.5': 9 / 19.5,
});

test('R20R.1 every landscape device is in, every portrait one is out, and the remedy differs', () => {
  for (const [label, aspectRatio] of Object.entries(DEVICES)) {
    assert.equal(isSupportedViewport(aspectRatio), true, `${label} must be supported`);
    assert.equal(describeViewport(aspectRatio).remedy, null);
  }
  for (const [label, aspectRatio] of Object.entries(REFUSED)) {
    assert.equal(isSupportedViewport(aspectRatio), false, `${label} must be refused`);
  }
  // A phone gets rotated; a browser window gets widened. Different actions, different messages.
  assert.equal(describeViewport(9 / 16).remedy, 'rotate-to-landscape');
  assert.equal(describeViewport(9 / 16).orientation, 'portrait');
  assert.equal(describeViewport(1.1).remedy, 'widen-the-window');
  assert.equal(describeViewport(1.1).orientation, 'landscape');
  assert.equal(describeViewport(1).orientation, 'square');
  // Nonsense is refused rather than let through.
  assert.equal(isSupportedViewport(null), false);
  assert.equal(isSupportedViewport(Number.NaN), false);
});

test('R20R.1 a blocked viewport takes the hands, never the world', () => {
  // A screen a player can turn sideways to freeze the fight with is a cheat.
  const blocked = describeViewport(9 / 19.5);
  assert.equal(blocked.blocksInput, true);
  assert.equal(blocked.blocksSimulation, false);
  const playing = describeViewport(16 / 9);
  assert.equal(playing.blocksInput, false);
  assert.equal(playing.blocksSimulation, false);
});

test('R20R.1 inside the contract the lock cone is always strictly on screen', () => {
  // The reason the cone's floor could be deleted: there is no supported viewport where the derived
  // cone reaches past what is rendered.
  for (let aspectRatio = MINIMUM_SUPPORTED_ASPECT_RATIO; aspectRatio <= 2.4; aspectRatio += 0.05) {
    for (const fovDegrees of [50, 59, 74]) {
      assert.ok(lockOnAcquireHalfAngleRadians({ fovDegrees, aspectRatio })
        < horizontalHalfFovRadians(fovDegrees, aspectRatio));
    }
  }
});

test('R20R.1 inside the contract the camera keeps its framing without spending the look point', () => {
  // The safe-frame fit has a secondary lever for windows the shoulder alone cannot save. It exists
  // as a safety net, and this asserts it is never needed in a viewport the game supports - the
  // over-the-shoulder offset absorbs the whole cost down to the contract's floor and well past it.
  const halfBody = { fovDegrees: 74, angleDegrees: 19, lookHeightMeters: 0.69, panX: 0.01, azimuthDegrees: 30, distanceMeters: 2.95, panZ: 1.67 };
  const profile = { locked: { distanceKeys: [1.4, 2.4, 4].map((separationMeters) => ({ separationMeters, ...halfBody })) } };
  for (let aspectRatio = MINIMUM_SUPPORTED_ASPECT_RATIO; aspectRatio <= 2.4; aspectRatio += 0.05) {
    const fitted = fitLockedProfileToAspect(profile, aspectRatio);
    assert.equal(fitted.satisfied, true, `must fit at ${aspectRatio.toFixed(2)}:1`);
    assert.equal(fitted.panZScale, 1, `the look point must survive at ${aspectRatio.toFixed(2)}:1`);
  }
  // Outside it, the net is there and does its job - which is why it stays in the solver.
  const portrait = fitLockedProfileToAspect(profile, 9 / 19.5);
  assert.ok(portrait.panZScale < 1);
  assert.equal(portrait.satisfied, true);
});
