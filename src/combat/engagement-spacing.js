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

// R21S.1 - MEASURED_FULL_COVERAGE_BAND_METERS was here, and is deleted rather than annotated.
//
// It said 1.55-2.05m was "the band the calibrations are trusted within", measured at R18X.1 as the
// range over which all three directions reached the guard at least 10 times in 12. Nothing read it
// at runtime; it was a claim with no consumer, and its upper end is now refuted outright. The
// R21P.1 defence matrix drives the calibrated 2.40m stance and every direction defends there,
// which is 0.35m past a maximum that said LEFT stops clearing the bar at 2.05m.
//
// Two things moved underneath it and neither prompted a re-measure: the band's ends are set by
// RIGHT and LEFT, and RIGHT was retimed at R21B.1 while LEFT was retimed at R21K.1 and again at
// R21O.3 - which moved LEFT's arrival from 78% to 91% of its own swing. A band about when the
// blade is where cannot survive changing when, twice, on both of the directions that define it.
//
// Annotating it was the first plan and it was the worse one: a constant that still exists is still
// quoted, and a caveat underneath it is not read by whoever greps for a number. What is kept is
// the history rather than the claim.
export const SUPERSEDED_FULL_COVERAGE_BAND_METERS = Object.freeze({
  stage: 'R18X.1',
  minimum: 1.55,
  maximum: 2.05,
  limitedBy: Object.freeze({ minimum: 'right', maximum: 'left' }),
  testedRange: Object.freeze({ minimum: 1.4, maximum: 2.5 }),
  method: 'guard-reaches-blade-10-of-12-block-mode',
  // Precise about which half died: the maximum is refuted by measurement, the minimum is merely
  // untested since. Nothing here says the guard works below 1.55m - only that it works above 2.05.
  refutedBy: Object.freeze({ stage: 'R21P.1', evidence: 'defence-matrix-defends-all-three-at-2.40m' }),
  minimumIsUntestedRatherThanRefuted: true,
  supersededBecause: Object.freeze(['right-retimed-r21b1', 'left-retimed-r21k1', 'left-retimed-r21o3']),
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
// R21S.1: the paragraph that stood here paired this against the coverage band and concluded that
// "they meet at a point rather than over a band" - the guard reliable from 1.55m out, every attack
// landing from 1.55m in. Both halves of that pairing are gone now: R21E.1 superseded the reach
// figures below, and R21S.1 deleted the coverage band whose maximum R21P.1 refuted. The conclusion
// is removed rather than rewritten, because there is no second measurement left to draw it from.
// What survives from the original sweep, on its own terms: closer than 1.50m the guard starts
// failing outright - RIGHT blocks 0 of 12 at 1.40m, and every miss in that range reaches the body.
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
