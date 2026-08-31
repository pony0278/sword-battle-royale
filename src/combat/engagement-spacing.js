export const ENGAGEMENT_SPACING_STAGE = 'R18T.1';

// R18T.1: How far apart the two fighters stand.
//
// Until now this was two hardcoded z coordinates in the lab scene, and every calibration in the
// combat set was measured against it without anyone saying so out loud: the per-direction contact
// times, the directional coverage anchors, the reach budgets, the whole question of whether a
// given attack arrives at the shield at all. They are not distance-independent facts. They are
// facts *at this distance*.
//
// Naming it is the first step to letting the fighters move. A separation this module does not
// know about is a separation nothing has been calibrated for, and the honest thing is to be able
// to say how far from calibration a given stance is.
// R18Y.1: where the fighters start, which since attacks carry a step is no longer where they meet.
//
// It was 1.55m for one turn of this argument, chosen as the only separation at which a standing
// attacker could still reach a standing defender while the guard stayed reliable - a knife edge,
// because those two constraints met at a point rather than over a band. Giving the attacks their
// step is what widened it: measured with the step active, the guard holds 48/48 across every
// direction from 2.40m through 2.70m, and at 2.40m two of the three attacks genuinely require it
// to work rather than passing where the shield already rests.
export const CALIBRATED_ENGAGEMENT_SEPARATION_METERS = 2.4;

// R18X.1: the band the calibrations are trusted within - the range over which all three attack
// directions were measured to reach the guard at least 10 times in 12, in BLOCK mode, headless.
// The per-direction detail and the full table live in guard-directional-anchor.js.
//
// It still does not contain the calibrated separation, and still for a measured reason rather than
// a mistake in the constant: LEFT stops clearing the bar past 2.05m. What changed is the bottom.
// Before the swept contact test followed the blade's arc this read 2.00-2.10m, and everything
// below 2.00m was simply unswept; the arc fix cleared 1.50-2.05m and the sweep went down to 1.40m.
export const MEASURED_FULL_COVERAGE_BAND_METERS = Object.freeze({
  minimum: 1.55,
  maximum: 2.05,
  // Different directions set the two ends, which is the whole reason this is not one number.
  limitedBy: Object.freeze({ minimum: 'right', maximum: 'left' }),
  testedRange: Object.freeze({ minimum: 1.4, maximum: 2.5 }),
});

// R18X.1: the other half of what a separation means - not whether the guard can reach the blade,
// but whether the blade would have reached anything. Measured the only honest way, by freezing the
// guard's tracking entirely so a miss is guaranteed, then asking whether the body hurtbox is
// struck. Per direction, the furthest separation at which an unopposed attack still lands:
//
//   top    1.55m       right  1.55m       left   2.05m
//
// Beyond its entry here a direction is theatre: the swing finishes short of the defender and it
// makes no difference whether the guard met it. LEFT reaches the knees and waist from over two
// metres, which is why it is the direction that has driven every guard problem in this codebase.
//
// Read this against MEASURED_FULL_COVERAGE_BAND_METERS and the useful distance is narrow. The
// guard is fully reliable from 1.55m out; all three attacks land from 1.55m in. They meet at a
// point rather than over a band. Between 1.60m and 2.05m only LEFT is a real threat, and closer
// than 1.50m the guard starts failing outright - RIGHT blocks 0 of 12 at 1.40m, and every miss in
// that range reaches the body.
//
// R19J.2 measured what that range looks like from the attack's side. Below the guard's floor the
// attack degenerates too: at the 0.9m body pushbox TOP and RIGHT land on blade fraction 0, the
// base at the guard, and LEFT misses a standing defender entirely by a centimetre or two. So the
// band below 1.55m is a distance where neither side has a working answer - not, as R19J.1 first
// concluded from near-miss data, one where only the defence is missing. close-range-engagement
// holds those curves and the trap that produced the wrong version.
//
// R19L.1 asks the question these bands cannot: not "does a block resolve" but "would the swing
// have landed if it had not". Paired against unguarded runs, the guard answers a landing blow at
// three of twenty-seven sampled stances - see guard-effectiveness.
//
// R21E.1 RE-MEASURED, and the old numbers were badly stale. Swept guard-down over 1.40-3.90m in
// 0.10m steps, both edges re-run and identical, the reach is far longer than R18X.1 recorded:
//
//   top    2.90m start (contact 2.04m)   right  2.60m start (contact 1.94m)   left  2.60m (2.15m)
//
// Two things moved underneath the old figures and neither prompted a re-measure. The swept contact
// test learned to follow the blade's ARC - R18X.1's own note records that fix pushing the coverage
// band's floor from 2.00m down to 1.40m, and it lengthened reach for the same reason - and R21B.1
// retimed RIGHT outright. The advance model was never the problem: the start-to-contact drop came
// back at 0.862 / 0.663 / 0.448m, matching ATTACK_ADVANCE_PROFILES to the millimetre.
//
// What this corrects in practice: the old numbers said an attack from the calibrated 2.40m stance
// contacted beyond its own reach and so could not have landed - that a block there was answering
// a blow that would have missed. Measured, all three strike the body from 2.40m (chest, chest,
// knees). The stakes at the calibrated distance are real.
//
// Kept as start separations, the same way R18X.1 stated them, because that is the number a stance
// is chosen in; effectiveSeparationAtContact converts either way.
export const MEASURED_UNDEFENDED_BODY_REACH_METERS = Object.freeze({
  top: 2.9,
  right: 2.6,
  left: 2.6,
  contactSeparationMeters: Object.freeze({ top: 2.04, right: 1.94, left: 2.15 }),
  supersedes: Object.freeze({ stage: 'R18X.1', top: 1.55, right: 1.55, left: 2.05 }),
  method: 'guard-down-sweep-body-hit-or-not',
  testedRange: Object.freeze({ minimum: 1.4, maximum: 3.9 }),
});

// R18Y.1: the distance that actually decides everything, which is not the one the fighters start
// at. The attacker spends their step before the blow lands, so by contact the gap has closed by
// however far that direction travels. Measured across four start distances and three directions,
// the guard's success tracks this number and not the starting one - a TOP attack from 2.30m
// behaves like the 1.44m it contacts at, which is why it failed there while RIGHT and LEFT, whose
// steps are shorter, did not.
//
// So the coverage bands in guard-directional-anchor.js did not go stale when attacks started
// moving. They are facts about the separation at contact, and this is how a starting stance is
// converted into one.
export function effectiveSeparationAtContact(startSeparationMeters, advanceMeters) {
  const start = finite(startSeparationMeters, CALIBRATED_ENGAGEMENT_SEPARATION_METERS);
  return Math.max(0, start - Math.max(0, finite(advanceMeters)));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeEngagementSeparation(meters) {
  const value = finite(meters, CALIBRATED_ENGAGEMENT_SEPARATION_METERS);
  return Math.max(0.2, Math.min(8, value));
}

// Two fighters, symmetric about the origin, facing each other down the z axis. Symmetry is not
// cosmetic: every measurement taken so far assumed the midpoint between them is the origin.
export function planEngagementStance(separationMeters = CALIBRATED_ENGAGEMENT_SEPARATION_METERS) {
  const separation = normalizeEngagementSeparation(separationMeters);
  const half = separation / 2;
  return Object.freeze({
    stage: ENGAGEMENT_SPACING_STAGE,
    separationMeters: separation,
    attacker: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: -half }), facingRadians: 0 }),
    defender: Object.freeze({ position: Object.freeze({ x: 0, y: 0, z: half }), facingRadians: Math.PI }),
    calibrated: Math.abs(separation - CALIBRATED_ENGAGEMENT_SEPARATION_METERS) < 1e-6,
    offsetFromCalibrationMeters: separation - CALIBRATED_ENGAGEMENT_SEPARATION_METERS,
    authority: 'stance-geometry-only-no-contact-authority',
  });
}
