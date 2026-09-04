import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../src/combat/committed-parry-contact-gate.js';
import {
  ATTACK_TIME_WARPS,
  getAttackTimeWarp,
  warpSourceToRuntime,
  warpRuntimeToSource,
  LEFT_SECOND_PASS_REFERENCES,
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
  // Windup: keeps its authored pace, which is the attack's only tell. R21K.1 took the last 20ms
  // of it - the warp starts at 0.18 now, not 0.20 - to buy contact time without stretching the
  // burst further; everything before that is still the identity.
  assert.equal(warpSourceToRuntime(0, left), 0);
  assert.equal(warpSourceToRuntime(0.1, left), 0.1);
  assert.equal(warpSourceToRuntime(0.17, left), 0.17);
  assert.equal(left.startSourceSeconds, 0.18);
  // Burst: near enough a third speed. Contact moved 0.26 -> 0.38 here, and R21K.1 moved it again
  // to 0.43 - see LEFT_SECOND_PASS_REFERENCES for the press it was measured against.
  assert.ok(Math.abs(warpSourceToRuntime(0.26, left) - 0.43) < 1e-9);
  // Follow-through: shifted by the burst's whole cost, never stretched again.
  const burstCost = (left.endSourceSeconds - left.startSourceSeconds) * (left.stretch - 1);
  assert.ok(Math.abs(warpSourceToRuntime(0.533, left) - (0.533 + burstCost)) < 1e-9);
  // R21O.3 narrowed the region to [0.18, 0.22], so the follow-through leaves the stretch with the
  // blade's arrival and the clip shortens from ~0.86s to ~0.70s. Contact does not move.
  assert.ok(Math.abs(warpSourceToRuntime(0.533, left) - 0.703) < 1e-3, 'the clip runs 0.533s -> ~0.70s');
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

test('R21K.1 LEFT reaches the answerable window by moving its start, not its stretch', () => {
  const left = getAttackTimeWarp('left');
  const refs = LEFT_SECOND_PASS_REFERENCES;
  assert.equal(left.startSourceSeconds, refs.startSourceSecondsAfter);
  // R21O.3 raised the stretch past what R21K.1 chose, to hold contact at 0.43 while the region
  // narrows. R21K.1's own reasoning below is why that is a cost and not a free change.
  assert.equal(left.stretch, 5.25);
  assert.ok(left.stretch > refs.stretchAfter);
  // Contact lands where RIGHT's now does, and exactly - 0.18 + 0.08 * 3.125.
  assert.ok(Math.abs(warpSourceToRuntime(0.26, left) - refs.runtimeContactSecondsAfter) < 1e-9);

  // The reason the stretch was not simply raised. These clips are baked at 30fps, and LEFT was
  // already stretched three times: each authored key spanned 100ms - six whole frames the blade
  // crosses at a constant rate. Reaching the same contact by stretch alone needs 3.833, which
  // makes every key 128ms and fixes the timing by making the swing step.
  const keyMs = (stretch) => Math.round(refs.authoredKeySeconds * stretch * 1000);
  assert.equal(keyMs(refs.stretchBefore), refs.keySpanMsBefore);
  assert.equal(keyMs(refs.stretchIfRaisedAlone), refs.keySpanMsIfStretchedAlone);
  assert.equal(keyMs(refs.stretchAfter), refs.keySpanMsAfter);
  assert.ok(refs.keySpanMsAfter - refs.keySpanMsBefore < 10, 'the stepping is barely touched');
  assert.ok(refs.keySpanMsIfStretchedAlone - refs.keySpanMsBefore > 25, 'where the other route was not');

  // R21O.3 pays exactly the price this test was written to refuse: at 5.25 an authored key spans
  // 175ms, which is 71ms past R21K.1's baseline where 25ms was already called stepping. It is
  // recorded rather than argued away, and it was measured rather than assumed - driving the built
  // page at 2x, LEFT's blade never stalls (nothing under 60 deg/s for more than 24ms), so the
  // steps read as plateaus rather than as held frames. What the narrow region does cost is the
  // exit: the blade leaves the stretch at 305 deg/s and reaches 2001 within about 60ms, against
  // TOP's 307 -> 1166. That acceleration is the thing to judge by eye, not the key span.
  assert.equal(keyMs(left.stretch), 175);
  assert.ok(keyMs(left.stretch) - refs.keySpanMsBefore > 25, 'R21O.3 knowingly reintroduces stepping');

  // What it cost: 20ms of windup that R20M.1 kept at authored pace on purpose. Everything before
  // that is still the tell.
  assert.ok(Math.abs((refs.startSourceSecondsBefore - refs.startSourceSecondsAfter) - 0.02) < 1e-9);
  assert.equal(warpSourceToRuntime(0.17, left), 0.17);
});

test('R21K.1 the window LEFT moved to is the one a player already lands presses in', () => {
  const refs = LEFT_SECOND_PASS_REFERENCES;
  const window = COMMITTED_PARRY_CONTACT_GATE_PROFILE;
  const closesBefore = (refs.runtimeContactSecondsBefore - window.latestInputTtcSeconds) * 1000;
  const closesAfter = (refs.runtimeContactSecondsAfter - window.latestInputTtcSeconds) * 1000;
  // It closed 13ms before the press it was meant to catch, which is the whole fault.
  assert.equal(Math.round(refs.playerMedianPressMsAfterSwingStart - closesBefore), refs.msLate);
  assert.ok(refs.playerMedianPressMsAfterSwingStart < closesAfter, 'and now it does not');
  // RIGHT is the evidence that this placement works, not a hope about it.
  const right = refs.rightAfterItsOwnRetime;
  assert.ok(right.inside / right.of > 0.75, 'RIGHT lands 15 of 19 presses inside the same window');
  assert.ok(right.parried / right.swings > 0.5);
  assert.ok(refs.pressesInsideWindowBefore.inside / refs.pressesInsideWindowBefore.of < 0.3, 'LEFT landed 5 of 18');
});
