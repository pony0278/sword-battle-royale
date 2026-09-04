import test from 'node:test';
import assert from 'node:assert/strict';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  AUTHORED_PHASE_FRAMES, TWO_HAND_GRIP_PHASES, TWO_HAND_LEFT_ARM,
  applyTwoHandGrip, applyTwoHandGripToKayKitRig,
  twoHandGripLandmarkSeconds, twoHandLeftArmAtSeconds,
} from '../src/animation/two-hand-grip.js';
import { advancingVerticalChopFrames, bakeAdvancingVerticalChopClip } from '../src/animation/whole-body-motion-solver.js';
import { LONGSWORD_ATTACK_TIMINGS } from '../src/combat/longsword-attack-timings.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_LONGSWORD_DEFINITION } from '../src/character/procedural-v3-weapon.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { TWO_HAND_GRIP_REACH_TOLERANCE, measureGripReach } from '../build/grip-reach.mjs';

const THREE = { ...ThreeModule, GLTFLoader };

test('the authored phase frames match the baker they were taken from', () => {
  // AUTHORED_PHASE_FRAMES is a copy, kept so that two-hand-grip.js does not have to import a clip
  // baker to know where its own phases sit. This is what stops the copy drifting.
  assert.deepEqual({ ...advancingVerticalChopFrames() }, { ...AUTHORED_PHASE_FRAMES });
});

test('the phases land on a weapon\'s own measured swing, not on the chop\'s frames', () => {
  const profile = LONGSWORD_ATTACK_TIMINGS.getProfile('top');
  const marks = twoHandGripLandmarkSeconds({ ...profile, contactSeconds: 0.43 });
  // Four are the weapon's own landmarks outright.
  assert.equal(marks.plant, profile.activeStartSeconds);
  assert.equal(marks.impact, 0.43);
  assert.equal(marks.follow, profile.activeEndSeconds);
  assert.equal(marks.recover, profile.durationSeconds);
  assert.equal(marks.ready, 0);
  // The two with no landmark keep their authored share of the run-up: 8/16 and 13/16 of the way
  // from ready to plant.
  assert.ok(Math.abs(marks.windup - profile.activeStartSeconds * 0.5) < 1e-12);
  assert.ok(Math.abs(marks.commit - profile.activeStartSeconds * (13 / 16)) < 1e-12);
  // Monotonic, always. A weapon whose contact was measured outside its active window would
  // otherwise run the arm backwards.
  const seconds = TWO_HAND_GRIP_PHASES.map((phase) => marks[phase]);
  for (let index = 1; index < seconds.length; index += 1) assert.ok(seconds[index] >= seconds[index - 1]);
  const broken = twoHandGripLandmarkSeconds({ activeStartSeconds: 0.4, activeEndSeconds: 0.2, durationSeconds: 0.1, contactSeconds: 0.05 });
  assert.deepEqual(TWO_HAND_GRIP_PHASES.map((phase) => broken[phase]), [0, 0.2, 0.325, 0.4, 0.4, 0.4, 0.4]);
});

test('the arm interpolates between phases and holds at the ends', () => {
  const marks = twoHandGripLandmarkSeconds({ activeStartSeconds: 0.4, activeEndSeconds: 0.6, durationSeconds: 1, contactSeconds: 0.5 });
  assert.deepEqual({ ...twoHandLeftArmAtSeconds(0, marks) }, { ...TWO_HAND_LEFT_ARM.ready });
  assert.deepEqual({ ...twoHandLeftArmAtSeconds(marks.plant, marks) }, { ...TWO_HAND_LEFT_ARM.plant });
  assert.deepEqual({ ...twoHandLeftArmAtSeconds(99, marks) }, { ...TWO_HAND_LEFT_ARM.recover });
  const half = twoHandLeftArmAtSeconds((marks.plant + marks.impact) / 2, marks);
  assert.ok(Math.abs(half.aL_sx - (TWO_HAND_LEFT_ARM.plant.aL_sx + TWO_HAND_LEFT_ARM.impact.aL_sx) / 2) < 1e-9);
});

test('the blend is a weight, not a switch', () => {
  const pose = { aL_sx: 0, aL_ex: 0, aR_sx: -70 };
  assert.deepEqual(applyTwoHandGrip(pose, TWO_HAND_LEFT_ARM.windup, 0), pose, 'weight 0 leaves the pose one-handed');
  assert.equal(applyTwoHandGrip(pose, TWO_HAND_LEFT_ARM.windup, 1).aL_sx, -142);
  assert.equal(applyTwoHandGrip(pose, TWO_HAND_LEFT_ARM.windup, 0.5).aL_sx, -71);
  assert.equal(applyTwoHandGrip(pose, TWO_HAND_LEFT_ARM.windup, 1).aR_sx, -70, 'the right arm is never touched');
});

test('the rig overlay writes the three left arm bones and nothing else', () => {
  const character = createDefaultCharacter(THREE);
  const before = Object.fromEntries(Object.entries(character.rig.bones).map(([name, bone]) => [
    name, [bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.scale.y],
  ]));
  const report = applyTwoHandGripToKayKitRig(character.rig, TWO_HAND_LEFT_ARM.windup, 1);
  assert.equal(report.applied, true);
  const moved = Object.entries(character.rig.bones)
    .filter(([name, bone]) => {
      const [x, y, z, sy] = before[name];
      return bone.rotation.x !== x || bone.rotation.y !== y || bone.rotation.z !== z || bone.scale.y !== sy;
    })
    .map(([name]) => name)
    .sort();
  assert.deepEqual(moved, ['lowerarm.l', 'upperarm.l', 'wrist.l']);
  // Weight zero writes nothing at all, so a one-handed weapon costs no work.
  const untouched = createDefaultCharacter(THREE);
  assert.equal(applyTwoHandGripToKayKitRig(untouched.rig, TWO_HAND_LEFT_ARM.windup, 0).applied, false);
});

test('MEASURED: the authored grip does not reach the hilt, on either weapon', () => {
  // The finding this whole module exists to have produced. The pose is open-loop - nothing in it
  // knows where a hilt is - and the question of whether the hand lands on one is answerable, so it
  // was answered rather than assumed.
  //
  // These numbers are a RECORD OF FAILURE, deliberately pinned. When a real two-handed animation
  // pack arrives, `npm run measure:grip-reach` is what says whether it holds the sword, and this
  // test is what says what it has to beat.
  const twoHanded = bakeAdvancingVerticalChopClip({ twoHandGrip: true });
  const gap = (definition, phase) => measureGripReach(THREE, {
    definition, pose: twoHanded.poses[phase], mount: DEFAULT_KAYKIT_SWORD_MOUNT,
    createDefaultCharacter, createDebugSword, mountDebugSword,
  });

  for (const [definition, label] of [[V3_LONGSWORD_DEFINITION, 'longsword'], [V3_GREATSWORD_DEFINITION, 'greatsword']]) {
    for (const phase of ['ready', 'windup', 'commit', 'plant', 'impact', 'follow_through', 'recover']) {
      assert.ok(gap(definition, phase) > TWO_HAND_GRIP_REACH_TOLERANCE,
        `${label}/${phase} now reaches the hilt - if a clip fixed this, update the record and delete the FAIL branch of measure-grip-reach.mjs`);
    }
  }

  // Pinned to four places, because the shape of the failure is the useful part: the arm leans in
  // hardest at plant and then diverges as the sword swings on past it.
  assert.equal(gap(V3_LONGSWORD_DEFINITION, 'plant').toFixed(4), '0.2912');
  assert.equal(gap(V3_LONGSWORD_DEFINITION, 'impact').toFixed(4), '0.7920');
  assert.equal(gap(V3_LONGSWORD_DEFINITION, 'follow_through').toFixed(4), '1.2632');
  assert.equal(gap(V3_GREATSWORD_DEFINITION, 'plant').toFixed(4), '0.2671');
  assert.equal(gap(V3_GREATSWORD_DEFINITION, 'impact').toFixed(4), '0.7817');
});

test('the greatsword is no worse than the longsword, which is why the mesh was never the problem', () => {
  // Measured because it was the reason A looked promising: the two secondary grips sit 0.047 apart,
  // so a bigger weapon does not make this harder. It does not make it work either.
  const twoHanded = bakeAdvancingVerticalChopClip({ twoHandGrip: true });
  for (const phase of ['ready', 'plant', 'impact']) {
    const options = { pose: twoHanded.poses[phase], mount: DEFAULT_KAYKIT_SWORD_MOUNT, createDefaultCharacter, createDebugSword, mountDebugSword };
    const longsword = measureGripReach(THREE, { ...options, definition: V3_LONGSWORD_DEFINITION });
    const greatsword = measureGripReach(THREE, { ...options, definition: V3_GREATSWORD_DEFINITION });
    assert.ok(greatsword < longsword, `${phase}: the greatsword should be marginally closer, not further`);
    assert.ok(longsword - greatsword < 0.06);
  }
});
