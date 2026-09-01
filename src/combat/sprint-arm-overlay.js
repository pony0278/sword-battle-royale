import {
  DEFAULT_RUN_CLIP_ID,
  MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP,
  PHASE_OFFSET_TO_WALKING_B,
  RUNNING_A_PHASE_OFFSET_TO_WALKING_B,
  alignedRunPhase,
} from './locomotion-phase-alignment.js';
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

// R22A.1 - and the torso, which R21U.1 excluded on an argument that turned out to be about one clip.
//
// That argument was "KayKit's run does not lean": Running_A's spine differs from the walk's by 8.3
// degrees, so taking the torso would buy nothing. True of Running_A. Running_B's spine differs by
// 15.0, and the reason this matters is not the lean itself - it is that these bones carry LOCAL
// rotations, so the arms' actual path is the run's rotations hung on whatever spine and chest sit
// underneath them. Leave those as the walk's and a large part of the borrowed swing is cancelled
// before it reaches the hand. Traced through a whole cycle, right hand, chest-relative:
//
//   Walking_B                    0.374m of fore-aft travel
//   Running_B alone              0.897m
//   Running_B, arms only         0.518m   - 42% of the swing gone
//   Running_B, arms + torso      0.779m
//
// and the deviation from the clip's own hand path falls from 27% of its swing to 12% (Running_A:
// 28% to 18%). So the torso is not a bonus lean bolted on; without it the arms are not the run's
// arms. Reported from play as "it does not look like Running_B", which it did not.
//
// R22D.1 adds the hips, on a measurement that says it is both the largest thing left and the safest
// of the ones left. Walking_B against Running_B at the aligned phase, sampled the way the game
// samples (in-place, root rotation locked):
//
//   hips rotation   11.3 degrees mean, 11.8 peak - and PURE PITCH: 0.0 yaw, 0.0 roll
//   hips height     the walk rises 0.055m through a cycle, the run 0.139m
//
// Pitch is a pelvis tilt, which is what a runner leans with, and taking it cannot swing the feet
// sideways the way yaw would. It is also near-constant across the cycle (11.3 mean against 11.8
// peak), so it lands as a static lean rather than a per-frame wobble - a constant offset adds no
// sliding to a distance-driven gait.
//
// The BOUNCE is deliberately not taken, and cannot be: blendSprintUpperBody blends rotation only,
// so hips.position never transfers. That is the right answer rather than a limitation - the legs
// are the walk's, and lifting the pelvis 2.5x further through a cycle those legs were not drawn for
// would put the feet through the floor at one end and in the air at the other.
export const SPRINT_TORSO_OVERLAY_BONES = Object.freeze(['hips', 'spine', 'chest', 'head']);

// What the overlay actually writes. The arms are still named separately because the ramp, the
// phase alignment and every divergence measurement are about them.
export const SPRINT_UPPER_BODY_OVERLAY_BONES = Object.freeze([
  ...SPRINT_ARM_OVERLAY_BONES,
  ...SPRINT_TORSO_OVERLAY_BONES,
]);

// Still deliberately absent: neither clip animates the wrists at all, so listing them is inert.
// Nothing contests the torso while sprinting - sprint-locomotion refuses to run with the guard up
// ('guard-is-up'), and the two runtimes that write spine and chest (guard-residual-body-reach and
// articulated-impact-bracing) only run while guarding or on impact.
export const SPRINT_ARM_OVERLAY_EXCLUSIONS = Object.freeze({
  unanimated: Object.freeze(['wrist.l', 'wrist.r']),
  torsoTakenSince: 'R22A.1',
  torsoOwnershipIsUncontested: 'sprint-refused-while-guard-is-up',
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

// R21Y.1 - which run the arms are borrowed FROM.
//
// The pack has two, and they are different animals rather than two speeds of one: Running_B gives
// more shoulder and half again as much elbow, less hand, and it leans. Both are measured, both are
// phase-aligned to Walking_B from their own contacts, so either can be worn - and which reads
// better is an eye's call, so the lab takes ?runclip= and the default stays where it was until
// somebody has looked.
export const SPRINT_ARM_CLIP_CANDIDATES = Object.freeze(Object.keys(PHASE_OFFSET_TO_WALKING_B));
export const DEFAULT_SPRINT_ARM_CLIP_ID = DEFAULT_RUN_CLIP_ID;

// Refuses anything unmeasured rather than falling through to it. A clip with no measured contact
// has no offset, and an unaligned overlay swings the arms against the feet - which R21T.1 measured
// as reading worse than not borrowing at all. So an unknown name is the default, not a gamble.
export function resolveSprintArmClip(value) {
  const requested = typeof value === 'string' ? value.trim() : '';
  const known = SPRINT_ARM_CLIP_CANDIDATES.includes(requested);
  return Object.freeze({
    clipId: known ? requested : DEFAULT_SPRINT_ARM_CLIP_ID,
    requested: requested || null,
    reason: known ? (requested === DEFAULT_SPRINT_ARM_CLIP_ID ? 'default' : 'override')
      : requested ? 'unmeasured-clip-has-no-phase-offset' : 'default',
    phaseOffset: PHASE_OFFSET_TO_WALKING_B[known ? requested : DEFAULT_SPRINT_ARM_CLIP_ID],
    divergenceDegrees: MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP[known ? requested : DEFAULT_SPRINT_ARM_CLIP_ID],
  });
}

// The run must be sampled where it strikes with the walk, or the arms swing against the feet -
// arm swing is coupled to the opposite leg. R21T.1 measured the offset at +20.7% of a cycle for
// Running_A; R21Y.1 at +12.7% for Running_B, from that clip's own contacts.
export function sprintArmSamplePhase(walkPhase, runClipId = DEFAULT_SPRINT_ARM_CLIP_ID) {
  return alignedRunPhase(walkPhase, runClipId);
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

// Rotation only. The bones' positions and scales are the rig's, not the clip's - blending them
// would let one clip's proportions leak into the other's and stretch the limb.
//
// R22A.1 renamed this from blendSprintArms: it writes the torso now, and a function that moves the
// spine while calling itself "arms" is the kind of name this repository keeps having to apologise
// for in a comment.
export function blendSprintUpperBody(walkPose, runPose, weight) {
  const w = Math.min(1, Math.max(0, Number(weight) || 0));
  const base = walkPose || {};
  if (w <= 0 || !runPose) return Object.freeze({ ...base });
  const output = { ...base };
  for (const bone of SPRINT_UPPER_BODY_OVERLAY_BONES) {
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
  // Running_A's, the clip R21U.1 was argued against. R22C.1 ships Running_B, which is worse on the
  // same measure - 0.52 steps/s - so the argument for keeping the legs on the walk only hardened.
  runStepsPerSecondAtSprint: 1.15,
  shippedRunStepsPerSecondAtSprint: 0.52,
  walkStepsPerSecondAtSprint: 2.67,
  aWalkingPersonStepsPerSecond: 2,
  armDivergenceDegrees: Object.freeze({ shoulder: 34.8, hand: 40.9 }),
  torsoDivergenceDegrees: 8.3,
  // R22A.1: how much of the borrowed swing survives to the hand, per scope. The reason the torso
  // is taken - not the lean, the swing.
  handTravelMeters: Object.freeze({
    Walking_B: 0.374,
    Running_B: 0.897,
    Running_B_armsOnly: 0.518,
    Running_B_armsAndTorso: 0.779,
    // R22D.1, with the pelvis lean added on top of the torso.
    Running_B_armsAndTorsoAndHips: 0.800,
  }),
  // How far the worn arm strays from the clip's own hand path, as a fraction of that clip's swing.
  // The three scopes, in the order they were taken.
  handPathDeviationFraction: Object.freeze({
    armsOnly: 0.27,
    armsAndTorso: 0.12,
    armsAndTorsoAndHips: 0.05,
  }),
  phaseOffset: RUNNING_A_PHASE_OFFSET_TO_WALKING_B,
  shippedPhaseOffset: PHASE_OFFSET_TO_WALKING_B[DEFAULT_RUN_CLIP_ID],
  authority: 'locomotion-presentation-only-no-contact-authority',
});
