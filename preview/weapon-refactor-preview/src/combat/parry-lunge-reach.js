export const PARRY_LUNGE_REACH_STAGE = 'R19F.1';

// R19F.1: how far, how fast, and how early a parry must reach now that attacks lunge.
//
// Every parry travel budget in the intercept chain was 0.18m, and all of them were calibrated
// against an in-place blade: before code-driven attack advance existed, the swing's world path
// never moved the attacker, so an intercept was always a hand's-width correction. The advance
// (attack-advance.js) carries the attacker up to 0.862m into the blow, and the blade's world path
// moved with him. Measured at the calibrated 2.4m stance, TOP's parry then needed 0.538m of shield
// travel (the whiff diagnostic's own planRequiredDistanceMeters) against budgets that allowed
// 0.18m - the cascade hauled the shield most of the way and missed by 7mm, every time. RIGHT and
// LEFT still connected, but at bladeFraction 0.05-0.11 with run-to-run chaotic release geometry,
// which is what made the parried arm fly in a different direction every attempt.
//
// The mid-blade catch of the pre-advance world does not exist at the advanced distances - the
// full blade-path capture shows the blade's midpoint reaching catchable depth only at the
// defender's body plane - so the fix is not a cleverer aim but an envelope that matches the
// journey: budget covers the measured need with margin, speed covers it inside the unchanged
// input window, and the prompt fires at that window's earliest legal edge instead of 45ms later.
//
// Verified at the 2.4m stance, four repetitions per direction: 12/12 parries connect (TOP had
// been 0/12) and every release carry repeats within ±0.05 - TOP throws up, RIGHT and LEFT throw
// across. The player's input window itself ([0.06, 0.18]s before contact, after commitment) is
// deliberately untouched: this recalibrates what the defender's body does with the input, not
// when the input is legal.
export const PARRY_LUNGE_REACH_CALIBRATION = Object.freeze({
  stage: PARRY_LUNGE_REACH_STAGE,
  measuredAtSeparationMeters: 2.4,
  measuredRequiredTravelMeters: Object.freeze({
    top: 0.538, // whiff diagnostic planRequiredDistanceMeters at the 0.18m budgets
  }),
  missWithOldBudgetsMeters: 0.007,
  verifiedConnects: Object.freeze({ top: '4/4', right: '4/4', left: '4/4' }),
  carryRepeatabilityBand: 0.05,
});

// The shield-travel budget every stage of the parry chain shares: the committed gate's clamp,
// the tracking runtime's correction, the latched intent's lead, and the reachable-target
// selector. One number, because they describe one journey.
export const PARRY_LUNGE_TRAVEL_BUDGET_METERS = 0.60;

// Covering 0.5m+ inside a ~0.2s window needs more than the old 1.6 m/s hand-correction speed.
// A committed parry sweep is a fast motion; 3.2 m/s is still slower than the blade it meets.
export const PARRY_LUNGE_TRACKING_SPEED_MPS = 3.2;

// The prediction must see far enough ahead to plan a longer journey.
export const PARRY_LUNGE_HORIZON_SECONDS = 0.24;

// The prompt fires at the input window's earliest legal edge (the committed gate's
// earliestInputTtcSeconds) rather than 45ms inside it: a longer journey spends every legal frame.
export const PARRY_LUNGE_PROMPT_TTC_SECONDS = 0.18;

// blade-first threat selection: prefer a predicted crossing on the blade proper over one at the
// hilt. Candidates below the fraction floor pay a penalty per metre-equivalent of missing
// fraction, so a mid-blade option wins whenever one exists but a hilt catch is still taken when
// it is the only geometry on offer (at the advanced distances it often is).
export const PARRY_BLADE_FIRST_FRACTION_FLOOR = 0.45;
export const PARRY_BLADE_FIRST_FRACTION_PENALTY_PER_UNIT = 2.0;
