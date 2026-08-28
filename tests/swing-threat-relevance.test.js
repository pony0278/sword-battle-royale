import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SWING_THREAT_RELEVANCE_STAGE,
  MEASURED_SWING_FORWARD_REACH_METERS,
  MEASURED_NEUTRAL_SHIELD_FRONT_OFFSET_METERS,
  SWING_RELEVANCE_MARGIN_METERS,
  assessSwingThreatRelevance,
} from '../src/combat/swing-threat-relevance.js';

test('R19N.1 a swing thrown from seven metres is nobody\'s problem', () => {
  assert.equal(SWING_THREAT_RELEVANCE_STAGE, 'R19N.1');
  for (const direction of ['top', 'right', 'left']) {
    const far = assessSwingThreatRelevance({ direction, separationMeters: 7 });
    assert.equal(far.relevant, false, `${direction} at 7m must be ignored`);
    assert.equal(far.reason, 'swing-finishes-short-of-everything');
    assert.ok(far.shortfallMeters > 2, `${direction} misses by metres, not centimetres`);

    // Every stance the paired-effectiveness table ever measured stays engaged: the gate exists to
    // remove the theatre at range, not to shave the band where blocking is real.
    for (const stance of [1.0, 1.8, 2.4, 2.6]) {
      assert.equal(assessSwingThreatRelevance({ direction, separationMeters: stance }).relevant, true,
        `${direction} at ${stance}m is a real exchange`);
    }
  }
});

test('R19N.1 the boundary is the measured reach plus the resting shield plus the margin', () => {
  const top = MEASURED_SWING_FORWARD_REACH_METERS.top
    + MEASURED_NEUTRAL_SHIELD_FRONT_OFFSET_METERS
    + SWING_RELEVANCE_MARGIN_METERS;
  assert.equal(assessSwingThreatRelevance({ direction: 'top', separationMeters: top - 0.01 }).relevant, true);
  assert.equal(assessSwingThreatRelevance({ direction: 'top', separationMeters: top + 0.01 }).relevant, false);
  // TOP reaches furthest, LEFT shortest - the same ordering every reach measurement has produced.
  assert.ok(MEASURED_SWING_FORWARD_REACH_METERS.top > MEASURED_SWING_FORWARD_REACH_METERS.right);
  assert.ok(MEASURED_SWING_FORWARD_REACH_METERS.right > MEASURED_SWING_FORWARD_REACH_METERS.left);
});

test('R19N.1 doubt resolves to guarding, never to standing still', () => {
  // A wrong "relevant" is a wasted flinch; a wrong "irrelevant" is being hit while idle. Unknown
  // direction and unknown separation must both fail toward the flinch.
  assert.equal(assessSwingThreatRelevance({ direction: 'thrust', separationMeters: 9 }).relevant, true);
  assert.equal(assessSwingThreatRelevance({ direction: 'top' }).relevant, true);
  assert.equal(assessSwingThreatRelevance({}).relevant, true);
});

test('R19N.1 the gate sits on coverage commitment, and irrelevance is never a contact decision', async () => {
  const controller = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
  // The director must see one committed flag that already contains relevance - a second path that
  // tracks anyway would reintroduce the flinch under another name.
  assert.match(controller, /committed: engaged,/);
  assert.match(controller, /relevance\.relevant/);
  const rule = await readFile(new URL('../src/combat/swing-threat-relevance.js', import.meta.url), 'utf8');
  assert.match(rule, /no-contact-authority/);
});
