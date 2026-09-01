import { RUNNING_A_PHASE_OFFSET_TO_WALKING_B, alignedRunPhase } from './locomotion-phase-alignment.js';
import { WALK_TO_RUN_TRANSITION } from './locomotion-clip-measurements.js';
import { SPRINT_SPEED_MPS } from './sprint-locomotion.js';

export const SPRINT_ARM_OVERLAY_STAGE = 'R21U.1';

// R21U.1 - the run's arms over the walk's legs, instead of swapping clips at a threshold.
//
// R20W.2 chose the gait by speed: Walking_B below 1.36 m/s, Running_A above. Two things were wrong
// with the far side of that switch and both are measured.
//
// The cadence. Running_A's stride is 2.614m, so at the sprint's 1.5 m/s it takes 1.15 steps per
// second - fewer than a WALKING person's two - and holds an airborne pose for over a second. That
// is the float, and no speed this game may run at redeems it: the sprint ceiling is 1.62 m/s
// (measured, from the dodge), where the clip still manages 1.24 steps/s. Running_A needs 2.6 m/s
// to reach a walking cadence and its own 3.27 to look like running.
//
// Walking_B at 1.5 m/s, meanwhile, takes 2.67 steps/second - which IS a running cadence. The
// timing was already right. What the walk cannot supply is the POSE, and R21T.2 measured exactly
// how much of that the run has to lend: 32-41 degrees at the shoulder and hand, against 6-8 at the
// spine and chest. The difference between these two clips is almost entirely ARM.
//
// So the legs keep the walk - its cadence is correct and its stride is what the phase is driven by,
// so the feet still do not slide - and the arms are borrowed. There is no threshold left to cross,
// which is what the hard cut actually was.
export const SPRINT_ARM_OVERLAY_BONES = Object.freeze([
  'upperarm.l', 'lowerarm.l', 'hand.l',
  'upperarm.r', 'lowerarm.r', 'hand.r',
]);

// Deliberately absent, and each for its own measured reason:
//   spine / chest / head - the two clips differ by 6-9 degrees there. KayKit's run does not lean,
//     so taking the torso would buy nothing and would put a third claimant on bones the guard
//     already owns. A forward-pitched sprint silhouette would have to be invented separately.
//   wrist.l / wrist.r    - neither clip animates them at all. Listing them would be inert.
export const SPRINT_ARM_OVERLAY_EXCLUSIONS = Object.freeze({
  torso: Object.freeze(['spine', 'chest', 'head']),
  // The largest of the three, head at 9.7 - a bound the excluded bones are under, not a value any
  // of them has. It was 9 for one run of the tests, which the head then failed by seven tenths.
  torsoDivergenceDegrees: 10,
  unanimated: Object.freeze(['wrist.l', 'wrist.r']),
});

// Where the arms start borrowing, and where they are fully the run's. The floor is the same
// biomechanical transition the old switch used - a gait is a run when the body is going fast
// enough to be running - so the borrowing starts exactly where the clip swap used to happen. The
// difference is that it now RAMPS from there instead of arriving all at once.
export const SPRINT_ARM_RAMP_MPS = Object.freeze({
  begin: WALK_TO_RUN_TRANSITION.biomechanicalTransitionMps,
  full: SPRINT_SPEED_MPS,
});

export function sprintArmWeight(speedMetersPerSecond) {
  const speed = Number(speedMetersPerSecond);
  if (!Number.isFinite(speed)) return 0;
  const { begin, full } = SPRINT_ARM_RAMP_MPS;
  if (speed <= begin) return 0;
  if (speed >= full) return 1;
  return (speed - begin) / (full - begin);
}

// The run must be sampled where it strikes with the walk, or the arms swing against the feet -
// arm swing is coupled to the opposite leg. R21T.1 measured the offset at +20.7% of a cycle.
export function sprintArmSamplePhase(walkPhase) {
  return alignedRunPhase(walkPhase);
}

function slerp(a, b, t) {
  // Shortest arc: without the sign flip a pair either side of the hypersphere takes the long way
  // round, which on an arm reads as the elbow swinging backwards through the body.
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x; let by = b.y; let bz = b.z; let bw = b.w;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (dot > 0.9995) {
    const x = a.x + (bx - a.x) * t; const y = a.y + (by - a.y) * t;
    const z = a.z + (bz - a.z) * t; const w = a.w + (bw - a.w) * t;
    const n = Math.hypot(x, y, z, w) || 1;
    return { x: x / n, y: y / n, z: z / n, w: w / n };
  }
  const theta = Math.acos(Math.min(1, dot));
  const sin = Math.sin(theta);
  const s0 = Math.sin((1 - t) * theta) / sin;
  const s1 = Math.sin(t * theta) / sin;
  return { x: a.x * s0 + bx * s1, y: a.y * s0 + by * s1, z: a.z * s0 + bz * s1, w: a.w * s0 + bw * s1 };
}

// Rotation only. The arm bones' positions and scales are the rig's, not the clip's - blending them
// would let one clip's proportions leak into the other's and stretch the limb.
export function blendSprintArms(walkPose, runPose, weight) {
  const w = Math.min(1, Math.max(0, Number(weight) || 0));
  const base = walkPose || {};
  if (w <= 0 || !runPose) return Object.freeze({ ...base });
  const output = { ...base };
  for (const bone of SPRINT_ARM_OVERLAY_BONES) {
    const from = base[bone];
    const to = runPose[bone];
    if (!from?.quaternion || !to?.quaternion) continue;
    output[bone] = Object.freeze({
      ...from,
      quaternion: Object.freeze(slerp(from.quaternion, to.quaternion, w)),
    });
  }
  return Object.freeze(output);
}

export const SPRINT_ARM_OVERLAY_EVIDENCE = Object.freeze({
  runStepsPerSecondAtSprint: 1.15,
  walkStepsPerSecondAtSprint: 2.67,
  aWalkingPersonStepsPerSecond: 2,
  armDivergenceDegrees: Object.freeze({ shoulder: 34.8, hand: 40.9 }),
  torsoDivergenceDegrees: 8.3,
  phaseOffset: RUNNING_A_PHASE_OFFSET_TO_WALKING_B,
  authority: 'locomotion-presentation-only-no-contact-authority',
});
