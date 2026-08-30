import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INNER_REACH_MODEL_TOLERANCE_METERS,
  LEFT_INSIDE_ARC_BAND_METERS,
  MEASURED_SWING_INNER_REACH_METERS,
  assessSwingInnerReach,
} from '../src/combat/swing-inner-reach.js';
import { MEASURED_LEFT_CLOSE_RANGE_BODY_REACH } from '../src/combat/orbit-steering-budget.js';
import { MINIMUM_ENGAGEMENT_SEPARATION_METERS } from '../src/combat/lane-locomotion.js';

// R20T.2 - a swing has an inside as well as an outside. This is the warning, not the rule: the
// geometry already decides the outcome and always did; what was missing was any way for a player
// to know why their swing passed through nobody.

test('R20T.2 the inner bound reproduces the stances that were actually measured', () => {
  // The model has to agree with the browser, cell for cell, or it is a story rather than a warning.
  for (const [stance, hits] of Object.entries(MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.hitsByStance)) {
    const assessment = assessSwingInnerReach({ direction: 'left', separationMeters: Number(stance) });
    const landed = hits === MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.trialsPerStance;
    if (landed) assert.equal(assessment.insideArc, false, `LEFT lands 3/3 at ${stance}m, so it must not be called inside`);
    if (hits === 0) assert.equal(assessment.insideArc, true, `LEFT misses 3/3 at ${stance}m, so it must be called inside`);
  }
  // The coin-flip stance is the one the model puts nearest its own edge.
  const flip = assessSwingInnerReach({ direction: 'left', separationMeters: 1.4 });
  assert.ok(Math.abs(flip.marginMeters) < 0.11, `1.4m is the boundary, margin ${flip.marginMeters}`);
  // And the stance that lands 3/3 must never be called a miss: the model reaches the contact
  // separation by spending the whole authored advance, which runs about a centimetre pessimistic,
  // so a margin inside its stated tolerance is reported as an edge rather than as a verdict.
  const lands = assessSwingInnerReach({ direction: 'left', separationMeters: 1.5 });
  assert.equal(lands.insideArc, false);
  assert.equal(lands.reason, 'on-the-edge-of-the-sweep-arc');
  assert.ok(Math.abs(lands.marginMeters) < INNER_REACH_MODEL_TOLERANCE_METERS);
});

test('R20T.2 it judges the separation at contact, not at commitment', () => {
  // The attacker spends their advance during the swing, so where they start is not where the blade
  // arrives from - and the clamp means an advance cannot carry anyone through their opponent.
  const far = assessSwingInnerReach({ direction: 'left', separationMeters: 1.4 });
  assert.ok(far.separationAtContactMeters < 1.4);
  assert.ok(far.separationAtContactMeters >= MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  const nose = assessSwingInnerReach({ direction: 'left', separationMeters: 0.5 });
  assert.equal(nose.separationAtContactMeters, MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  assert.equal(nose.insideArc, true);
});

test('R20T.2 null means measured-and-there-is-none, not unknown', () => {
  // TOP and RIGHT connect 3/3 at the closest two fighters may ever stand, so they have no inner
  // bound in the playable range - and the report says which of those two things it means.
  for (const direction of MEASURED_LEFT_CLOSE_RANGE_BODY_REACH.unaffectedDirections) {
    assert.equal(MEASURED_SWING_INNER_REACH_METERS[direction], null);
    const assessment = assessSwingInnerReach({ direction, separationMeters: MINIMUM_ENGAGEMENT_SEPARATION_METERS });
    assert.equal(assessment.insideArc, false);
    assert.equal(assessment.reason, 'no-inner-bound-measured');
  }
  const unknown = assessSwingInnerReach({ direction: 'thrust', separationMeters: 1 });
  assert.equal(unknown.reason, 'unknown-direction');
  assert.equal(unknown.insideArc, false, 'a warning that lies is worse than no warning');
});

test('R20T.2 the band is entirely inside walkable space, which is why it needs saying', () => {
  assert.equal(LEFT_INSIDE_ARC_BAND_METERS.fromMeters, MINIMUM_ENGAGEMENT_SEPARATION_METERS);
  assert.equal(LEFT_INSIDE_ARC_BAND_METERS.toMeters, MEASURED_SWING_INNER_REACH_METERS.left);
  assert.ok(LEFT_INSIDE_ARC_BAND_METERS.toMeters > LEFT_INSIDE_ARC_BAND_METERS.fromMeters);
});

test('R20T.2 it warns and nothing else - contact authority never moves', () => {
  const source = readFileSync(new URL('../src/combat/swing-inner-reach.js', import.meta.url), 'utf8');
  assert.match(source, /authority: 'presentation-warning-only-no-contact-authority'/);
  // No blade, no probe, no gate: this module may not be able to change an outcome even by mistake.
  assert.doesNotMatch(source, /probe|contact:\s*true|parryGate|resolveContact/);
  // The lab reads it beside relevance - the same question about the other end of the same swing.
  const preContact = readFileSync(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
  assert.ok(preContact.indexOf('exchangeState.latestSwingRelevance') < preContact.indexOf('exchangeState.latestSwingInnerReach'));
  // And says it where a player is already looking for whether a blade met anything.
  const labUi = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  assert.match(labUi, /swingInnerReach\?\.insideArc === true/);
  assert.match(labUi, /hudContact\.textContent = `\$\{contactGeometry/);
});
