import { MEASURED_ATTACK_TIMELINE_SECONDS } from './swing-delivery-cone.js';
import { ATTACK_ADVANCE_PROFILES } from './attack-advance.js';
import { SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND } from './swing-windup-tracking.js';
import { LANE_LOCOMOTION_PROFILE, MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';

export const ORBIT_STEERING_BUDGET_STAGE = 'R20T.1';

// R20T.1 — can a circle-strafe out-turn the attacker's aim? Asked because free movement (R20S.3)
// made a true orbit possible for the first time, and because the arithmetic looked dangerous: the
// same 0.75 m/s of sidestep is 17.9 deg/s of bearing change at 2.4m but 39.1 deg/s at 1.1m, against
// a windup tracker that turns at 45.
//
// It is not dangerous, and the reason is a number rather than a judgement. The rate a strafe
// generates is speed over radius, so the tracker is beaten only inside 0.95m - and the ledger
// clamps the fighters apart at 0.90m. The exploitable band is five centimetres wide, and a swing
// spends only part of a short windup inside it.
//
// Measured in the browser against that prediction (pinned clock, guard held, full-speed orbit from
// the frame the attack starts, n=3 per cell): the aim error at the end of the windup is 0.04-0.34
// degrees at every stance and direction, against delivery-cone edges of -8 (LEFT) to +/-20. Nothing
// orbits its way out of a swing. 24 of 24 orbited exchanges were blocked with the guard up, and
// with the guard down every TOP and RIGHT swing still connected.
export const ORBIT_CROSSOVER_RADIUS_METERS = LANE_LOCOMOTION_PROFILE.lateralSpeedMps
  / SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND;

// The prediction, as code rather than a comment: integrate the windup with the defender orbiting
// and the attacker closing at the authored advance rate, and report what aim error survives. The
// browser numbers below are what this was checked against.
export function planWindupSteeringResidual({
  direction = 'top',
  startSeparationMeters = 2.4,
  lateralSpeedMps = LANE_LOCOMOTION_PROFILE.lateralSpeedMps,
  trackingRateRadiansPerSecond = SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND,
  stepSeconds = 1 / 600,
} = {}) {
  const timeline = MEASURED_ATTACK_TIMELINE_SECONDS[direction];
  const advance = ATTACK_ADVANCE_PROFILES[direction];
  if (!timeline || !advance) return null;
  // The step into the blow is spent across the swing to contact; during the windup, pro rata.
  const advanceRate = advance.metersByContact / timeline.contact;
  let radiusMeters = Math.max(MINIMUM_ENGAGEMENT_SEPARATION_METERS, Number(startSeparationMeters) || 0);
  let bearingRadians = 0;
  let facingRadians = 0;
  for (let elapsed = 0; elapsed < timeline.windup - 1e-9; elapsed += stepSeconds) {
    radiusMeters = Math.max(MINIMUM_ENGAGEMENT_SEPARATION_METERS, radiusMeters - advanceRate * stepSeconds);
    bearingRadians += (lateralSpeedMps / radiusMeters) * stepSeconds;
    const error = bearingRadians - facingRadians;
    const budget = trackingRateRadiansPerSecond * stepSeconds;
    facingRadians += Math.sign(error) * Math.min(Math.abs(error), budget);
  }
  const residualRadians = bearingRadians - facingRadians;
  return Object.freeze({
    stage: ORBIT_STEERING_BUDGET_STAGE,
    direction,
    windupSeconds: timeline.windup,
    endRadiusMeters: radiusMeters,
    accumulatedBearingDegrees: (bearingRadians * 180) / Math.PI,
    residualDegrees: (residualRadians * 180) / Math.PI,
    // Under a degree is "the tracker kept up": the tightest delivery-cone edge measured on any
    // direction is 8 degrees away, so a residual this size cannot move an outcome.
    trackerKeepsUp: Math.abs((residualRadians * 180) / Math.PI) < 1,
    authority: 'steering-analysis-only-no-combat-authority',
  });
}

// Aim error in degrees when the swing's active window opens - the last moment aim can still be
// spent - and again at contact. Browser measured, guard down, full-speed orbit, n=3, mean.
export const MEASURED_ORBIT_AIM_ERROR_DEGREES = Object.freeze({
  top: Object.freeze({ 1.1: { windupEnd: 0.15, contact: 1.45 }, 1.4: { windupEnd: 0.28, contact: 1.31 }, 1.8: { windupEnd: 0.34, contact: 1.17 }, 2.4: { windupEnd: 0.16, contact: 1.24 } }),
  right: Object.freeze({ 1.1: { windupEnd: 0.15, contact: 2.24 }, 1.4: { windupEnd: 0.28, contact: 2.10 }, 1.8: { windupEnd: 0.21, contact: 1.68 }, 2.4: { windupEnd: 0.10, contact: 1.13 } }),
  left: Object.freeze({ 1.1: { windupEnd: 0.15, contact: null }, 1.4: { windupEnd: 0.15, contact: null }, 1.8: { windupEnd: 0.08, contact: 3.07 }, 2.4: { windupEnd: 0.04, contact: 2.52 } }),
});

// The verdict, stated so a future stage does not have to re-derive it: a walking-speed orbit is not
// a dodge, at any range this game can be played at. If a dodge is wanted, it has to be a verb with
// its own speed - which is what the dash is for.
export const ORBIT_IS_NOT_A_DODGE = Object.freeze({
  stage: ORBIT_STEERING_BUDGET_STAGE,
  guardUpOrbitedExchanges: Object.freeze({ trials: 24, blocked: 24, bodyHits: 0, whiffs: 0 }),
  worstWindupAimErrorDegrees: 0.34,
  tightestDeliveryConeEdgeDegrees: -8,
});

// The thing this investigation found that it was not looking for, and then explained: LEFT does not
// reach an UNGUARDED body inside 1.4m of starting stance, whether the defender orbits or stands
// perfectly still. Movement is not the cause - the still control misses identically.
//
// ROOT CAUSE, measured rather than reasoned: you can get INSIDE the arc. LEFT is a low horizontal
// sweep, and at the moment of closest approach its blade passes at a fixed radius from the
// attacker - about 1.10m. When the pair is closer than that, the sweep goes BEHIND the target:
//
//   start 1.0m -> clamped at 0.90m, blade radius 1.102m against a body surface at 0.946m: the
//                 blade passes 15.5cm beyond the body, missing the waist disc by 2.6cm
//   start 1.2m -> identical, 15.5cm beyond, 2.4cm miss
//   start 1.4m -> 13.8cm beyond, 0.9mm miss (which is why that stance is a coin flip, 1/3)
//   start 1.5m -> separation at contact 1.058m, blade and body meet, 3/3 hit
//
// The gap closes monotonically from windup into the active window in both the hit and the miss, so
// this is not an eligibility gate refusing a contact that happened - the blade genuinely never
// arrives. What makes the starting stance matter is the ledger's 0.90m minimum separation: inside
// 1.4m the clamp eats the attacker's authored 0.45m advance, so they cannot close to the ~1.0m the
// sweep needs at contact.
//
// TOP is immune because a vertical chop lands on top of whatever is under it, and RIGHT connects
// 3/3 from 1.0m as well. This is LEFT's alone, and it is geometry behaving correctly - being
// inside a horizontal sweep is a real thing about swords. Whether it stays a mechanic is a design
// decision, not a bug report; what is recorded here is the band and the reason.
export const MEASURED_LEFT_CLOSE_RANGE_BODY_REACH = Object.freeze({
  stage: ORBIT_STEERING_BUDGET_STAGE,
  hitsByStance: Object.freeze({ 1.0: 0, 1.1: 0, 1.2: 0, 1.3: 0, 1.4: 1, 1.5: 3, 1.6: 3, 1.8: 3 }),
  trialsPerStance: 3,
  unaffectedDirections: Object.freeze(['top', 'right']),
  reliableFromMeters: 1.5,
  // What the sweep actually needs between the two of them when it arrives, and how far past the
  // body it travels when it does not get it.
  requiredSeparationAtContactMeters: 1.05,
  bladeSweepRadiusMeters: 1.10,
  overshootBeyondBodyMeters: 0.155,
  missDistanceMeters: 0.026,
  rootCause: 'the-defender-is-inside-the-sweep-arc-clamped-below-the-radius-it-passes-at',
  status: 'root-cause-established-design-decision-open',
});
