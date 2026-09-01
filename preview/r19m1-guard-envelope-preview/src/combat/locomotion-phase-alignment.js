export const LOCOMOTION_PHASE_ALIGNMENT_STAGE = 'R21T.1';

// R21T.1 - which foot is down, and when, as a fraction of each clip's own cycle.
//
// Blending a walk with a run needs the two to agree about that, and nothing here had ever measured
// it. R20W.1 fitted the authored SPEED from exactly these contacts and kept the speeds; the phases
// were thrown away and its script was not committed, so this rebuilds the reading and keeps both.
//
// Method, and it is the same physical test R20W.1 used: the KayKit locomotion clips are in-place,
// so while a foot is planted it is fixed in the world and the toe must travel backwards at exactly
// the clip's authored speed. Height alone is not enough - it calls the whole low half of a stride
// a contact - and speed alone catches the top of the swing where the toe momentarily matches. Both
// together, at 480 samples per cycle, with an ABSOLUTE ground height of 0.04m rather than a
// fraction of each clip's own height range, because a fraction means something different in a clip
// whose toe rises 0.16m and one whose toe rises 0.29m, and that difference moved the answer by 8%
// of a cycle on the first pass.
export const MEASURED_FOOT_CONTACT_PHASE = Object.freeze({
  Walking_B: Object.freeze({
    cycleSeconds: 1.0667,
    authoredSpeedMps: 1.053,
    left: Object.freeze({ strike: 0.315, lift: 0.375 }),
    right: Object.freeze({ strike: 0.815, lift: 0.875 }),
  }),
  Running_A: Object.freeze({
    cycleSeconds: 0.8,
    authoredSpeedMps: 3.268,
    left: Object.freeze({ strike: 0.108, lift: 0.263 }),
    right: Object.freeze({ strike: 0.608, lift: 0.763 }),
  }),
});

// Both clips put their two feet exactly half a cycle apart. That is the precondition for blending
// them at all - an asymmetric cycle could not be phase-matched to a symmetric one - and it is
// measured rather than assumed, because a retargeted clip is exactly the kind of thing that comes
// back subtly lopsided.
export const GAITS_ARE_SYMMETRIC = Object.freeze({
  Walking_B: 0.5,
  Running_A: 0.5,
});

// Add this to Running_A's normalised phase and the two clips strike with the same foot at the same
// moment. 0.207 of its 0.8s cycle is 166ms.
export const RUNNING_A_PHASE_OFFSET_TO_WALKING_B = 0.207;

// The part that does NOT line up, kept because it decides what a blend can and cannot be.
//
// The toe is on the ground for 6% of a Walking_B cycle and 16% of a Running_A one, so aligning the
// strikes leaves the lifts 9.4% apart - one event can be matched, not both. That is not an error
// in either clip: a walk strikes heel-first and the toe comes down late and leaves early, while a
// run lands far flatter, so the toe's ground time genuinely differs between the two gaits.
//
// Which is the argument for blending the UPPER body over the walk's legs rather than blending
// whole bodies: with the legs coming wholly from the walk there is no toe-off to mismatch, and the
// offset above is still needed - arm swing is coupled to the opposite leg, so an unaligned upper
// body would swing against the feet.
export const STANCE_FRACTION_MISMATCH = Object.freeze({
  Walking_B: 0.06,
  Running_A: 0.16,
  liftsRemainApartBy: 0.094,
  onlyOneEventCanBeMatched: true,
  reason: 'a-walk-strikes-heel-first-a-run-lands-flat',
});

export const LOCOMOTION_PHASE_METHOD = Object.freeze({
  samplesPerCycle: 480,
  groundHeightMeters: 0.04,
  test: 'toe-below-ground-height-AND-travelling-backwards-at-the-authored-speed',
  probe: 'tools/action-studio/locomotion-phase.probe.html',
  driver: 'tools/action-studio/measure-locomotion-phase.mjs',
  authority: 'clip-timing-only-no-contact-authority',
});

// Where Running_A must be sampled to strike alongside Walking_B at a given normalised phase.
export function alignedRunPhase(walkPhase) {
  const phase = Number(walkPhase);
  if (!Number.isFinite(phase)) return null;
  const shifted = (phase - RUNNING_A_PHASE_OFFSET_TO_WALKING_B) % 1;
  return shifted < 0 ? shifted + 1 : shifted;
}

// R21T.2 - is there anything in the run's upper body worth borrowing?
//
// The overlay's whole premise, and it had never been checked. Sampled at the aligned phase above,
// per bone, as the angle between the two clips' LOCAL rotations - local rather than world, because
// a world quaternion folds the spine's rotation into every arm bone hanging off it.
//
//   hand.r 40.9 / hand.l 40.2     upperarm.r 34.8 / .l 31.7     lowerarm.r 19.9 / .l 14.4
//   head 9.7                      spine 8.3                     chest 6.1
//   wrist.l 0.0                   wrist.r 0.0
//
// The premise holds, but not the way it was pitched. "Lean and arm drive" was the argument; the
// measurement says the difference is almost entirely ARM - 32-41 degrees at the shoulder and hand
// - and the torso barely moves at all. KayKit's run does not lean. So the overlay will buy the
// swing and will NOT buy the forward-pitched sprint silhouette; that would have to be added as a
// procedural spine pitch, which is an invention rather than something the clip contains, and is
// worth keeping separate so it can be judged on its own.
//
// The wrists are not animated in either clip. Listing them in an overlay would be inert.
export const MEASURED_UPPER_BODY_DIVERGENCE_DEGREES = Object.freeze({
  'hand.r': 40.9, 'hand.l': 40.2,
  'upperarm.r': 34.8, 'upperarm.l': 31.7,
  'lowerarm.r': 19.9, 'lowerarm.l': 14.4,
  head: 9.7, spine: 8.3, chest: 6.1,
  'wrist.l': 0, 'wrist.r': 0,
});

export const UPPER_BODY_DIVERGENCE_NOTES = Object.freeze({
  comparedAtAlignedPhase: true,
  rotationsAre: 'local-not-world',
  theDifferenceIsArmsNotTorso: true,
  runDoesNotLean: true,
  wristsAreNotAnimatedInEitherClip: true,
  // Nothing contests these bones: sprint-locomotion refuses to sprint while the guard is up
  // ('guard-is-up'), so the sprint's arms and the guard's upper body can never both want them.
  ownershipIsUncontested: 'sprint-refused-while-guard-is-up',
});
