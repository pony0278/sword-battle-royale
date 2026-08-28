export const GUARD_TRACKING_ENVELOPE_STAGE = 'R19M.1';

// R19M.1: how far and how fast a held guard must travel now that attacks lunge.
//
// This is the same staleness R19F.1 found in the parry, in the one place that fix did not reach.
// Guard's 0.34m budget and 1.55m/s tracking speed were calibrated against an in-place blade:
// before attack-advance existed the swing's world path never moved the attacker, so covering a
// direction was a hand's-width correction. The advance carries the attacker up to 0.862m into the
// blow. R19F.1 rebuilt the parry's envelope around that and deliberately left Guard alone, on the
// stated grounds that "every coverage band was measured on them" - true, and exactly why the bands
// stop where they do.
//
// Measured against the shipping code, TOP in BLOCK mode, one fresh page load per trial:
//
//   budget / speed     stance 2.0 (contact ~1.14m)
//   0.34 / 1.55  <-- shipping      0/6
//   0.50 / 2.5                     8/12
//   0.55 / 2.5                     8/12
//   0.60 / 3.2  <-- parry envelope 15/18
//   0.75 / 2.5                     12/12
//   0.75 / 3.2                     12/12
//   0.90 / 3.2                     12/12
//   0.90 / 4.5                     18/18
//
// Budget is the binding constraint and it saturates at 0.75: every larger budget matches it and
// no smaller one reaches it. Speed is not binding - 4.5 buys nothing over 3.2, and 2.5 matches
// both - so Guard keeps the slowest speed that holds the result, and stays slower than Parry's
// 3.2. Joint limits are not binding either: 34/42 -> 70/85 was measured at 0/6 and 1/3 where the
// stock limits gave 0/6 and 1/6, which is no gain at all, so they are untouched.
//
// What this buys is one stance step: TOP's working floor moves from roughly 1.34m of contact
// separation to roughly 1.14m. It is not a close-range fix. At the 0.90m body pushbox the blade
// base arrives about a third of a metre PAST the shield plane - the attacker is inside the guard,
// not beating it - and no envelope reaches behind itself. That band belongs to the hilt-strike
// rule in close-range-engagement, not here.
export const GUARD_TRACKING_TRAVEL_BUDGET_METERS = 0.75;
export const GUARD_TRACKING_SPEED_MPS = 2.5;

// Guard's budget now exceeds Parry's, which reverses what R19F.1 recorded and what
// guard-threat-tracking's own test asserted ("the lunge journey outgrew even the omnidirectional
// guard reach"). That assertion described a measurement, not a rule: it was true of the parry's
// need at the 2.4m stance and was never a constraint the design rests on.
//
// The rule that IS stated - in the Guard profile's own comment - is about speed, and it survives
// intact: "Guard covers a direction it has time to read, Parry buys the frames a fast attack
// denies it." Guard remains the slower of the two. The two envelopes now say something coherent
// about the difference between the actions: a held guard tracks continuously across a long
// horizon, so it covers more ground, while a parry is a brief committed spike from a prepared
// position, so it covers its ground faster. More reach, less speed.
//
// Kept as a named claim rather than a comment because it is the one judgement in R19M.1 that the
// measurements do not make on their own, and it should break loudly if either envelope moves.
export const GUARD_EXCEEDS_PARRY_REACH_RATIONALE = Object.freeze({
  stage: GUARD_TRACKING_ENVELOPE_STAGE,
  claim: 'guard travels further than parry but never faster',
  supersedes: 'R19F.1 recorded parry.maxCorrectionMeters > guard.maxCorrectionMeters as an invariant',
  authority: 'measured-guard-envelope-no-contact-authority',
});
