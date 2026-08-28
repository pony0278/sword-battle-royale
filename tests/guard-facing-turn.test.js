import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GUARD_FACING_TURN_STAGE,
  MEASURED_GUARD_FACING_TURN_RADIANS,
  GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND,
  GUARD_FACING_RETURN_RATE_RADIANS_PER_SECOND,
  planGuardFacingTurn,
  createGuardFacingTurnRuntime,
} from '../src/combat/guard-facing-turn.js';

test('R19Q.1 only an engaged chase turns the body, each direction toward its own arc', () => {
  assert.equal(GUARD_FACING_TURN_STAGE, 'R19Q.1');
  const turn = planGuardFacingTurn({ direction: 'right', engaged: true, posture: 'chase' });
  assert.equal(turn.targetRadians, MEASURED_GUARD_FACING_TURN_RADIANS.right);
  assert.ok(turn.targetRadians > 0);

  // R19Q.2: the arcs arrive on opposite sides, so the signs differ per direction - RIGHT and TOP
  // turn one way, LEFT the other. The magnitudes are each direction's measured crossing: the
  // wrong sign on TOP was measured handing every swing to the body, not merely doing nothing.
  assert.ok(MEASURED_GUARD_FACING_TURN_RADIANS.top > 0);
  assert.ok(MEASURED_GUARD_FACING_TURN_RADIANS.left < 0);
  assert.ok(MEASURED_GUARD_FACING_TURN_RADIANS.top < MEASURED_GUARD_FACING_TURN_RADIANS.right,
    'TOP stays closest to square: both its angles saturate, and the cliff is on the other sign');
  // The clang corridors were measured against an unturned body, so hold posture never turns.
  const hold = planGuardFacingTurn({ direction: 'right', engaged: true, posture: 'hold-at-neutral' });
  assert.equal(hold.targetRadians, 0);
  assert.equal(hold.reason, 'hold-posture-clang-corridors-measured-unturned');
  // And an irrelevant or interrupted swing returns the body square.
  assert.equal(planGuardFacingTurn({ direction: 'right', engaged: false, posture: 'chase' }).targetRadians, 0);
});

test('R19Q.1 the turn out-runs RIGHT and the return does not teleport', () => {
  // RIGHT's blade enters its active window about 0.2s after commitment; the turn must cover its
  // 40 degrees inside that, with margin. The return being slower is a presentation choice the
  // rates should keep honest.
  const needed = MEASURED_GUARD_FACING_TURN_RADIANS.right / GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND;
  assert.ok(needed < 0.2, `turn completes in ${needed.toFixed(3)}s, inside RIGHT's approach`);
  assert.ok(GUARD_FACING_RETURN_RATE_RADIANS_PER_SECOND < GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND);
});

test('R19Q.1 the runtime keys liveness on plan identity, not on anybody remembering to stop', () => {
  const runtime = createGuardFacingTurnRuntime();
  const plan = planGuardFacingTurn({ direction: 'right', engaged: true, posture: 'chase' });
  // Fresh plan each frame: rises toward the target at the turn rate.
  let yaw = runtime.update(plan, 0.1);
  assert.ok(yaw > 0 && yaw < MEASURED_GUARD_FACING_TURN_RADIANS.right);
  const plan2 = planGuardFacingTurn({ direction: 'right', engaged: true, posture: 'chase' });
  yaw = runtime.update(plan2, 1.0);
  assert.ok(Math.abs(yaw - MEASURED_GUARD_FACING_TURN_RADIANS.right) < 1e-9, 'saturates at the target');

  // The same plan object seen again means guard logic stopped writing - the exchange is over -
  // and the body stands back down at the slower return rate.
  const before = runtime.yawRadians;
  yaw = runtime.update(plan2, 0.1);
  assert.ok(yaw < before, 'a stale plan reads as stand-down');
  yaw = runtime.update(null, 10);
  assert.equal(yaw, 0, 'and it comes all the way home');

  runtime.update(planGuardFacingTurn({ direction: 'right', engaged: true, posture: 'chase' }), 0.05);
  runtime.reset();
  assert.equal(runtime.yawRadians, 0);
});

test('R19Q.1 orientation is locomotion state and never contact authority', async () => {
  const lane = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lane-controller.js', import.meta.url), 'utf8');
  // The integrator lives in the lane controller and applies through the scene's single yaw seam,
  // which every stance stamp re-applies - so a lane write cannot erase the turn.
  assert.match(lane, /labScene\.setDefenderYawOffset\(guardFacingTurn\.update\(guardFacingPlan, deltaSeconds\)\)/);
  assert.match(lane, /guardFacingTurn\.reset\(\)/);
  const rule = await readFile(new URL('../src/combat/guard-facing-turn.js', import.meta.url), 'utf8');
  assert.match(rule, /no-contact-authority/);
});
