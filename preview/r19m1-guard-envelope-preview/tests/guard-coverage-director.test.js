import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GUARD_COVERAGE_DIRECTOR_STAGE,
  createGuardCoverageDirector,
} from '../src/combat/guard-coverage-director.js';

// A shield that reports a different centre on every read, so a pass that reuses an earlier read
// instead of taking its own is visible rather than merely wrong.
function shieldReads() {
  const reads = [];
  return {
    reads,
    read() {
      const surface = Object.freeze({
        center: Object.freeze({ x: 0, y: 1, z: 0.5 + reads.length * 0.01 }),
        normal: Object.freeze({ x: 0, y: 0, z: 1 }),
        radius: 0.26,
        thickness: 0.075,
      });
      reads.push(surface);
      return surface;
    },
  };
}

function harness({ refineResult = { achievedDistance: 0.01 } } = {}) {
  const calls = [];
  const shield = shieldReads();
  const trackingRuntime = {
    offset: { x: 0, y: 0, z: 0 },
    update(plan, deltaSeconds, options) {
      calls.push({ call: 'track', plan, deltaSeconds, options, readsSoFar: shield.reads.length });
      return { achievedDistance: 0.02, appliedDegrees: 3 };
    },
    refineMeasuredContact(plan, deltaSeconds, options) {
      calls.push({ call: 'refine', plan, options, readsSoFar: shield.reads.length });
      return refineResult;
    },
  };
  const stanceRuntime = {
    update(input, deltaSeconds) {
      calls.push({ call: 'stance', input, deltaSeconds, readsSoFar: shield.reads.length });
      return { crouchMeters: 0.01, mode: input.mode };
    },
  };
  return {
    calls,
    shield,
    trackingRuntime,
    stanceRuntime,
    director: createGuardCoverageDirector({
      trackingRuntime,
      stanceRuntime,
      readShieldSurface: () => shield.read(),
    }),
  };
}

// A low LEFT-like sweep that crosses close to the disc.
function blade(z, y = 0.62) {
  return [
    { x: -0.22, y, z },
    { x: 0.02, y: y + 0.02, z },
    { x: 0.26, y, z },
  ];
}
function exchange(overrides = {}) {
  return {
    sequence: 4,
    direction: 'left',
    committed: true,
    previousBlade: blade(-0.30),
    currentBlade: blade(-0.12),
    deltaSeconds: 1 / 60,
    ...overrides,
  };
}

test('R18S.2 every pass re-reads the shield, because every pass before it moved the shield', () => {
  assert.equal(GUARD_COVERAGE_DIRECTOR_STAGE, 'R18S.2');
  const { director, calls, shield } = harness();
  director.update(exchange());
  const order = calls.map((entry) => entry.call);
  assert.deepEqual(order, ['track', 'refine', 'stance'], 'aim, track, close, drop - in that order');

  // Four reads: aim before tracking, close after it, drop after that, and the final measurement
  // that reports whether the line was actually closed.
  assert.equal(shield.reads.length, 4);
  const track = calls.find((entry) => entry.call === 'track');
  const refine = calls.find((entry) => entry.call === 'refine');
  const stance = calls.find((entry) => entry.call === 'stance');
  assert.equal(track.readsSoFar, 1, 'the aim reads the neutral shield, before the arm moves');
  assert.equal(refine.readsSoFar, 2, 'the residual reads the shield the arm has already moved');
  assert.equal(stance.readsSoFar, 3, 'the stance reads the shield the residual has moved again');
});

test('R18S.2 the residual is an increment on the moved shield, at Guard budget', () => {
  const { director, calls } = harness();
  director.update(exchange());
  const refine = calls.find((entry) => entry.call === 'refine');
  assert.equal(refine.plan.mode, 'guard');
  assert.equal(refine.options.jointBudgetScale, 0.35);
  assert.equal(refine.options.maxResidualMeters, 0.08);
  assert.equal(refine.options.iterations, 2);
});

test('R18S.2 the stance is offered the arm\'s own target and the arm\'s own evidence', () => {
  const { director, calls } = harness();
  const result = director.update(exchange());
  const stance = calls.find((entry) => entry.call === 'stance');
  assert.equal(stance.input.mode, 'guard');
  assert.ok(stance.input.anticipatedClosestApproach?.point, 'crouching cannot start in the last two frames');
  assert.equal(stance.input.armEvidence.correctionAttemptedMeters, result.plan.appliedDistance);
  assert.equal(stance.input.armEvidence.correctionAchievedMeters, 0.02);
  assert.equal(result.stanceReach.mode, 'guard');
});

test('R18S.2 an uncommitted attack still runs the latch, and asks the arm for nothing', () => {
  // The reaction delay is counted by the latch, so skipping it on an uncommitted frame would let
  // the guard bank reaction time it never spent watching.
  const { director, calls } = harness();
  const result = director.update(exchange({ committed: false }));
  assert.equal(result.plan.appliedDistance, 0);
  assert.deepEqual(result.plan.correction, { x: 0, y: 0, z: 0 });
  assert.equal(result.coverage.reason, 'attack-not-committed');
  assert.equal(result.residual, null);
  assert.equal(calls.find((entry) => entry.call === 'stance').input.mode, 'off');
  assert.equal(result.coverage.trackedGapMeters, null);
});

test('R18S.2 with no previous blade there is no sweep to measure and nothing to close', () => {
  const { director, calls } = harness();
  const result = director.update(exchange({ previousBlade: null }));
  assert.equal(result.residual, null);
  assert.ok(!calls.some((entry) => entry.call === 'refine'));
  assert.equal(calls.find((entry) => entry.call === 'stance').input.closestApproach, null);
});

test('R18S.2 coverage reports the gap left after every pass, not the one it started with', () => {
  const { director } = harness();
  const result = director.update(exchange());
  assert.equal(typeof result.coverage.trackedGapMeters, 'number');
  assert.equal(typeof result.coverage.trackedPlaneGapMeters, 'number');
  assert.equal(typeof result.coverage.trackedRadialGapMeters, 'number');
  // The latch's own gap is measured against the neutral surface; these are measured after the arm,
  // the residual and the stance have all had their turn, so they can legitimately disagree.
  assert.equal(typeof result.coverage.measuredGapMeters, 'number');
  assert.equal(result.coverage.reason, 'guard-reaction-delay');
});

test('R18S.2 reset clears the reaction clock and the smoothed aim together', () => {
  const { director } = harness();
  for (let frame = 0; frame < 12; frame += 1) director.update(exchange());
  assert.ok(director.coverage.observedMs > 0);
  director.reset();
  assert.equal(director.coverage, null);
  const afterReset = director.update(exchange());
  assert.equal(afterReset.coverage.reason, 'guard-reaction-delay', 'the guard has to watch again');
});

test('R18S.2 the lab wires the director and keeps no coverage pass of its own', async () => {
  const controller = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /createGuardCoverageDirector\(\{/);
  for (const escaped of [
    'createGuardCoverageLatch',
    'createGuardCoverageTargetTracker',
    'selectGuardCoverageTarget',
    'predictGuardThreat',
    'GUARD_MODE_STANCE_REACH_PROFILE',
  ]) {
    assert.doesNotMatch(controller, new RegExp(escaped), `coverage pass left behind in the lab: ${escaped}`);
  }
});

test('R20J.1 hands the track pass the caller\'s snapTravel answer, defaulting to the servo', () => {
  const servo = harness();
  servo.director.update(exchange());
  const servoTrack = servo.calls.find((call) => call.call === 'track');
  assert.equal(servoTrack.options?.snapTravel, false, 'a guard carried into the swing keeps the travel budget');

  const placed = harness();
  placed.director.update(exchange({ snapTravel: true }));
  const placedTrack = placed.calls.find((call) => call.call === 'track');
  assert.equal(placedTrack.options?.snapTravel, true, 'a guard thrown up mid-swing places its cover');
});
