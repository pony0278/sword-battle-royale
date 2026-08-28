import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARRY_LUNGE_REACH_STAGE,
  PARRY_LUNGE_REACH_CALIBRATION,
  PARRY_LUNGE_TRAVEL_BUDGET_METERS,
  PARRY_LUNGE_TRACKING_SPEED_MPS,
  PARRY_LUNGE_HORIZON_SECONDS,
  PARRY_LUNGE_PROMPT_TTC_SECONDS,
  PARRY_BLADE_FIRST_FRACTION_FLOOR,
} from '../src/combat/parry-lunge-reach.js';
import { GUARD_THREAT_TRACKING_PROFILES, GUARD_THREAT_SELECTION_MODES, predictGuardThreat } from '../src/combat/guard-threat-tracking.js';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../src/combat/committed-parry-contact-gate.js';
import { ACTIVE_PARRY_INTERCEPT_INTENT_PROFILE } from '../src/combat/active-parry-intercept-intent.js';
import { REACHABLE_PARRY_INTERCEPT_PROFILE } from '../src/combat/reachable-parry-intercept-target.js';
import { PREDICTIVE_INTERCEPT_PARRY_PROFILE } from '../src/combat/predictive-intercept-parry.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';

test('R19F.1 every stage of the parry chain shares the one lunge-reach travel budget', () => {
  assert.equal(PARRY_LUNGE_REACH_STAGE, 'R19F.1');
  // Not four coincidentally-equal numbers: the same import, so a retune moves the whole chain.
  assert.equal(GUARD_THREAT_TRACKING_PROFILES.parry.maxCorrectionMeters, PARRY_LUNGE_TRAVEL_BUDGET_METERS);
  assert.equal(COMMITTED_PARRY_CONTACT_GATE_PROFILE.maxShieldTravelMeters, PARRY_LUNGE_TRAVEL_BUDGET_METERS);
  assert.equal(ACTIVE_PARRY_INTERCEPT_INTENT_PROFILE.maximumLeadMeters, PARRY_LUNGE_TRAVEL_BUDGET_METERS);
  assert.equal(REACHABLE_PARRY_INTERCEPT_PROFILE.maxCorrectionMeters, PARRY_LUNGE_TRAVEL_BUDGET_METERS);
  assert.equal(GUARD_THREAT_TRACKING_PROFILES.parry.maxTrackingSpeedMps, PARRY_LUNGE_TRACKING_SPEED_MPS);
  assert.equal(GUARD_THREAT_TRACKING_PROFILES.parry.horizonSeconds, PARRY_LUNGE_HORIZON_SECONDS);
});

test('R19F.1 the budget covers the measured journey the lunge created, with margin', () => {
  // The whiff diagnostic measured TOP needing 0.538m of shield travel at the calibrated stance;
  // the old 0.18m budget missed by 7mm every attempt. The budget must stay above the measured
  // need or TOP goes back to being unparryable at the shipping distance.
  const measured = PARRY_LUNGE_REACH_CALIBRATION.measuredRequiredTravelMeters.top;
  assert.ok(measured > 0.5, 'the measured journey is the whole reason this stage exists');
  assert.ok(PARRY_LUNGE_TRAVEL_BUDGET_METERS > measured, 'budget must cover the measured journey');
  assert.ok(PARRY_LUNGE_TRAVEL_BUDGET_METERS < 1.0, 'a budget past a metre would be a teleport, not a parry');
  // And the journey it covers is the lunge's: the largest advance is what created it.
  const largestAdvance = Math.max(...Object.values(ATTACK_ADVANCE_PROFILES).map((p) => p.metersByContact));
  assert.ok(PARRY_LUNGE_TRAVEL_BUDGET_METERS < largestAdvance + 0.18,
    'the budget answers the lunge plus the old hand correction, not an unbounded reach');
});

test('R19F.1 the prompt fires at the input window edge and the window itself is untouched', () => {
  assert.equal(PREDICTIVE_INTERCEPT_PARRY_PROFILE.normalTriggerTtcSeconds, PARRY_LUNGE_PROMPT_TTC_SECONDS);
  assert.equal(PARRY_LUNGE_PROMPT_TTC_SECONDS, COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds);
  // The player-facing legality window is the pre-lunge design and stays it: this stage
  // recalibrates what the defender's body does with an input, not when the input is legal.
  assert.equal(COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds, 0.18);
  assert.equal(COMMITTED_PARRY_CONTACT_GATE_PROFILE.latestInputTtcSeconds, 0.06);
});

test('R19F.1 blade-first selection prefers the blade proper and only parry uses it', () => {
  assert.ok(GUARD_THREAT_SELECTION_MODES.includes('blade-first'));
  assert.equal(GUARD_THREAT_TRACKING_PROFILES.parry.threatSelection, 'blade-first');
  assert.equal(GUARD_THREAT_TRACKING_PROFILES.guard.threatSelection, 'disc-distance',
    'guard keeps its own scoring - its coverage bands were measured on it');

  // Two crossings both on the shield plane: one at the hilt, one past the fraction floor.
  // plane-first is indifferent between them; blade-first must pick the blade proper.
  const surface = { center: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.26 };
  // A blade lying in the shield plane, hilt at the disc center, tip above it: every point on it
  // is a plane crossing, so selection alone decides which fraction wins.
  const previous = [{ x: 0, y: 1, z: 0.2 }, { x: 0, y: 1.45, z: 0.2 }, { x: 0, y: 1.9, z: 0.2 }];
  const current = [{ x: 0, y: 1, z: 0.1 }, { x: 0, y: 1.45, z: 0.1 }, { x: 0, y: 1.9, z: 0.1 }];
  const bladeFirst = predictGuardThreat({
    previousBlade: previous, currentBlade: current, bucklerSurface: surface,
    deltaSeconds: 1 / 60, horizonSeconds: 0.1, timeSamples: 4, selection: 'blade-first',
  });
  assert.ok(bladeFirst.bladeFraction >= PARRY_BLADE_FIRST_FRACTION_FLOOR - 1e-6,
    `blade-first should catch the blade proper, got fraction ${bladeFirst.bladeFraction}`);
});

test('R19F.1 the calibration records what was verified, at what stance', () => {
  assert.equal(PARRY_LUNGE_REACH_CALIBRATION.measuredAtSeparationMeters, 2.4);
  assert.equal(PARRY_LUNGE_REACH_CALIBRATION.verifiedConnects.top, '4/4');
  assert.equal(PARRY_LUNGE_REACH_CALIBRATION.verifiedConnects.right, '4/4');
  assert.equal(PARRY_LUNGE_REACH_CALIBRATION.verifiedConnects.left, '4/4');
  assert.ok(Object.isFrozen(PARRY_LUNGE_REACH_CALIBRATION));
});
