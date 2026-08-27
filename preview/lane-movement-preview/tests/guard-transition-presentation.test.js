import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGSWORD_GUARD_TRANSITION_PROFILES,
  getGuardTransitionProfile,
  sampleGuardPresentationWeights,
  sampleGuardTransitionProfile,
} from '../src/combat/guard-transition-presentation.js';
import {
  LONGSWORD_GUARD_AUTHORING_STATE,
  LONGSWORD_GUARD_BASE,
} from '../src/combat/longsword-guard-metadata.js';
import {
  quaternionAngleDegrees,
  scaleQuaternionOffset,
} from '../src/combat/longsword-guard-correction.js';

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ~= ${expected}`);
}

test('G3.2 transition profiles reuse the canonical Skyrim Guard Hold', () => {
  for (const profile of Object.values(LONGSWORD_GUARD_TRANSITION_PROFILES)) {
    assert.equal(profile.clipId, LONGSWORD_GUARD_BASE.clipId);
    assert.equal(profile.correctionLayerId, LONGSWORD_GUARD_BASE.correctionLayerId);
    assert.equal(profile.correctionAuthoredStage, LONGSWORD_GUARD_AUTHORING_STATE.authoredStage);
    assert.equal(profile.inPlace, true);
    assert.equal(profile.loop, true);
  }
});

test('G3.2 enter reaches canonical Guard monotonically in 180ms', () => {
  const profile = getGuardTransitionProfile('guard_enter');
  assert.equal(profile.durationMs, 180);
  const samples = [0, 45, 90, 135, 180].map((ms) => sampleGuardTransitionProfile('guard_enter', ms));
  approx(samples[0].weights.holdWeight, 0);
  approx(samples[0].weights.correctionWeight, 0);
  approx(samples.at(-1).weights.holdWeight, 1);
  approx(samples.at(-1).weights.correctionWeight, 1);
  assert.equal(samples.at(-1).complete, true);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index].weights.holdWeight >= samples[index - 1].weights.holdWeight);
    assert.ok(samples[index].weights.correctionWeight >= samples[index - 1].weights.correctionWeight);
  }
});

test('G3.2 exit releases canonical Guard monotonically in 160ms', () => {
  const profile = getGuardTransitionProfile('guard_exit');
  assert.equal(profile.durationMs, 160);
  const samples = [0, 40, 80, 120, 160].map((ms) => sampleGuardTransitionProfile('guard_exit', ms));
  approx(samples[0].weights.holdWeight, 1);
  approx(samples[0].weights.correctionWeight, 1);
  approx(samples.at(-1).weights.holdWeight, 0);
  approx(samples.at(-1).weights.correctionWeight, 0);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index].weights.holdWeight <= samples[index - 1].weights.holdWeight);
    assert.ok(samples[index].weights.correctionWeight <= samples[index - 1].weights.correctionWeight);
  }
});

test('G3.2 recover preserves Hold and fades only future reaction overlay', () => {
  const start = sampleGuardTransitionProfile('guard_recover', 0);
  const end = sampleGuardTransitionProfile('guard_recover', 140);
  approx(start.weights.holdWeight, 1);
  approx(start.weights.correctionWeight, 1);
  approx(start.weights.reactionOverlayWeight, 1);
  approx(end.weights.holdWeight, 1);
  approx(end.weights.correctionWeight, 1);
  approx(end.weights.reactionOverlayWeight, 0);
  assert.equal(end.completionEvent, 'recover_complete');
});

test('G3.2 stable presentation weights preserve Hold and reaction contracts', () => {
  assert.deepEqual(sampleGuardPresentationWeights('neutral'), {
    holdWeight: 0, correctionWeight: 0, reactionOverlayWeight: 0,
  });
  assert.deepEqual(sampleGuardPresentationWeights('guard_hold'), {
    holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 0,
  });
  assert.deepEqual(sampleGuardPresentationWeights('guard_parry'), {
    holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 1,
  });
});

test('G3.2 weighted quaternion correction scales angle instead of Euler components', () => {
  const source = LONGSWORD_GUARD_AUTHORING_STATE.offsets['wrist.r'];
  const fullAngle = quaternionAngleDegrees(source);
  const half = scaleQuaternionOffset(source, 0.5);
  const halfAngle = quaternionAngleDegrees(half);
  approx(halfAngle, fullAngle * 0.5, 1e-8);
  assert.deepEqual(scaleQuaternionOffset(source, 0), [0, 0, 0, 1]);
  const full = scaleQuaternionOffset(source, 1);
  for (let index = 0; index < 4; index += 1) approx(full[index], source[index], 1e-12);
});
