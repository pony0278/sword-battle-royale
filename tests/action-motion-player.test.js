import test from 'node:test';
import assert from 'node:assert/strict';

import { createAnimationClip } from '../src/animation/animation-clip.js';
import { ActionMotionPlayer } from '../src/animation/action-motion-player.js';
import {
  animationTimeAtFrame,
  createFittedAnimationBinding,
  normalizeAnimationBinding,
} from '../src/animation/animation-binding.js';
import { createActionDefinition } from '../src/combat/action-definition.js';

function createFixture(binding) {
  const clip = createAnimationClip({
    id: 'slash',
    fps: 30,
    timeline: [
      { name: 'start', frame: 0 },
      { name: 'end', frame: 30 },
    ],
    poses: {
      start: { root_y: 0 },
      end: { root_y: 30 },
    },
  });
  const action = createActionDefinition({
    id: 'slash',
    clipId: clip.id,
    animationBinding: binding,
  }, clip.durationFrames);
  return { clip, action };
}

test('animation bindings normalize legacy and fitted action data', () => {
  assert.deepEqual(normalizeAnimationBinding({}, 'slash'), {
    source: 'authored',
    clipId: 'slash',
    speed: 1,
    startOffsetSeconds: 0,
    inPlace: true,
    loop: false,
    blendInSeconds: 0.08,
    blendOutSeconds: 0.12,
  });
  const fitted = createFittedAnimationBinding({
    clipId: 'Melee_1H_Attack_Chop',
    animationDurationSeconds: 1.5,
    durationFrames: 30,
    fps: 30,
  });
  assert.equal(fitted.source, 'kaykit');
  assert.equal(fitted.speed, 1.5);
  assert.equal(animationTimeAtFrame(fitted, 15, 30, 1.5), 0.75);
  const ual2 = createFittedAnimationBinding({
    source: 'ual2',
    clipId: 'UAL2/Sword_Regular_A',
    animationDurationSeconds: 0.433,
    durationFrames: 30,
    fps: 30,
  });
  assert.equal(ual2.source, 'ual2');
  assert.equal(normalizeAnimationBinding(ual2).clipId, 'UAL2/Sword_Regular_A');
  const ual1 = createFittedAnimationBinding({
    source: 'ual1', clipId: 'UAL1/Sword_Attack',
    animationDurationSeconds: 1.533, durationFrames: 30, fps: 30,
  });
  assert.equal(ual1.source, 'ual1');
  assert.equal(normalizeAnimationBinding(ual1).clipId, 'UAL1/Sword_Attack');
});

test('ActionMotionPlayer applies authored poses through the shared action clock', () => {
  const { clip, action } = createFixture();
  const applied = [];
  const player = new ActionMotionPlayer({ adapter: { applyPose: (pose) => applied.push(pose) } });
  player.setProject(clip, action);
  const result = player.apply(player.seek(15));
  assert.equal(result.frame, 15);
  assert.equal(result.motion.appliedSource, 'authored');
  assert.equal(applied.at(-1).root_y, result.pose.root_y);
});

test('ActionMotionPlayer deterministically samples a bound KayKit clip', () => {
  const { clip, action } = createFixture({
    source: 'kaykit',
    clipId: 'Melee_1H_Attack_Chop',
    speed: 2,
    startOffsetSeconds: 0.1,
    inPlace: true,
  });
  const samples = [];
  const player = new ActionMotionPlayer({
    adapter: {
      hasAnimation: (name) => name === 'Melee_1H_Attack_Chop',
      getAnimationDuration: () => 2,
      sampleAnimation: (...args) => samples.push(args),
    },
  });
  player.setProject(clip, action);
  const result = player.apply(player.seek(15));
  assert.equal(result.motion.timeSeconds, 1.1);
  assert.equal(result.motion.appliedSource, 'kaykit');
  assert.deepEqual(samples[0].slice(0, 2), ['Melee_1H_Attack_Chop', 1.1]);
});

test('ActionMotionPlayer samples a retargeted UAL2 clip through the external clock', () => {
  const { clip, action } = createFixture({
    source: 'ual2',
    clipId: 'UAL2/Sword_Regular_A',
    speed: 1,
  });
  const samples = [];
  const player = new ActionMotionPlayer({
    adapter: {
      hasAnimation: () => true,
      getAnimationDuration: () => 0.433,
      sampleAnimation: (...args) => samples.push(args),
    },
  });
  player.setProject(clip, action);
  const result = player.apply(player.seek(6));
  assert.equal(result.motion.appliedSource, 'ual2');
  assert.deepEqual(samples[0].slice(0, 2), ['UAL2/Sword_Regular_A', 0.2]);
});

test('missing external animation remains a visible pending binding with pose fallback', () => {
  const { clip, action } = createFixture({ source: 'kaykit', clipId: 'NotLoaded' });
  const applied = [];
  const player = new ActionMotionPlayer({
    adapter: {
      hasAnimation: () => false,
      applyPose: (pose) => applied.push(pose),
    },
  });
  player.setProject(clip, action);
  const result = player.apply(player.seek(10));
  assert.equal(result.motion.pending, true);
  assert.equal(result.motion.appliedSource, 'authored');
  assert.equal(applied.length, 1);
});

test('looping binding wraps source time while non-looping binding clamps it', () => {
  const looped = { source: 'kaykit', clipId: 'Idle_A', loop: true, speed: 1 };
  const clamped = { ...looped, loop: false };
  assert.equal(animationTimeAtFrame(looped, 75, 30, 2), 0.5);
  assert.equal(animationTimeAtFrame(clamped, 75, 30, 2), 2);
});
