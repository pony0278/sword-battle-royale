import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SPRINT_ARM_OVERLAY_BONES,
  SPRINT_ARM_OVERLAY_EVIDENCE,
  SPRINT_TORSO_OVERLAY_BONES,
  SPRINT_UPPER_BODY_OVERLAY_BONES,
  SPRINT_ARM_OVERLAY_EXCLUSIONS,
  SPRINT_ARM_OVERLAY_STAGE,
  SPRINT_ARM_RAMP_MPS,
  blendSprintUpperBody,
  sprintArmSamplePhase,
  sprintArmWeight,
} from '../src/combat/sprint-arm-overlay.js';
import { MEASURED_UPPER_BODY_DIVERGENCE_DEGREES, alignedRunPhase } from '../src/combat/locomotion-phase-alignment.js';
import { LANE_WALK_CLIPS, createLaneWalkCycle } from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';
import { WALK_OVERLAY_BONES } from '../src/combat/guard-walk-overlay.js';

const laneController = await readFile(new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');

test('R21U.1 the overlay borrows the arms that differ, and R22A.1 the torso they hang from', () => {
  assert.equal(SPRINT_ARM_OVERLAY_STAGE, 'R21U.1');
  // Every borrowed ARM bone diverges by more than 10 degrees between the two clips. That test is
  // unchanged: the arms are still chosen because they move.
  for (const bone of SPRINT_ARM_OVERLAY_BONES) {
    assert.ok(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES[bone] > 10, `${bone} barely differs`);
  }
  // R22A.1: the torso is NOT chosen on divergence - Running_A's spine differs by 8.3 degrees and
  // is taken anyway. It is taken because these are LOCAL rotations, so leaving the spine and chest
  // as the walk's cancels part of the arm swing before it reaches the hand: measured at 42% of
  // Running_B's fore-aft hand travel. Asserting a divergence threshold here would be inventing a
  // reason the decision does not rest on.
  assert.deepEqual([...SPRINT_UPPER_BODY_OVERLAY_BONES].sort(),
    [...SPRINT_ARM_OVERLAY_BONES, ...SPRINT_TORSO_OVERLAY_BONES].sort());
  const travel = SPRINT_ARM_OVERLAY_EVIDENCE.handTravelMeters;
  assert.ok(travel.Running_B_armsOnly < travel.Running_B * 0.6, 'arms alone lose most of the swing');
  assert.ok(travel.Running_B_armsAndTorso > travel.Running_B_armsOnly * 1.4, 'the torso gives it back');
  assert.ok(travel.Running_B_armsOnly > travel.Walking_B, 'it was never doing nothing, just not enough');

  for (const bone of SPRINT_ARM_OVERLAY_EXCLUSIONS.unanimated) {
    assert.equal(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES[bone], 0, `${bone} is not animated; listing it is inert`);
    assert.ok(!SPRINT_UPPER_BODY_OVERLAY_BONES.includes(bone));
  }
  // And it never reaches for a leg - those have an owner already.
  for (const bone of WALK_OVERLAY_BONES) assert.ok(!SPRINT_UPPER_BODY_OVERLAY_BONES.includes(bone));
});

test('R21U.1 the weight ramps instead of switching', () => {
  // The hard cut this replaces fired at the biomechanical transition. The ramp BEGINS there, so
  // the gait still becomes a run at the same measured speed - it just arrives gradually.
  assert.ok(Math.abs(SPRINT_ARM_RAMP_MPS.begin - 1.359) < 0.01);
  assert.equal(SPRINT_ARM_RAMP_MPS.full, SPRINT_SPEED_MPS);
  assert.equal(sprintArmWeight(LANE_LOCOMOTION_PROFILE.forwardSpeedMps), 0, 'a walk borrows nothing');
  assert.equal(sprintArmWeight(SPRINT_SPEED_MPS), 1, 'a sprint borrows all of it');
  assert.ok(sprintArmWeight(1.43) > 0.4 && sprintArmWeight(1.43) < 0.6, 'and half way is half way');
  // Past the sprint it saturates rather than overshooting into an extrapolated pose.
  assert.equal(sprintArmWeight(3), 1);
  assert.equal(sprintArmWeight('nonsense'), 0);
});

test('R21U.1 the arms are sampled where the run strikes with the walk', () => {
  // Unaligned, the arms swing against the feet - arm swing is coupled to the opposite leg.
  assert.equal(sprintArmSamplePhase(0.315), alignedRunPhase(0.315));
  assert.equal(SPRINT_ARM_OVERLAY_EVIDENCE.phaseOffset, 0.207);
});

test('R21U.1 blending is rotation only, and takes the short way round', () => {
  const walk = {
    'upperarm.l': { position: { x: 1, y: 2, z: 3 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
    spine: { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
  };
  const run = { 'upperarm.l': { quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } }, spine: { quaternion: { x: 0, y: 1, z: 0, w: 0 } } };
  const half = blendSprintUpperBody(walk, run, 0.5);
  // Half of a 90 degree turn is 45.
  assert.ok(Math.abs(half['upperarm.l'].quaternion.y - Math.sin(Math.PI / 8)) < 1e-6);
  // Position and scale are the rig's, not the clip's - blending them would stretch the limb.
  assert.deepEqual(half['upperarm.l'].position, walk['upperarm.l'].position);
  assert.deepEqual(half['upperarm.l'].scale, walk['upperarm.l'].scale);
  // R22A.1: the spine IS in the list now, so it blends like the arms - half of a 180 degree turn.
  assert.ok(Math.abs(half.spine.quaternion.y - Math.SQRT1_2) < 1e-6);
  // A bone outside the list is still untouched even when the run offers one.
  const outside = blendSprintUpperBody(
    { ...walk, 'foot.l': { quaternion: { x: 0, y: 0, z: 0, w: 1 } } },
    { ...run, 'foot.l': { quaternion: { x: 0, y: 1, z: 0, w: 0 } } }, 1,
  );
  assert.deepEqual(outside['foot.l'].quaternion, { x: 0, y: 0, z: 0, w: 1 });
  // The ends are exact, and a zero weight does not even look at the run.
  assert.deepEqual(blendSprintUpperBody(walk, run, 0)['upperarm.l'].quaternion, walk['upperarm.l'].quaternion);
  assert.deepEqual(blendSprintUpperBody(walk, null, 1)['upperarm.l'].quaternion, walk['upperarm.l'].quaternion);
  // Shortest arc: a run pose on the far side of the hypersphere must not swing the elbow backwards
  // through the body on its way there.
  const flipped = { 'upperarm.l': { quaternion: { x: 0, y: -Math.SQRT1_2, z: 0, w: -Math.SQRT1_2 } } };
  assert.ok(blendSprintUpperBody(walk, flipped, 0.5)['upperarm.l'].quaternion.y > 0);
});

test('R21U.1 the legs no longer change clip, so there is no cut left to smooth', () => {
  const cycle = createLaneWalkCycle();
  const sprinting = cycle.advance({ travelledMeters: SPRINT_SPEED_MPS * 0.1, deltaSeconds: 0.1 });
  assert.equal(sprinting.clipId, LANE_WALK_CLIPS.forward, 'the walk keeps the legs at any forward speed');
  assert.equal(sprinting.wholeBodyOnly, false);
  // The cadence that decided it: Walking_B at the sprint speed, against the run clip's.
  const e = SPRINT_ARM_OVERLAY_EVIDENCE;
  assert.ok(e.runStepsPerSecondAtSprint < e.aWalkingPersonStepsPerSecond,
    'the run clip took fewer steps than a walking person, which is the float');
  assert.ok(e.walkStepsPerSecondAtSprint > e.aWalkingPersonStepsPerSecond);
});

test('R21U.1 the lane controller blends before it filters, and reports a weight not a switch', () => {
  // The ordering claim this used to make - the run sampled before the walk - moved to
  // sprint-arms-survive-the-guard-scope-r21x1.test.js, where a harness watches the sampler being
  // called instead of matching the literal call text. It broke on R21Y.1 giving that call a second
  // argument while the ordering had not moved at all, which is the whole case against the form.
  //
  // What is left here is genuinely about the source: the blend must happen INSIDE the filter call,
  // and a reordering that filtered first would still pass any behavioural test at whole-body scope.
  assert.match(laneController, /blendSprintUpperBody\(walkPose, runArmPose, armWeight\),\s*gate\.scope/);
  // A number, not a boolean, because the whole point is that there is no switch any more.
  assert.match(laneController, /get defenderSprintArmWeight\(\) \{ return lastSprintArmWeight; \}/);
});
