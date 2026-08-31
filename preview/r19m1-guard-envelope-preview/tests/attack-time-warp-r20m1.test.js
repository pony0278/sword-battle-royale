import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACK_TIME_WARPS,
  getAttackTimeWarp,
  warpSourceToRuntime,
  warpRuntimeToSource,
} from '../src/combat/attack-time-warp.js';

const left = getAttackTimeWarp('left');

test('R21B.1 warps the two swings that were measured too fast, and leaves TOP alone', () => {
  assert.ok(left, 'LEFT was the first outlier: 3972 deg/s against TOP 1651 and RIGHT 2619');
  // R21B.1: RIGHT joined it, for a different fault - see the module. TOP is the reference both
  // stretches were sized against, so warping it would move the yardstick.
  assert.ok(getAttackTimeWarp('right'), 'RIGHT peaked at 2686 deg/s and could not be parried');
  assert.equal(getAttackTimeWarp('top'), null);
  assert.equal(getAttackTimeWarp('nonsense'), null);
  assert.equal(Object.keys(ATTACK_TIME_WARPS).length, 2);
  for (const seconds of [0, 0.1, 0.26, 0.5, 1.4]) {
    assert.equal(warpSourceToRuntime(seconds, null), seconds, 'no warp is the identity, in both directions');
    assert.equal(warpRuntimeToSource(seconds, null), seconds);
  }
});

test('R20M.1 keeps the windup, stretches the burst, and resumes for the follow-through', () => {
  // Windup: untouched, so the attack's only tell keeps its authored pace.
  assert.equal(warpSourceToRuntime(0, left), 0);
  assert.equal(warpSourceToRuntime(0.1, left), 0.1);
  assert.equal(warpSourceToRuntime(0.2, left), 0.2);
  // Burst: a third speed. Contact moves 0.26 -> 0.38, which is the whole point - 380ms of read
  // time against a human reaction of about 250ms, where 260ms was not enough.
  assert.ok(Math.abs(warpSourceToRuntime(0.26, left) - 0.38) < 1e-9);
  // Follow-through: shifted by the burst's whole cost, never stretched again.
  const burstCost = (left.endSourceSeconds - left.startSourceSeconds) * (left.stretch - 1);
  assert.ok(Math.abs(warpSourceToRuntime(0.533, left) - (0.533 + burstCost)) < 1e-9);
  assert.ok(Math.abs(warpSourceToRuntime(0.533, left) - 0.7997) < 1e-3, 'the clip runs 0.533s -> ~0.80s');
});

test('R20M.1 the two clocks round-trip exactly, everywhere', () => {
  for (let source = 0; source <= 1.6; source += 0.0037) {
    const runtime = warpSourceToRuntime(source, left);
    assert.ok(Math.abs(warpRuntimeToSource(runtime, left) - source) < 1e-9, `round trip failed at ${source}`);
  }
});

test('R20M.1 never runs time backwards in either direction', () => {
  let lastRuntime = -1;
  let lastSource = -1;
  for (let t = 0; t <= 1.6; t += 0.005) {
    const runtime = warpSourceToRuntime(t, left);
    const source = warpRuntimeToSource(t, left);
    assert.ok(runtime >= lastRuntime, 'source -> runtime must be monotonic');
    assert.ok(source >= lastSource, 'runtime -> source must be monotonic');
    lastRuntime = runtime;
    lastSource = source;
  }
});

test('R20M.1 a degenerate or absent warp is the identity rather than a wrong answer', () => {
  for (const warp of [
    null, undefined, {},
    { startSourceSeconds: 0.2, endSourceSeconds: 0.2, stretch: 3 },
    { startSourceSeconds: 0.3, endSourceSeconds: 0.2, stretch: 3 },
    { startSourceSeconds: 0.2, endSourceSeconds: 0.33, stretch: 1 },
    { startSourceSeconds: 0.2, endSourceSeconds: 0.33, stretch: Number.NaN },
  ]) {
    assert.equal(warpSourceToRuntime(0.26, warp), 0.26, `${JSON.stringify(warp)} must not warp`);
    assert.equal(warpRuntimeToSource(0.26, warp), 0.26);
  }
});
