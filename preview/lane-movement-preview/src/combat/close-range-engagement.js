import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from './lane-locomotion.js';

export const CLOSE_RANGE_ENGAGEMENT_STAGE = 'R19J.2';

// R19J.2: what actually happens when the two of them are close, measured rather than assumed.
//
// The question that prompted this was "at very close range the attack passes through the defender
// - should there be a personal-space radius, or should a swing become a shove?".
//
// R19J.1 answered it with the opposite of the truth, and the reason is worth more than the numbers
// were. It read `latestBodyHit` and treated any non-null value as a strike. That field holds the
// NEAREST body reading of the exchange, and body-hurtbox stores near-misses in it too - only
// `contact === true` means the blade actually landed. So the first sweep recorded, for each
// separation, where the blade came closest while sweeping PAST the body, which is the tip; the
// resulting curve said the strike lands mid-blade everywhere and rises to the tip at range. It
// also recorded a "strike" on TOP at 2.4m, a separation the previously measured body reach says
// TOP cannot cover - the contradiction that gave it away. The trap is easy to fall into from the
// debug facade, where the field is simply called latestBodyHit, so it is named here.
//
// Method, corrected: the defender is left in R19I.1's neutral stance so nothing intercepts, one
// attack per direction is fired from each starting distance, and the frame where the probe reports
// `contact === true` is the one recorded - its blade fraction, its band, and the separation the
// ledger reports at that moment, which is after the attack advance has been spent rather than
// before. Fraction 0 is the blade base at the guard and 1 is the tip (lab-geometry samples the
// sword as [bladeBase, bladeMid, tip], checked rather than assumed). Two runs, near-identical.
//
// The bands are read off the defender's bones, so these describe striking someone standing
// relaxed. A guarding defender crouches and its bands sit lower; that case is the coverage work
// in engagement-spacing, not this.
export const MEASURED_BODY_STRIKE_BLADE_FRACTION = Object.freeze({
  top: Object.freeze([
    Object.freeze({ contactSeparationMeters: 0.90, bladeFraction: 0, band: 'chest' }),
    Object.freeze({ contactSeparationMeters: 0.94, bladeFraction: 0.02, band: 'chest' }),
    Object.freeze({ contactSeparationMeters: 1.14, bladeFraction: 0.20, band: 'chest' }),
    Object.freeze({ contactSeparationMeters: 1.54, bladeFraction: 0.59, band: 'chest' }),
  ]),
  right: Object.freeze([
    Object.freeze({ contactSeparationMeters: 0.90, bladeFraction: 0, band: 'chest' }),
    Object.freeze({ contactSeparationMeters: 0.94, bladeFraction: 0, band: 'chest' }),
    Object.freeze({ contactSeparationMeters: 1.14, bladeFraction: 0.13, band: 'chest' }),
  ]),
  left: Object.freeze([
    Object.freeze({ contactSeparationMeters: 1.15, bladeFraction: 0.16, band: 'waist' }),
    Object.freeze({ contactSeparationMeters: 1.35, bladeFraction: 0.20, band: 'waist' }),
  ]),
});

// LEFT is the direction with no close-range strike at all: from every start at or below 1.4m it
// passes the standing defender by 0.8 to 4.1 centimetres without landing. It is the low sweep, and
// a body standing upright is simply not where it travels. Recorded because "misses by a
// centimetre, repeatably" is a different design problem from "hits weakly", and the two would be
// solved differently.
export const MEASURED_CLOSE_RANGE_MISS_GAPS_METERS = Object.freeze({
  left: Object.freeze([0.008, 0.010, 0.014, 0.015, 0.017, 0.022, 0.023, 0.041]),
  authority: 'measured-near-miss-gaps-standing-defender',
});

// The other half of the same sweep, with the guard up: where on the blade the shield catches. It
// slides toward the base as the fighters close, and below the working floor it stops catching at
// all. This half came from `latestContact` on a resolved block, so it was never exposed to the
// near-miss trap above.
export const MEASURED_SHIELD_CATCH_BLADE_FRACTION = Object.freeze({
  top: Object.freeze([
    Object.freeze({ contactSeparationMeters: 1.66, bladeFraction: 0 }),
    Object.freeze({ contactSeparationMeters: 1.86, bladeFraction: 0.08 }),
    Object.freeze({ contactSeparationMeters: 2.06, bladeFraction: 0.27 }),
    Object.freeze({ contactSeparationMeters: 2.26, bladeFraction: 0.47 }),
  ]),
  right: Object.freeze([
    Object.freeze({ contactSeparationMeters: 1.86, bladeFraction: 0 }),
    Object.freeze({ contactSeparationMeters: 2.06, bladeFraction: 0.33 }),
    Object.freeze({ contactSeparationMeters: 2.26, bladeFraction: 0.5 }),
  ]),
  left: Object.freeze([
    Object.freeze({ contactSeparationMeters: 1.66, bladeFraction: 0 }),
    Object.freeze({ contactSeparationMeters: 1.86, bladeFraction: 0.23 }),
    Object.freeze({ contactSeparationMeters: 2.06, bladeFraction: 0.34 }),
    Object.freeze({ contactSeparationMeters: 2.26, bladeFraction: 0.58 }),
  ]),
});

// Below this the guard does not intercept at all: nine of nine attempts across the three
// directions resolved with no block and reached the body. It corroborates the band already
// recorded in engagement-spacing (RIGHT blocks 0 of 12 at 1.40m) from the other side.
export const MEASURED_GUARD_WORKING_FLOOR_METERS = 1.55;

// The gap is the finding, and it is computed rather than transcribed so that moving either end
// moves it: every separation between the body pushbox and the guard's working floor is one the
// attack reaches and the defence does not exist in.
export const UNDEFENDED_CLOSE_RANGE_BAND_METERS = Object.freeze({
  minimum: MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  maximum: MEASURED_GUARD_WORKING_FLOOR_METERS,
  get widthMeters() {
    return MEASURED_GUARD_WORKING_FLOOR_METERS - MINIMUM_ENGAGEMENT_SEPARATION_METERS;
  },
  authority: 'measured-close-range-gap-no-contact-authority',
});

// What the corrected sweep says about the two proposals that prompted it. R19J.1 recorded the
// first of these as refuted; the corrected data supports it, and the reversal is kept in view
// rather than quietly replaced.
export const CLOSE_RANGE_FINDINGS = Object.freeze({
  hiltStrikeRule: Object.freeze({
    proposal: 'a swing that connects near the hilt should not cut, as in Mount & Blade or Mordhau',
    verdict: 'supported',
    evidence: 'TOP and RIGHT strike at fraction 0 - the blade base - at the 0.9m pushbox, rising '
      + 'past 0.5 only around 1.5m of contact separation',
    supersedes: 'R19J.1 recorded this as refuted from near-miss data read as strikes',
  }),
  raisedPushboxFloor: Object.freeze({
    proposal: 'raise the body pushbox to the guard working floor so close range cannot happen',
    verdict: 'still rejected',
    evidence: 'the degenerate strike is a weapon property that a per-weapon effective range can '
      + 'express directly; encoding it as body size would misprice every future weapon, and a '
      + 'polearm needs the opposite floor from a dagger',
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Linear read of a measured curve, clamped to its ends rather than extrapolated: outside the
// sampled range the honest answer is the nearest thing actually observed.
function interpolate(samples, separationMeters) {
  if (!samples?.length) return null;
  const at = finite(separationMeters, samples[0].contactSeparationMeters);
  if (at <= samples[0].contactSeparationMeters) return samples[0].bladeFraction;
  const last = samples[samples.length - 1];
  if (at >= last.contactSeparationMeters) return last.bladeFraction;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (at <= current.contactSeparationMeters) {
      const span = current.contactSeparationMeters - previous.contactSeparationMeters;
      const alpha = span > 1e-9 ? (at - previous.contactSeparationMeters) / span : 0;
      return previous.bladeFraction + (current.bladeFraction - previous.bladeFraction) * alpha;
    }
  }
  return last.bladeFraction;
}

// What the measurement says about one separation. Guidance for design work and diagnostics; it
// decides nothing about a live exchange, which the swept probe still owns outright.
export function assessCloseRangeEngagement(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const samples = MEASURED_BODY_STRIKE_BLADE_FRACTION[direction];
  if (!samples) {
    return Object.freeze({
      stage: CLOSE_RANGE_ENGAGEMENT_STAGE,
      direction,
      known: false,
      reason: `unmeasured-direction-${direction || 'none'}`,
    });
  }
  const separationMeters = Math.max(0, finite(input.separationMeters));
  return Object.freeze({
    stage: CLOSE_RANGE_ENGAGEMENT_STAGE,
    direction,
    known: true,
    separationMeters,
    insideGuardWorkingRange: separationMeters >= MEASURED_GUARD_WORKING_FLOOR_METERS,
    // Inside this band the defence does not exist yet; that is a gap in the design rather than a
    // property of the attack, and naming it that way is the point of this report.
    insideUndefendedBand: separationMeters >= UNDEFENDED_CLOSE_RANGE_BAND_METERS.minimum
      && separationMeters < UNDEFENDED_CLOSE_RANGE_BAND_METERS.maximum,
    expectedBodyStrikeBladeFraction: interpolate(samples, separationMeters),
    expectedShieldCatchBladeFraction: interpolate(
      MEASURED_SHIELD_CATCH_BLADE_FRACTION[direction],
      separationMeters,
    ),
    authority: 'measured-geometry-guidance-only-no-contact-authority',
  });
}
