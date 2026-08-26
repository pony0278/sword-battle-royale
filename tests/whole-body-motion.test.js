import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdvancingVerticalChopTemplate } from '../src/animation/action-templates.js';
import {
  createAdvancingVerticalChopGuide,
  normalizeMotionGuide,
} from '../src/animation/motion-guide-schema.js';
import {
  advancingVerticalChopFrames,
  bakeAdvancingVerticalChopClip,
} from '../src/animation/whole-body-motion-solver.js';

test('whole-body motion guide normalizes timing and semantic controls', () => {
  const guide = normalizeMotionGuide({
    leadFoot: 'R',
    stepDistance: 5,
    plantFrame: 30,
    impactFrame: 12,
    durationFrames: 28,
    coupling: -1,
    windupHeight: 9,
    windupPullback: 5,
    windupLoad: -1,
    windupTarget: false,
    footLock: false,
    twoHandGrip: false,
    secondaryGripWeight: 5,
  });
  assert.equal(guide.version, 3);
  assert.equal(guide.leadFoot, 'R');
  assert.equal(guide.stepDistance, 1.2);
  assert.equal(guide.impactFrame, 12);
  assert.equal(guide.plantFrame, 11);
  assert.equal(guide.coupling, 0);
  assert.equal(guide.windupHeight, 2);
  assert.equal(guide.windupPullback, 0.5);
  assert.equal(guide.windupLoad, 0);
  assert.equal(guide.windupTarget, false);
  assert.equal(guide.footLock, false);
  assert.equal(guide.twoHandGrip, false);
  assert.equal(guide.secondaryGripWeight, 1);
});

test('windup target height and pullback create a readable whole-body load', () => {
  const neutral = bakeAdvancingVerticalChopClip({
    coupling: 1,
    windupHeight: 0.95,
    windupPullback: 0,
    windupLoad: 0,
  });
  const loaded = bakeAdvancingVerticalChopClip({
    coupling: 1,
    windupHeight: 2.2,
    windupPullback: 0.6,
    windupLoad: 1,
  });
  assert.ok(loaded.poses.windup.aR_sx < neutral.poses.windup.aR_sx, 'higher target should raise the sword arm');
  assert.ok(loaded.poses.windup.root_pz < neutral.poses.windup.root_pz, 'pullback should shift the windup backward');
  assert.ok(loaded.poses.windup.spine_x < neutral.poses.windup.spine_x, 'body load should lean the spine backward');
  assert.ok(loaded.poses.windup.squat > neutral.poses.windup.squat, 'body load should deepen the anticipation');
  assert.ok(Math.abs(neutral.poses.windup.root_pz) < 1e-9, 'zero body load should not shift the root backward');
  assert.equal(loaded.poses.plant.root_pz, neutral.poses.plant.root_pz, 'windup staging should not move the planted strike');
});

test('advancing vertical chop coordinates hand, head, torso and feet', () => {
  const guide = createAdvancingVerticalChopGuide();
  const clip = bakeAdvancingVerticalChopClip(guide);
  const frame = advancingVerticalChopFrames(guide);
  assert.deepEqual(clip.timeline.map((key) => key.name), [
    'ready', 'windup', 'commit', 'plant', 'impact', 'follow_through', 'recover',
  ]);
  assert.equal(clip.timeline.find((key) => key.name === 'plant').frame, frame.plant);
  assert.equal(clip.timeline.find((key) => key.impact).frame, frame.impact);
  assert.equal(clip.poses.windup.lL_contact, 0);
  assert.equal(clip.poses.windup.lR_contact, 1);
  assert.equal(clip.poses.plant.lL_contact, 1);
  assert.equal(clip.poses.impact.root_pz, guide.stepDistance);
  assert.notEqual(clip.poses.windup.aR_sx, clip.poses.impact.aR_sx);
  assert.notEqual(clip.poses.windup.head_x, clip.poses.impact.head_x);
  assert.notEqual(clip.poses.windup.spine_x, clip.poses.impact.spine_x);
  assert.equal(clip.metadata.motionGuide.preset, 'advancing_vertical_chop');
});

test('foot lock keeps the lead-foot chain stable from plant through follow-through', () => {
  const guide = createAdvancingVerticalChopGuide({ leadFoot: 'L', stepDistance: 0.72, footLock: true });
  const clip = bakeAdvancingVerticalChopClip(guide);
  const lockedKeys = ['root_pz', 'root_x', 'squat', 'pelvis_y', 'lL_hx', 'lL_hz', 'lL_kx', 'lL_ax'];
  lockedKeys.forEach((key) => {
    assert.equal(clip.poses.impact[key], clip.poses.plant[key], `${key} should remain planted at impact`);
    assert.equal(clip.poses.follow_through[key], clip.poses.plant[key], `${key} should remain planted through follow-through`);
  });
  assert.equal(clip.poses.plant.root_pz, guide.stepDistance);
  assert.notEqual(clip.poses.impact.spine_x, clip.poses.plant.spine_x);
});

test('two-hand grip changes the off-hand chain while preserving the sword arm', () => {
  const single = bakeAdvancingVerticalChopClip({ twoHandGrip: false });
  const paired = bakeAdvancingVerticalChopClip({ twoHandGrip: true, secondaryGripWeight: 1 });
  assert.notEqual(single.poses.impact.aL_sx, paired.poses.impact.aL_sx);
  assert.notEqual(single.poses.windup.aL_sy, paired.poses.windup.aL_sy);
  assert.equal(single.poses.impact.aR_sx, paired.poses.impact.aR_sx);
  assert.equal(paired.metadata.motionGuide.twoHandGrip, true);
});

test('right lead foot mirrors step contact without changing sword hand', () => {
  const left = bakeAdvancingVerticalChopClip({ leadFoot: 'L' });
  const right = bakeAdvancingVerticalChopClip({ leadFoot: 'R' });
  assert.equal(left.poses.windup.lL_contact, 0);
  assert.equal(right.poses.windup.lR_contact, 0);
  assert.equal(left.poses.windup.aR_sx, right.poses.windup.aR_sx);
  assert.equal(left.poses.impact.root_pz, right.poses.impact.root_pz);
});

test('vertical chop template aligns movement, plant and combat windows', () => {
  const project = createAdvancingVerticalChopTemplate({ plantFrame: 15, impactFrame: 19 });
  assert.equal(project.action.category, 'heavy-attack');
  assert.equal(project.action.windows.active[0].startFrame, 18);
  assert.equal(project.action.windows.movement[0].endFrame, 20);
  assert.equal(project.clip.timeline.find((key) => key.name === 'plant').frame, 15);
  assert.ok(project.action.windows.weaponTrail[0].startFrame < project.action.windows.active[0].startFrame);
});
