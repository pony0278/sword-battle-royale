import test from 'node:test';
import assert from 'node:assert/strict';

import { createShieldParryLaneController } from '../src/game/lane-controller.js';
import { LANE_WALK_CLIPS } from '../src/combat/lane-walk-cycle.js';
import { LANE_LOCOMOTION_PROFILE } from '../src/combat/lane-locomotion.js';
import { SPRINT_SPEED_MPS } from '../src/combat/sprint-locomotion.js';
import { SPRINT_ARM_OVERLAY_BONES, SPRINT_ARM_RAMP_MPS } from '../src/combat/sprint-arm-overlay.js';
import { WALK_OVERLAY_BONES, WALK_OVERLAY_SCOPES } from '../src/combat/guard-walk-overlay.js';

// R21X.1 - the run's arms were being borrowed and then thrown away.
//
// Reported from play: "Running_A's motion does not appear in sprint - was it removed?" The legs
// were removed on purpose in R21U.1 and that was seen and approved; the ARMS were supposed to
// still be borrowed, and in parry mode they never were.
//
// Measured in the lab before changing anything, sprinting at 1.5 m/s:
//   parry mode  overlay scope 'legs',       arm weight 1.0
//   block mode  overlay scope 'whole-body', arm weight 1.0
// The run was sampled, the arms were blended in, and then filterPoseToWalkOverlay dropped every
// arm entry on the way out, because WALK_OVERLAY_BONES is legs-only. So the whole overlay was
// dead in the mode the game is actually played in.
//
// The cause is two answers to one question. The entry passes guardOwnsUpperBody as
// `selectedMode !== 'block' || guardActive`, written in R20W.2 when the only thing that wanted the
// torso was a whole-body RUN clip - while planSprint reads the same guard as DOWN and allows the
// sprint. A fighter cannot be both sprinting and using their arms to guard.

// Two rotations a quarter turn apart, so a slerp at weight 1 lands exactly on the run's.
const CLIP_ROTATION = {
  [LANE_WALK_CLIPS.forward]: { x: 0, y: 0, z: 0, w: 1 },
  [LANE_WALK_CLIPS.backward]: { x: 0, y: 0, z: 0, w: 1 },
  [LANE_WALK_CLIPS.run]: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
};
const cameFrom = (entry) => {
  for (const [clipId, rotation] of Object.entries(CLIP_ROTATION)) {
    const q = entry?.quaternion;
    if (q && Math.abs(q.x - rotation.x) < 1e-6 && Math.abs(q.y - rotation.y) < 1e-6
      && Math.abs(q.z - rotation.z) < 1e-6 && Math.abs(q.w - rotation.w) < 1e-6) return clipId;
  }
  return 'blended-or-unknown';
};

function harness() {
  const applied = [];
  const bones = {};
  // A rig whose bones are named exactly as the two overlays name them, and whose "pose" is just
  // which clip was last sampled - enough to see which bones survive the filter, which is the
  // entire subject.
  for (const bone of [...WALK_OVERLAY_BONES, ...SPRINT_ARM_OVERLAY_BONES, 'spine', 'chest', 'head']) {
    bones[bone] = { quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  }
  let sampledClip = null;
  const labScene = {
    engagementStance: { separationMeters: 2.4 },
    setLanePositions: () => {},
    setDefenderYawOffset: () => {},
    camera: null,
    defender: {
      rig: bones,
      sampleAnimation: (clipId) => { sampledClip = clipId; },
      update: () => {},
    },
  };
  const laneController = createShieldParryLaneController({
    labScene,
    walkClips: LANE_WALK_CLIPS,
    services: {
      // Each clip stamps its own rotation on every bone, so which half of a blended pose came from
      // the run is readable off the quaternion. blendSprintArms replaces ONLY the rotation - the
      // rest of the entry is the walk's - so any marker outside the quaternion would say "walk"
      // for an arm the run had fully taken.
      captureRigPose: () => Object.fromEntries(Object.keys(bones)
        .map((bone) => [bone, { quaternion: { ...CLIP_ROTATION[sampledClip] } }])),
      applyRigPose: (_rig, pose) => applied.push(pose),
    },
  });
  laneController.setWalkDurations({ [LANE_WALK_CLIPS.forward]: 1.0667, [LANE_WALK_CLIPS.backward]: 1, [LANE_WALK_CLIPS.run]: 0.8 });
  return { laneController, applied };
}

// Walks the defender forward at a speed for long enough that the gait is reporting it, then takes
// one walk sample with the guard claiming the upper body - which is what parry mode does.
function sampleAt(speedMps, { guardOwnsUpperBody = true } = {}) {
  const { laneController, applied } = harness();
  const step = speedMps / 60;
  for (let i = 0; i < 20; i += 1) {
    laneController.moveDefenderWorld(0, -step);
    laneController.walk(1 / 60, null);
  }
  const gate = laneController.sampleDefenderWalk(true, guardOwnsUpperBody);
  laneController.overlayDefenderWalkLegs();
  return { gate, pose: applied.at(-1) ?? {}, armWeight: laneController.defenderSprintArmWeight, laneController };
}

test('R21X.1 sprinting reaches the arms even when the guard claims the upper body', () => {
  const { gate, pose, armWeight } = sampleAt(SPRINT_SPEED_MPS);
  assert.ok(armWeight > 0.99, `the run should be fully borrowed at the sprint, got ${armWeight}`);
  // This asserted 'legs' by accident until R21X.1 - not in a test, but in the lab.
  assert.equal(gate.scope, WALK_OVERLAY_SCOPES.WHOLE_BODY);
  for (const bone of SPRINT_ARM_OVERLAY_BONES) {
    assert.ok(pose[bone], `${bone} must survive to the rig, or the overlay is decorative`);
    assert.equal(cameFrom(pose[bone]), LANE_WALK_CLIPS.run, `${bone} must come from the run`);
  }
  // And the legs are still the walk's - that is the whole shape of R21U.1.
  for (const bone of WALK_OVERLAY_BONES) {
    assert.equal(cameFrom(pose[bone]), LANE_WALK_CLIPS.forward, `${bone} must stay the walk's`);
  }
});

test('R21X.1 a guarding fighter WALKING still gets legs only', () => {
  // The narrow fix, held narrow: nothing below the run threshold changes, so the guard keeps the
  // arms it has always had and no coverage band moves.
  const { gate, pose, armWeight } = sampleAt(LANE_LOCOMOTION_PROFILE.forwardSpeedMps);
  assert.equal(armWeight, 0);
  assert.equal(gate.scope, WALK_OVERLAY_SCOPES.LEGS);
  for (const bone of SPRINT_ARM_OVERLAY_BONES) assert.equal(pose[bone], undefined, `${bone} belongs to the guard at a walk`);
  for (const bone of WALK_OVERLAY_BONES) assert.ok(pose[bone], `${bone} is still the walk's`);
});

test('R21X.1 the promotion cannot fire at any speed a guarding fighter can reach', () => {
  // The rule is "an arm weight above zero proves the guard is not using the arms". That is only
  // sound because a guarded body physically cannot get to the ramp's floor: the walk profile's
  // fastest is 1.0 m/s and the ramp begins at 1.359, and sprinting is refused outright while the
  // guard is up. If either number ever moves toward the other, this is the test that says so.
  const fastestGuardedSpeed = Math.max(
    LANE_LOCOMOTION_PROFILE.forwardSpeedMps,
    LANE_LOCOMOTION_PROFILE.backwardSpeedMps,
    LANE_LOCOMOTION_PROFILE.lateralSpeedMps,
  );
  assert.ok(fastestGuardedSpeed < SPRINT_ARM_RAMP_MPS.begin,
    `a guarding fighter can reach ${fastestGuardedSpeed} and the arms start borrowing at ${SPRINT_ARM_RAMP_MPS.begin}`);
  assert.equal(sampleAt(fastestGuardedSpeed).gate.scope, WALK_OVERLAY_SCOPES.LEGS);
});

test('R21X.1 a caller who never claimed the upper body is unaffected either way', () => {
  // Block mode with the guard down was already whole-body, and stays exactly that at every speed.
  for (const speed of [LANE_LOCOMOTION_PROFILE.forwardSpeedMps, SPRINT_SPEED_MPS]) {
    assert.equal(sampleAt(speed, { guardOwnsUpperBody: false }).gate.scope, WALK_OVERLAY_SCOPES.WHOLE_BODY);
  }
});

test('R21X.1 a refused overlay reports no borrowed arms rather than the last frame that had them', () => {
  // The weight is read by the HUD and by probes. Leaving the sprint's 1.0 standing through an
  // exchange would have said the fighter was wearing arms that were never sampled.
  const { laneController } = sampleAt(SPRINT_SPEED_MPS);
  assert.ok(laneController.defenderSprintArmWeight > 0.99);
  laneController.sampleDefenderWalk(false, true); // an attack in flight: the guard takes everything
  assert.equal(laneController.defenderWalkOverlay.allowed, false);
  assert.equal(laneController.defenderSprintArmWeight, 0);
});
