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
  assert.equal(CLOSE_RANGE_GUARD_HOLD_STAGE, 'R20E.1');
  // TOP from 1.4m arrives at the pushbox: hold. TOP from 2.0m arrives at 1.138m - the stance
  // R19M.1 measured the chase converting 12/12 - so it must keep chasing.
  const near = planCloseRangeGuardPosture({ direction: 'top', separationMeters: 1.4 });
  assert.equal(near.posture, 'hold-at-neutral');
  assert.equal(near.predictedContactSeparationMeters, 0.9, 'the pushbox floors the prediction');

  const working = planCloseRangeGuardPosture({ direction: 'top', separationMeters: 2.0 });
  assert.equal(working.posture, 'chase');
  assert.ok(working.predictedContactSeparationMeters >= CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS.top);
});

test('R19R.1 RIGHT\'s knife-edge belongs to the clang, and the boundary cells around it stay put', () => {
  // The 1.8m stance (contact 1.137m) was dissected before it moved: no static angle blocks it,
  // the coin flip was frame jitter timing a rotating shield, and the clang answers it 8/8. The
  // floor that hands it over is RIGHT's alone - TOP at 2.0m and LEFT at 1.6m sit centimetres
  // from these boundaries on the chase side, and both are 8/8 under their measured turns.
  assert.equal(planCloseRangeGuardPosture({ direction: 'right', separationMeters: 1.8 }).posture,
    'hold-at-neutral');
  assert.equal(planCloseRangeGuardPosture({ direction: 'top', separationMeters: 2.0 }).posture, 'chase');
  assert.equal(planCloseRangeGuardPosture({ direction: 'left', separationMeters: 1.6 }).posture, 'chase');
  assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS.right > CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS.top,
    'only RIGHT surrenders extra ground to the hold');
});

test('R20E.1 the crack between the mechanisms belongs to the hold', () => {
  // 1.9m and 2.0m blocked 1/4 and 5/8 under the chase - dragged low-left by the flourish,
  // six centimetres short at the crossing - and 8/8 each under the hold. 2.1m chases at 4/4.
  assert.equal(planCloseRangeGuardPosture({ direction: 'right', separationMeters: 1.9 }).posture,
    'hold-at-neutral');
  assert.equal(planCloseRangeGuardPosture({ direction: 'right', separationMeters: 2.0 }).posture,
    'hold-at-neutral');
  assert.equal(planCloseRangeGuardPosture({ direction: 'right', separationMeters: 2.1 }).posture, 'chase');
});

test('R19O.1 the floor sits between the measured nothing and the measured 12/12', () => {
  // Chase converts no blocks below 1.1m of contact separation (0/6 at every nearer stance) and
  // first converts them at 1.14m. TOP and LEFT keep the floor in that window; RIGHT's sits above
  // it because its 1.14m cell was measured to belong to the clang, not the chase.
  for (const direction of ['top', 'left']) {
    assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS[direction] > 0.9, direction);
    assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS[direction] <= 1.2, direction);
  }
  // RIGHT's floor sits higher twice over - R19R.1 for the clang cell, R20E.1 for the crack
  // above it - and stays under 2.1m's contact separation so the healthy chase keeps its band.
  assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS.right > 0.9);
  assert.ok(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS.right < 2.1 - ATTACK_ADVANCE_PROFILES.right.metersByContact);
  // And each direction flips exactly where its own advance and its own floor say it should.
  for (const direction of ['top', 'right', 'left']) {
    const advance = ATTACK_ADVANCE_PROFILES[direction].metersByContact;
    const boundary = CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS[direction] + advance;
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
    new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
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
