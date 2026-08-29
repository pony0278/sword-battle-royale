import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWING_DELIVERY_CONE_STAGE,
  MEASURED_ATTACK_TIMELINE_SECONDS,
  MEASURED_DELIVERY_CONE_TRIALS,
  MEASURED_STRAFE_DODGE_TRIALS,
  MEASURED_DELIVERY_RELIABLE_BAND_DEGREES,
} from '../src/combat/swing-delivery-cone.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';

test('R20A.1 the timeline is the authored one: short windups, ~0.1s active windows', () => {
  assert.equal(SWING_DELIVERY_CONE_STAGE, 'R20A.1');
  for (const direction of ['top', 'right', 'left']) {
    const t = MEASURED_ATTACK_TIMELINE_SECONDS[direction];
    // Contacts stay bound to the authored metadata - drift there must break this record.
    assert.equal(t.contact, LONGSWORD_DIRECTIONAL_ATTACKS[direction].contactSeconds);
    assert.equal(t.windup, t.activeStart);
    const active = t.activeEnd - t.activeStart;
    assert.ok(active > 0.08 && active < 0.13, `${direction} active window ~0.1s`);
    // Every degree a sidestep earns comes from the windup: the active window is a quarter of
    // TOP's windup and half of the others'.
    assert.ok(t.windup >= active * 1.5, `${direction} windup dominates`);
  }
});

test('R20A.1 past the block band the first failure mode is the body, not a whiff', () => {
  // The delivery cone mirrors the guard cone: on the shield-flank side a body-hit band sits
  // between blocking and whiffing. TOP blocks at -20, hits the body 4/4 at -25, only whiffs
  // far past; RIGHT blocks at +12 and hits at +15/+20; LEFT's flank is a cliff at two degrees.
  assert.deepEqual(MEASURED_DELIVERY_CONE_TRIALS.top['-20'], [6, 0, 0]);
  assert.deepEqual(MEASURED_DELIVERY_CONE_TRIALS.top['-25'], [0, 4, 0]);
  assert.deepEqual(MEASURED_DELIVERY_CONE_TRIALS.right['20'], [0, 2, 0]);
  assert.deepEqual(MEASURED_DELIVERY_CONE_TRIALS.left['-2'], [0, 4, 0]);
  assert.deepEqual(MEASURED_DELIVERY_CONE_TRIALS.left['0'], [2, 0, 0]);
  for (const direction of ['top', 'right', 'left']) {
    const band = MEASURED_DELIVERY_RELIABLE_BAND_DEGREES[direction];
    assert.ok(band.fromDegrees <= 0 && band.toDegrees >= 0, `${direction} band contains square`);
  }
});

test('R20A.1 today\'s sidestep is not a dodge - the named premise reversal', () => {
  // B4 was scoped as making an "absolutely effective" sidestep conditional. Measured: at 2.4m
  // every full-speed sidestep against TOP and RIGHT is still blocked; the grid's single true
  // dodge is LEFT met by a left step; and closer in, stepping mostly hands the defender's own
  // body to the arc - LEFT/left is 4/4 body hits at 1.8m and 1.6m.
  const at24 = MEASURED_STRAFE_DODGE_TRIALS['2.4'];
  assert.deepEqual(at24.top.ownLeft, [4, 0, 0]);
  assert.deepEqual(at24.top.ownRight, [4, 0, 0]);
  assert.deepEqual(at24.right.ownLeft, [4, 0, 0]);
  assert.deepEqual(at24.left.ownLeft, [0, 1, 3], 'the one true dodge, and even it is a rate');
  assert.deepEqual(MEASURED_STRAFE_DODGE_TRIALS['1.8'].left.ownLeft, [0, 4, 0]);
  assert.deepEqual(MEASURED_STRAFE_DODGE_TRIALS['1.6'].left.ownLeft, [0, 4, 0]);
  assert.deepEqual(MEASURED_STRAFE_DODGE_TRIALS['1.8'].top.ownRight, [2, 2, 0]);
});

test('R20A.1 the achievable error grows as stances close, and stays small', () => {
  // ~6 degrees at RIGHT/LEFT tempo from 2.4m, ~20 at TOP's from 1.8m: full negation by a
  // windup tracker needs only ~45-55 deg/s, which is the number B4's discussion starts from.
  assert.ok(MEASURED_STRAFE_DODGE_TRIALS['2.4'].right.errorDegrees
    < MEASURED_STRAFE_DODGE_TRIALS['1.8'].right.errorDegrees);
  assert.ok(MEASURED_STRAFE_DODGE_TRIALS['2.4'].top.errorDegrees
    < MEASURED_STRAFE_DODGE_TRIALS['1.8'].top.errorDegrees);
  for (const [stance, rows] of Object.entries(MEASURED_STRAFE_DODGE_TRIALS)) {
    for (const [direction, row] of Object.entries(rows)) {
      assert.ok(row.errorDegrees <= 20, `${direction}@${stance} error stays small`);
      const rate = row.errorDegrees / MEASURED_ATTACK_TIMELINE_SECONDS[direction].windup;
      assert.ok(rate < 60, `${direction}@${stance} full negation under 60 deg/s`);
    }
  }
});
