import { ATTACK_ADVANCE_PROFILES } from './attack-advance.js';
import { effectiveSeparationAtContact } from './engagement-spacing.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';

export const SWING_INNER_REACH_STAGE = 'R20T.2';

// R20T.2 — a swing has an inside as well as an outside.
//
// swing-threat-relevance answers "is this thrown from too far to matter". This answers the mirror
// question nobody had asked: can you be too CLOSE to be hit? For a low horizontal sweep, yes - the
// blade passes at a radius, and a body inside that radius is behind the blade rather than in front
// of it. Getting inside a sweep is a real thing about swords, so this is not a fault being papered
// over; it is a fact being made visible, because R20T.1 found it by accident and a player would
// find it as "my swing passed through nothing and I do not know why".
//
// Measured (R20T.1, guard down, still defender, n=3 per stance, blade-vs-body closest approach):
// LEFT's sweep passes 1.10m from the attacker, so it needs about 1.05m between the two of them
// when it arrives. Below that it travels up to 15.5cm beyond the body and misses the waist by
// 2.6cm; at 1.4m of starting stance the overshoot is 13.8cm and the miss is 0.9mm, which is why
// that stance came back 1/3 instead of cleanly either way.
//
// TOP and RIGHT have no inner bound inside the playable range - both connect 3/3 at the ledger's
// 0.90m clamp, which is as close as two fighters are ever allowed to be. A chop lands on whatever
// is beneath it, and RIGHT's arc is steep enough not to overshoot. Null means "measured, and there
// is none", not "unknown".
export const MEASURED_SWING_INNER_REACH_METERS = Object.freeze({
  top: null,
  right: null,
  left: 1.05,
});

// The band where LEFT cannot connect: from the closest two fighters may stand to the separation its
// sweep needs. 15cm wide, and entirely inside the space a player can walk into.
export const LEFT_INSIDE_ARC_BAND_METERS = Object.freeze({
  fromMeters: MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  toMeters: MEASURED_SWING_INNER_REACH_METERS.left,
});

// What this model is worth. It reaches the contact separation by subtracting the whole authored
// advance, and the browser says the real spend is a centimetre or so short of that - at a 1.5m
// stance it predicts 1.047m against a measured 1.058m. So a margin inside this band is a tie, and
// a tie is reported as an edge rather than as a claim the measurement does not support: 1.5m lands
// 3 times in 3, and a warning that contradicts a measured hit is worse than no warning.
export const INNER_REACH_MODEL_TOLERANCE_METERS = 0.02;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Can this swing, thrown from this separation, still be in front of the defender when it arrives?
//
// Judged against the separation AT CONTACT rather than at commitment, for the same reason the
// coverage warning is: the attacker's advance is spent during the swing, so where they start is
// not where the blade arrives from. The ledger's clamp is applied here too - an advance cannot
// carry anyone through their opponent.
export function assessSwingInnerReach(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const required = MEASURED_SWING_INNER_REACH_METERS[direction];
  const startSeparationMeters = finite(input.separationMeters, Infinity);
  const advance = ATTACK_ADVANCE_PROFILES[direction]?.metersByContact ?? 0;
  const separationAtContactMeters = Math.max(
    MINIMUM_ENGAGEMENT_SEPARATION_METERS,
    effectiveSeparationAtContact(startSeparationMeters, advance),
  );
  if (required == null) {
    return Object.freeze({
      stage: SWING_INNER_REACH_STAGE,
      direction: direction || null,
      insideArc: false,
      separationAtContactMeters,
      requiredSeparationMeters: null,
      marginMeters: null,
      // An unknown direction is treated as reaching, matching how relevance treats one: the cost
      // of a wrong "cannot reach" is a warning that lies, and this only ever informs.
      reason: direction in MEASURED_SWING_INNER_REACH_METERS ? 'no-inner-bound-measured' : 'unknown-direction',
      authority: 'presentation-warning-only-no-contact-authority',
    });
  }
  const marginMeters = separationAtContactMeters - required;
  const insideArc = marginMeters < -INNER_REACH_MODEL_TOLERANCE_METERS;
  return Object.freeze({
    stage: SWING_INNER_REACH_STAGE,
    direction,
    insideArc,
    separationAtContactMeters,
    requiredSeparationMeters: required,
    marginMeters,
    reason: insideArc
      ? 'defender-is-inside-the-sweep-arc'
      : marginMeters < 0.1 ? 'on-the-edge-of-the-sweep-arc' : 'clear-of-the-sweep-arc',
    authority: 'presentation-warning-only-no-contact-authority',
  });
}
