import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CLOSE_RANGE_GUARD_HOLD_STAGE,
  CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS,
  planCloseRangeGuardPosture,
} from '../src/combat/close-range-guard-hold.js';
import { ATTACK_ADVANCE_PROFILES } from '../src/combat/attack-advance.js';
import { GUARD_TRACKING_TRAVEL_BUDGET_METERS } from '../src/combat/guard-tracking-envelope.js';

test('R19O.1 inside the working floor the shield holds; at it, the chase runs', () => {
  assert.equal(CLOSE_RANGE_GUARD_HOLD_STAGE, 'R19O.1');
  // TOP from 1.4m arrives at the pushbox: hold. TOP from 2.0m arrives at 1.138m - the stance
  // R19M.1 measured the chase converting 12/12 - so it must keep chasing.
  const near = planCloseRangeGuardPosture({ direction: 'top', separationMeters: 1.4 });
  assert.equal(near.posture, 'hold-at-neutral');
  assert.equal(near.predictedContactSeparationMeters, 0.9, 'the pushbox floors the prediction');

  const working = planCloseRangeGuardPosture({ direction: 'top', separationMeters: 2.0 });
  assert.equal(working.posture, 'chase');
  assert.ok(working.predictedContactSeparationMeters >= CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS);
});

test('R19O.1 the floor sits between the measured nothing and the measured 12/12', () => {
  // Chase converts no blocks below 1.1m of contact separation (0/6 at every nearer stance) and
  // first converts them at 1.14m. A floor outside that window would either hold away real blocks
  // or keep chasing where chasing was measured to do nothing.
  assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS > 0.9);
  assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS < 1.14);
  // And each direction flips exactly where its own advance says it should.
  for (const direction of ['top', 'right', 'left']) {
    const advance = ATTACK_ADVANCE_PROFILES[direction].metersByContact;
    const boundary = CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS + advance;
    assert.equal(planCloseRangeGuardPosture({ direction, separationMeters: boundary - 0.01 }).posture,
      'hold-at-neutral', `${direction} just inside its boundary`);
    assert.equal(planCloseRangeGuardPosture({ direction, separationMeters: boundary + 0.01 }).posture,
      'chase', `${direction} just outside its boundary`);
  }
});

test('R19O.1 doubt resolves to the chase, which is the behaviour every band was measured on', () => {
  assert.equal(planCloseRangeGuardPosture({ direction: 'thrust', separationMeters: 1.0 }).posture, 'chase');
  assert.equal(planCloseRangeGuardPosture({ direction: 'top' }).posture, 'chase');
});

test('R19O.1 hold stands the coverage down through the same commitment flag as relevance', async () => {
  const controller = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
  // One committed flag carries both decisions - a second path that still tracks would reintroduce
  // the lunge-away under another name. And the posture is decided per exchange, not per frame.
  assert.match(controller, /closeRangePosture\.plan\.posture !== 'hold-at-neutral'/);
  assert.match(controller, /closeRangePosture\?\.sequence !== snapshot\.sequence/);
});

test('R19O.1 the hold rationale stays anchored to the chase geometry it corrects', () => {
  // The chase budget reaching past the plane is WHY holding wins in close: if the envelope
  // shrinks below the shield-front offset someday, this coupling should force the question.
  assert.ok(GUARD_TRACKING_TRAVEL_BUDGET_METERS > 0.564,
    'the chase can out-travel the resting shield offset, which is what makes it able to lunge away');
});
