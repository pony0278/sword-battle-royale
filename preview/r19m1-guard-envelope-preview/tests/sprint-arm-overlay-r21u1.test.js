import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SPRINT_ARM_OVERLAY_BONES,
  SPRINT_ARM_OVERLAY_EVIDENCE,
  SPRINT_ARM_OVERLAY_EXCLUSIONS,
  SPRINT_ARM_OVERLAY_STAGE,
  SPRINT_ARM_RAMP_MPS,
  blendSprintArms,
  sprintArmSamplePhase,
  sprintArmWeight,
} from '../src/combat/sprint-arm-overlay.js';
import { MEASURED_UPPER_BODY_DIVERGENCE_DEGREES, alignedRunPhase } from '../src/combat/locomotion-phase-alignment.js';
import { LANE_WALK_CLIPS, createLaneWalkCycle } from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';
import { WALK_OVERLAY_BONES } from '../src/combat/guard-walk-overlay.js';

const laneController = await readFile(new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');

test('R21U.1 the overlay borrows exactly the bones that differ', () => {
  assert.equal(SPRINT_ARM_OVERLAY_STAGE, 'R21U.1');
  // Every borrowed bone diverges by more than 10 degrees between the two clips; every excluded
  // one either barely moves or is not animated at all. Both halves are measured, not chosen.
  for (const bone of SPRINT_ARM_OVERLAY_BONES) {
    assert.ok(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES[bone] > 10, `${bone} barely differs`);
  }
  for (const bone of SPRINT_ARM_OVERLAY_EXCLUSIONS.torso) {
    assert.ok(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES[bone] < SPRINT_ARM_OVERLAY_EXCLUSIONS.torsoDivergenceDegrees);
  }
  for (const bone of SPRINT_ARM_OVERLAY_EXCLUSIONS.unanimated) {
    assert.equal(MEASURED_UPPER_BODY_DIVERGENCE_DEGREES[bone], 0, `${bone} is not animated; listing it is inert`);
  }
  // And it never reaches for a leg - those have an owner already.
  for (const bone of WALK_OVERLAY_BONES) assert.ok(!SPRINT_ARM_OVERLAY_BONES.includes(bone));
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
  const half = blendSprintArms(walk, run, 0.5);
  // Half of a 90 degree turn is 45.
  assert.ok(Math.abs(half['upperarm.l'].quaternion.y - Math.sin(Math.PI / 8)) < 1e-6);
  // Position and scale are the rig's, not the clip's - blending them would stretch the limb.
  assert.deepEqual(half['upperarm.l'].position, walk['upperarm.l'].position);
  assert.deepEqual(half['upperarm.l'].scale, walk['upperarm.l'].scale);
  // A bone outside the list is untouched even when the run offers one.
  assert.deepEqual(half.spine.quaternion, walk.spine.quaternion);
  // The ends are exact, and a zero weight does not even look at the run.
  assert.deepEqual(blendSprintArms(walk, run, 0)['upperarm.l'].quaternion, walk['upperarm.l'].quaternion);
  assert.deepEqual(blendSprintArms(walk, null, 1)['upperarm.l'].quaternion, walk['upperarm.l'].quaternion);
  // Shortest arc: a run pose on the far side of the hypersphere must not swing the elbow backwards
  // through the body on its way there.
  const flipped = { 'upperarm.l': { quaternion: { x: 0, y: -Math.SQRT1_2, z: 0, w: -Math.SQRT1_2 } } };
  assert.ok(blendSprintArms(walk, flipped, 0.5)['upperarm.l'].quaternion.y > 0);
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

test('R21U.1 the lane controller samples the run before the walk and reports the weight', () => {
  // Sampled first so the rig is left holding the walk; blended before the filter so a guarding
  // fighter's arms are dropped with the rest of the upper body.
  const runIndex = laneController.indexOf('sprintArmSamplePhase(gaitReport.phase)');
  const walkIndex = laneController.indexOf('defender.sampleAnimation(sample.clipId');
  assert.ok(runIndex !== -1 && walkIndex !== -1);
  assert.ok(runIndex < walkIndex, 'the run must be sampled before the walk');
  assert.match(laneController, /blendSprintArms\(walkPose, runArmPose, armWeight\),\s*gate\.scope/);
  // A number, not a boolean, because the whole point is that there is no switch any more.
  assert.match(laneController, /get defenderSprintArmWeight\(\) \{ return lastSprintArmWeight; \}/);
});
