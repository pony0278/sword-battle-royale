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
  // R21Y.1: the other run in the pack, measured because it was asked for as an arm source. Its toe
  // is down for 8% of a cycle against Running_A's 16% - which was the stated reason not to trust
  // its authored SPEED, since 8% of a cycle is thin to fit a slope against. The arms need its
  // PHASE, not its speed, and that came back clean: a single contiguous contact per foot, exactly
  // half a cycle apart.
  Running_B: Object.freeze({
    cycleSeconds: 0.8,
    authoredSpeedMps: 7.2,
    left: Object.freeze({ strike: 0.188, lift: 0.265 }),
    right: Object.freeze({ strike: 0.688, lift: 0.767 }),
  }),
});

// Both clips put their two feet exactly half a cycle apart. That is the precondition for blending
// them at all - an asymmetric cycle could not be phase-matched to a symmetric one - and it is
// measured rather than assumed, because a retargeted clip is exactly the kind of thing that comes
// back subtly lopsided.
export const GAITS_ARE_SYMMETRIC = Object.freeze({
  Walking_B: 0.5,
  Running_A: 0.5,
  Running_B: 0.5,
});

// Add this to a run's normalised phase and it strikes with the same foot as Walking_B at the same
// moment. Running_A: 0.207 of its 0.8s cycle, 166ms. Running_B: 0.127, 102ms.
//
// R21Y.1 derives these from the contacts above rather than restating them, because an offset and
// the strikes it was computed from are the same fact written twice, and the version that gets
// edited without the other is the one that silently swings the arms against the feet.
function offsetToWalkingB(runClipId) {
  const walk = MEASURED_FOOT_CONTACT_PHASE.Walking_B?.left?.strike;
  const run = MEASURED_FOOT_CONTACT_PHASE[runClipId]?.left?.strike;
  if (walk == null || run == null) return null;
  const offset = (walk - run) % 1;
  return Number((offset < 0 ? offset + 1 : offset).toFixed(3));
}

export const PHASE_OFFSET_TO_WALKING_B = Object.freeze({
  Running_A: offsetToWalkingB('Running_A'),
  Running_B: offsetToWalkingB('Running_B'),
});

// R22C.1: Running_B, chosen from play after R21Y.1 put both behind ?runclip= and R22A.1 fixed the
// torso that was cancelling most of the borrowed swing. Running_A stays measured and selectable -
// it is what every number above R21Y.1 was taken against - but it is no longer what ships.
export const DEFAULT_RUN_CLIP_ID = 'Running_B';
export const RUNNING_A_PHASE_OFFSET_TO_WALKING_B = PHASE_OFFSET_TO_WALKING_B.Running_A;

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
  // R21Y.1: Running_B lands flatter still and leaves sooner - 8% - so it mismatches the walk's
  // toe-off by less than Running_A does. Irrelevant while the legs are wholly the walk's, and
  // recorded because it is the number that would matter if that ever stopped being true.
  Running_B: 0.08,
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

// Where a run must be sampled to strike alongside Walking_B at a given normalised phase. MINUS the
// offset, not plus: the run needs +offset to reach the walk's phase, so the run frame belonging to
// this walk frame sits that far EARLIER in its own cycle. Getting that sign backwards compares the
// two clips while they are out of step by twice the offset, which is how R21Y.1's first divergence
// reading came back 23% high before it was checked against R21T.2's committed figures.
export function alignedRunPhase(walkPhase, runClipId = DEFAULT_RUN_CLIP_ID) {
  const phase = Number(walkPhase);
  const offset = PHASE_OFFSET_TO_WALKING_B[runClipId];
  if (!Number.isFinite(phase) || offset == null) return null;
  const shifted = (phase - offset) % 1;
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
//
// R21Y.1 measured the other candidate against the same walk, and it is a different animal - not
// uniformly bigger, which is what "a faster run clip" would have predicted:
//
//   bone         Running_A      Running_B
//   upperarm     31.7 / 34.8    39.8 / 41.1     more shoulder
//   lowerarm     14.4 / 19.9    23.6 / 27.6     half again as much elbow (peaks 58-63 vs 35-37)
//   hand         40.2 / 40.9    33.4 / 32.8     LESS hand
//   head          9.7           17.9            and it leans
//   spine         8.3           15.0
//   chest         6.1            6.4            unchanged
//
// Running_A's advantage is entirely in the hand, which on this rig is the least readable of the
// three - the wrist below it is not animated at all - while Running_B's is in the shoulder and
// elbow, which are. That is the case for the swap; whether it reads better is still an eye's call,
// which is why ?runclip= exists before the default moves.
//
// The head and spine figures also reopen something R21U.1 closed. Excluding the torso was argued
// on "KayKit's run does not lean", measured at 8.3 degrees of spine - true of Running_A and NOT of
// Running_B at 15.0. The forward-pitched sprint silhouette may be in the pack after all rather
// than needing to be invented, but taking the torso is its own decision and is not made here.
export const MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP = Object.freeze({
  Running_A: Object.freeze({
    'hand.r': 40.9, 'hand.l': 40.2,
    'upperarm.r': 34.8, 'upperarm.l': 31.7,
    'lowerarm.r': 19.9, 'lowerarm.l': 14.4,
    head: 9.7, spine: 8.3, chest: 6.1,
    'wrist.l': 0, 'wrist.r': 0,
  }),
  Running_B: Object.freeze({
    'hand.r': 32.8, 'hand.l': 33.4,
    'upperarm.r': 41.1, 'upperarm.l': 39.8,
    'lowerarm.r': 27.6, 'lowerarm.l': 23.6,
    head: 17.9, spine: 15.0, chest: 6.4,
    'wrist.l': 0, 'wrist.r': 0,
  }),
});

// The default clip's table, under the name R21T.2 gave it.
export const MEASURED_UPPER_BODY_DIVERGENCE_DEGREES = MEASURED_UPPER_BODY_DIVERGENCE_BY_RUN_CLIP[DEFAULT_RUN_CLIP_ID];

export const UPPER_BODY_DIVERGENCE_NOTES = Object.freeze({
  comparedAtAlignedPhase: true,
  rotationsAre: 'local-not-world',
  // R21T.2 wrote these two as facts about "the run". They are facts about Running_A, and R21Y.1
  // measured a second run for which both are false: Running_B's spine differs by 15.0 degrees and
  // its head by 17.9, against 8.3 and 9.7. Kept per clip rather than corrected in place, because
  // the original reading was right about the clip it was taken from - and R21U.1's whole exclusion
  // argument rested on it.
  theDifferenceIsArmsNotTorso: Object.freeze({ Running_A: true, Running_B: false }),
  runDoesNotLean: Object.freeze({ Running_A: true, Running_B: false }),
  wristsAreNotAnimatedInEitherClip: true,
  // Nothing contests these bones: sprint-locomotion refuses to sprint while the guard is up
  // ('guard-is-up'), so the sprint's arms and the guard's upper body can never both want them.
  ownershipIsUncontested: 'sprint-refused-while-guard-is-up',
});
