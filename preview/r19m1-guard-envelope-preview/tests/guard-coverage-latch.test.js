import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_COVERAGE_LATCH_PROFILE,
  GUARD_COVERAGE_LATCH_STAGE,
  createGuardCoverageLatch,
  createGuardCoverageState,
  decideGuardCoverage,
} from '../src/combat/guard-coverage-latch.js';

function plan(overrides = {}) {
  return Object.freeze({
    mode: 'guard',
    reachable: true,
    requiredDistance: 0.25,
    appliedDistance: 0.25,
    correction: Object.freeze({ x: 0, y: -0.25, z: 0 }),
    ...overrides,
  });
}

const committed = { committed: true, sequence: 1, deltaMs: 1000 / 60 };

test('R18R.2 suppresses the correction until the defender has watched the swing', () => {
  assert.equal(GUARD_COVERAGE_LATCH_STAGE, 'R18R.2');
  const frameMs = 1000 / 60;
  const suppressedFrames = Math.ceil(GUARD_COVERAGE_LATCH_PROFILE.reactionDelayMs / frameMs) - 1;
  assert.ok(suppressedFrames >= 1);
  let state = createGuardCoverageState();
  let decision = null;
  for (let frame = 0; frame < suppressedFrames; frame += 1) {
    decision = decideGuardCoverage(state, { ...committed, plan: plan() });
    state = decision.state;
    assert.ok(decision.observedMs < GUARD_COVERAGE_LATCH_PROFILE.reactionDelayMs);
    assert.equal(decision.reason, 'guard-reaction-delay');
    assert.equal(decision.plan.appliedDistance, 0);
    assert.deepEqual(decision.plan.correction, { x: 0, y: 0, z: 0 });
  }
  decision = decideGuardCoverage(state, { ...committed, plan: plan() });
  assert.ok(decision.observedMs >= GUARD_COVERAGE_LATCH_PROFILE.reactionDelayMs);
  assert.equal(decision.reason, 'guard-tracking-the-threat');
  assert.equal(decision.plan.appliedDistance, 0.25);
});

test('R18R.2 a fast enough attack never gets past the reaction delay', () => {
  // Contact 60ms after the swing commits: the guard is still reading it when the blade lands.
  let state = createGuardCoverageState();
  const frames = Math.floor(60 / (1000 / 60));
  for (let frame = 0; frame < frames; frame += 1) {
    const decision = decideGuardCoverage(state, { ...committed, plan: plan() });
    state = decision.state;
    assert.equal(decision.reacting, false);
    assert.equal(decision.plan.appliedDistance, 0);
  }
});

test('R18R.2 covered holds the earned offset instead of relaxing to zero', () => {
  const latch = createGuardCoverageLatch();
  const currentOffset = { x: 0, y: -0.22, z: 0.03 };
  for (let elapsedMs = 0; elapsedMs <= GUARD_COVERAGE_LATCH_PROFILE.reactionDelayMs; elapsedMs += 1000 / 60) {
    latch.update({ ...committed, plan: plan(), currentOffset });
  }
  const held = latch.update({
    ...committed,
    plan: plan({ requiredDistance: 0, appliedDistance: 0, correction: { x: 0, y: 0, z: 0 } }),
    currentOffset,
  });
  assert.equal(latch.report.reason, 'guard-holding-covered-line');
  assert.equal(latch.report.covered, true);
  assert.deepEqual(held.correction, currentOffset);
  assert.ok(Math.abs(held.appliedDistance - Math.hypot(0.22, 0.03)) < 1e-9);
});

test('R18R.2 an uncommitted or new sequence drops the guard back to neutral', () => {
  const latch = createGuardCoverageLatch();
  for (let elapsedMs = 0; elapsedMs <= 200; elapsedMs += 1000 / 60) {
    latch.update({ ...committed, plan: plan(), currentOffset: { x: 0, y: -0.2, z: 0 } });
  }
  assert.ok(latch.state.observedMs > GUARD_COVERAGE_LATCH_PROFILE.reactionDelayMs);

  const released = latch.update({ ...committed, committed: false, plan: plan() });
  assert.equal(latch.report.reason, 'attack-not-committed');
  assert.deepEqual(released.correction, { x: 0, y: 0, z: 0 });

  const fresh = latch.update({ ...committed, sequence: 2, plan: plan() });
  assert.equal(latch.report.reason, 'guard-reaction-delay');
  assert.deepEqual(fresh.correction, { x: 0, y: 0, z: 0 });
  latch.reset();
  assert.equal(latch.report, null);
  assert.deepEqual(latch.state, createGuardCoverageState());
});

test('R18R.2 reports the measured gap alongside the predicted requirement', () => {
  const latch = createGuardCoverageLatch();
  latch.update({
    ...committed,
    plan: plan(),
    approach: { planeGapMeters: 0.03, radialGapMeters: 0.04 },
    engaged: true,
  });
  assert.ok(Math.abs(latch.report.measuredGapMeters - 0.05) < 1e-9);
  assert.equal(latch.report.requiredDistance, 0.25);
  assert.equal(latch.report.engaged, true);
  assert.match(latch.report.authority, /no-contact-authority/);
});
