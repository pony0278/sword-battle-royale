export const GUARD_FRONTAL_CONE_STAGE = 'R19X.1';

// R19X.1: how much facing error the guard survives. The B2 cone measurement, and the design
// table stage B3's cone rule will be built from.
//
// Method: at the calibrated 2.4m stance - the healthy cell where every direction blocks
// reliably when square - a controlled error angle was added to the defender's facing on top of
// everything the shipping stack does (the R19Q guard turn included, so this measures the SYSTEM's
// tolerance, not bare geometry), and each direction's attack was replayed at each angle, fresh
// page per trial. Positive angles rotate the shield side toward the attacker, negative away.
//
// The one-sentence finding: THE CONE IS WILDLY ASYMMETRIC, because the shield is mounted on one
// arm. Rotating toward the shield side keeps the buckler between the bodies for a quarter turn
// and more - every direction still blocks at +90 degrees, most at +150 - while rotating away
// strips the guard at per-direction angles: LEFT dies first (already 1/6 at -45), TOP holds to
// -45 and dies by -60, RIGHT tolerates a full -90 before dying by -100. Past the collapse the
// numbers flicker rather than sit at zero (TOP blocked 2/4 at -110 and 3/4 at 180): a rotated
// shield re-enters a centre-line chop's plane by geometric accident, which is exactly why the
// flickers are recorded as rates and no rule should ever be built on them.
export const MEASURED_GUARD_CONE_TRIALS = Object.freeze({
  // errorDegrees -> per-direction blocked/of. Rates, not verdicts; n varies by how close each
  // angle sits to a boundary.
  top: Object.freeze({
    '-120': [1, 4], '-110': [2, 4], '-100': [0, 4], '-90': [0, 2], '-75': [0, 4], '-60': [0, 4],
    '-50': [2, 4], '-45': [6, 6], '-40': [2, 2], '0': [2, 2], '40': [2, 2], '90': [6, 6],
    '120': [3, 4], '150': [4, 4], '180': [3, 4],
  }),
  right: Object.freeze({
    '-120': [0, 4], '-110': [0, 4], '-100': [1, 4], '-90': [2, 2], '-75': [4, 4], '-60': [4, 4],
    '-50': [4, 4], '-45': [6, 6], '-40': [2, 2], '0': [2, 2], '40': [2, 2], '90': [6, 6],
    '120': [4, 4], '150': [3, 4], '180': [0, 4],
  }),
  // R20C.1: LEFT's near-negative side re-measured, because the original sweep never sampled it.
  // R19X took nothing between -5 and -35, saw noise at -40/-45 (n=2 and n=6), and cut the band
  // at zero - and the R19Z gate then enforced that unsampled edge literally: a defender with
  // -0.005 degrees of chase residue stood the whole guard down (the autopsy that found this is
  // R20C's origin). Sampled, the flank is healthy to -20 and flickers beyond; -40 and -45 were
  // re-measured at larger n on the current stack and the old 1-in-2 / 1-in-6 flickers did not
  // reproduce. Rows from -45 inward are R20C's; the deeper collapse rows remain R19X's.
  left: Object.freeze({
    '-120': [0, 4], '-110': [0, 4], '-100': [0, 4], '-90': [0, 2], '-75': [1, 4], '-60': [3, 4],
    '-50': [2, 4], '-45': [4, 6], '-40': [6, 6], '-35': [4, 4], '-28': [4, 6], '-25': [8, 10],
    '-22': [4, 6], '-20': [4, 4], '-15': [4, 4], '-10': [4, 4], '-5': [4, 4], '0': [2, 2],
    '40': [2, 2], '90': [6, 6], '120': [4, 4], '150': [4, 4], '180': [0, 4],
  }),
});

// The reliable band per direction: the widest contiguous span around zero where every sampled
// angle blocked at full rate (boundary-noise cells like LEFT's -40 at 1/2 fall outside it).
// Derived judgements, stated as data so a future retune has to face them:
//   the away-side limit is per-direction because each arc approaches from its own side;
//   the toward-side limit is generous for everyone because the shield rides the rotation.
export const MEASURED_GUARD_RELIABLE_CONE_DEGREES = Object.freeze({
  top: Object.freeze({ fromDegrees: -45, toDegrees: 150 }),
  right: Object.freeze({ fromDegrees: -90, toDegrees: 120 }),
  // R20C.1: was 0, an artifact of the unsampled -5..-35 gap. A band edge that sits exactly at
  // the resting point turns commitment into the sign of noise; the measured edge is -20, with
  // a fifth of a degree of live chase residue nowhere near it.
  left: Object.freeze({ fromDegrees: -20, toDegrees: 150 }),
});

// What a B3 rule can lean on today: the intersection of the three reliable bands, which is the
// span where the guard answers EVERY direction. LEFT's away-side fragility sets the tight edge -
// its low sweep hunts the shield's resting flank, and any rotation away uncovers it first.
export const MEASURED_UNIVERSAL_GUARD_CONE_DEGREES = Object.freeze({
  fromDegrees: -20,
  toDegrees: 120,
  limitedBy: Object.freeze({ from: 'left', to: 'right' }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// What the sweep says about one direction at one facing error. Sampled angles answer with their
// measured rate; unsampled angles answer known:false rather than an interpolation, because the
// collapse edges are cliffs and the far side flickers - a straight line through either lies.
export function assessGuardFrontalCone(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const trials = MEASURED_GUARD_CONE_TRIALS[direction];
  if (!trials) {
    return Object.freeze({
      stage: GUARD_FRONTAL_CONE_STAGE, direction, known: false,
      reason: `unmeasured-direction-${direction || 'none'}`,
    });
  }
  const errorDegrees = finite(input.facingErrorDegrees, NaN);
  const key = String(errorDegrees);
  const cell = trials[key] || null;
  const band = MEASURED_GUARD_RELIABLE_CONE_DEGREES[direction];
  return Object.freeze({
    stage: GUARD_FRONTAL_CONE_STAGE,
    direction,
    known: Boolean(cell),
    reason: cell ? 'sampled-angle' : 'angle-not-sampled',
    blockedOfTried: cell ? Object.freeze([...cell]) : null,
    insideReliableCone: Number.isFinite(errorDegrees)
      ? errorDegrees >= band.fromDegrees && errorDegrees <= band.toDegrees
      : null,
    reliableCone: band,
    authority: 'measured-facing-error-tolerance-no-contact-authority',
  });
}
