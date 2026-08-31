import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PARRY_INTERCEPT_DIRECTOR_STAGE,
  createParryInterceptDirector,
} from '../src/combat/parry-intercept-director.js';

// A shield that reports a different centre on every read, so a rung that reuses an earlier read
// instead of taking its own is visible rather than merely wrong.
function harness({ activeIntent = null } = {}) {
  const calls = [];
  const reads = [];
  const readShieldSurface = () => {
    const surface = Object.freeze({
      center: Object.freeze({ x: 0, y: 1, z: 0.5 + reads.length * 0.01 }),
      normal: Object.freeze({ x: 0, y: 0, z: 1 }),
      radius: 0.26,
      thickness: 0.075,
    });
    reads.push(surface);
    return surface;
  };
  const record = (call, extra = {}) => calls.push({ call, readsSoFar: reads.length, ...extra });
  const trackingRuntime = {
    update(plan) { record('track', { plan }); return { achievedDistance: 0.02, carriedResidualOffset: { x: 0.001, y: 0, z: 0 } }; },
    refineMeasuredContact(plan, deltaSeconds, options) { record('refine', { plan, options }); return { achievedDistance: 0.005 }; },
    refineWorldTarget(targetCenter, options) { record('closure', { targetCenter, options }); return { achievedDistance: 0.003 }; },
  };
  const bodyReachRuntime = {
    update(input) { record('body', { input }); return { armExtensionRatio: 0.5 }; },
    trackWorldTarget(input) { record('bodyWorldTarget', { input }); return { armExtensionRatio: 0.9 }; },
    reset() { record('bodyReset'); },
  };
  const stanceRuntime = {
    update(input) { record('stance', { input }); return { crouchMeters: 0.01 }; },
    reset() { record('stanceReset'); },
  };
  const observed = [];
  return {
    calls,
    reads,
    observed,
    activeIntent,
    director: createParryInterceptDirector({
      trackingRuntime,
      bodyReachRuntime,
      stanceRuntime,
      readShieldSurface,
      observe: {
        primaryArm: (r) => observed.push(['primaryArm', r, calls.length]),
        residualArm: (r) => observed.push(['residualArm', r, calls.length]),
        body: (r) => observed.push(['body', r, calls.length]),
        stance: (r) => observed.push(['stance', r, calls.length]),
      },
    }),
  };
}

// A sweep that crosses close enough to the disc for the measured fallback to be in reach, so
// every rung of the ladder actually runs.
function blade(z, y = 1.0) {
  return [
    { x: 0.28, y, z },
    { x: 0.31, y: y + 0.01, z },
    { x: 0.34, y, z },
  ];
}
function exchange(overrides = {}) {
  return {
    previousBlade: blade(0.46),
    currentBlade: blade(0.50),
    deltaSeconds: 1 / 60,
    continuitySurface: null,
    predictiveAnalysis: {
      threat: {
        point: { x: 0.1, y: 0.7, z: 0.5 },
        worldPoint: { x: 0.1, y: 0.7, z: 0.4 },
        signedDistance: -0.1,
        radialDistance: 0.32,
        outsideDisc: 0.06,
        futureSeconds: 0.05,
      },
      trackingPlan: null,
    },
    ...overrides,
  };
}

test('R18S.3 the rungs run in order, each on a shield the one before it just moved', () => {
  assert.equal(PARRY_INTERCEPT_DIRECTOR_STAGE, 'R18S.3');
  const { director, calls, reads } = harness();
  director.reach(exchange());
  assert.deepEqual(calls.map((entry) => entry.call), ['track', 'refine', 'body', 'stance']);
  const at = (name) => calls.find((entry) => entry.call === name).readsSoFar;
  // The selector reads once, the primary drive gets its own read, then every rung after it
  // re-reads before measuring what is left.
  assert.ok(at('track') < at('refine'), 'the residual measures a shield the primary drive moved');
  assert.ok(at('refine') < at('body'), 'the body measures a shield the residual moved');
  assert.ok(at('body') < at('stance'), 'the stance measures a shield the body moved');
  assert.ok(reads.length >= 6);
});

test('R18S.3 every rung announces itself the instant it has written', () => {
  // The lab taps snapshot the rig at that point, so an announcement that arrives late is a tap
  // recording the wrong writer's pose.
  const { director, observed, calls } = harness();
  director.reach(exchange());
  assert.deepEqual(observed.map(([stage]) => stage), ['primaryArm', 'residualArm', 'body', 'stance']);
  for (const [stage, , callsWhenObserved] of observed) {
    const writerIndex = calls.findIndex((entry) => entry.call === (
      stage === 'primaryArm' ? 'track' : stage === 'residualArm' ? 'refine' : stage
    ));
    assert.equal(callsWhenObserved, writerIndex + 1, `${stage} must be announced with nothing written after it`);
  }
});

test('R18S.3 an armed intent wins outright and redirects the body to the latched target', () => {
  const activeIntent = { plan: { mode: 'active', correction: { x: 0.02, y: 0, z: 0 }, appliedDistance: 0.02 }, targetCenter: { x: 0.2, y: 0.8, z: 0.4 } };
  const { director, calls } = harness();
  const reached = director.reach(exchange({ activeIntent }));
  assert.equal(reached.plan, activeIntent.plan, 'the latched intent is the plan, not a candidate for one');
  assert.ok(calls.some((entry) => entry.call === 'bodyWorldTarget'));
  assert.ok(!calls.some((entry) => entry.call === 'body'), 'the body follows the target, not the nearest blade point');
  const bodyCall = calls.find((entry) => entry.call === 'bodyWorldTarget');
  assert.deepEqual(bodyCall.input.targetCenter, activeIntent.targetCenter);

  const closure = director.finalClosure({ activeIntent });
  assert.equal(closure.achievedDistance, 0.003);
  assert.deepEqual(calls.find((entry) => entry.call === 'closure').targetCenter, activeIntent.targetCenter);
  assert.deepEqual(calls.find((entry) => entry.call === 'closure').options, { jointBudgetScale: 0.6, iterations: 2 });
});

test('R18S.3 the final closure stays silent so the caller can capture between write and tap', () => {
  const activeIntent = { plan: { mode: 'active' }, targetCenter: { x: 0.2, y: 0.8, z: 0.4 } };
  const { director, observed } = harness();
  director.reach(exchange({ activeIntent }));
  const before = observed.length;
  director.finalClosure({ activeIntent });
  assert.equal(observed.length, before, 'the caller owns when this one is observed');
  assert.equal(director.finalClosure({}), null, 'no armed intent, no closure');
});

test('R18S.3 the stance gets the predicted threat as its anticipation and the arm as its evidence', () => {
  const { director, calls } = harness();
  const reached = director.reach(exchange());
  const stance = calls.find((entry) => entry.call === 'stance').input;
  assert.equal(stance.mode, 'parry');
  assert.deepEqual(stance.anticipatedClosestApproach, { point: { x: 0.1, y: 0.7, z: 0.4 } });
  assert.equal(stance.anticipatedLeadSeconds, 0.05);
  assert.equal(stance.armEvidence.extensionRatio, 0.5, 'the body reports how extended the arm already is');
  assert.equal(stance.armEvidence.correctionAchievedMeters, reached.residualRefinement.achievedDistance);
  assert.equal(stance.armEvidence.edgeGapBeforeMeters, reached.residualBeforeRefinement.radialGapMeters);
  assert.equal(stance.armEvidence.edgeGapAfterMeters, reached.residualAfterArmRefinement.radialGapMeters);
});

test('R18S.3 a stance profile passes through, and its absence does too', () => {
  const { director, calls } = harness();
  const profile = { maxCrouchMeters: 0.09 };
  director.reach(exchange({ stanceProfile: profile }));
  assert.equal(calls.find((entry) => entry.call === 'stance').input.profile, profile);
  const plain = harness();
  plain.director.reach(exchange());
  assert.equal(plain.calls.find((entry) => entry.call === 'stance').input.profile, null);
});

test('R18S.3 the outcome attributes each reduction to the rung that produced it', () => {
  const { director } = harness();
  const reached = director.reach(exchange());
  const outcome = director.measureOutcome({ ...exchange(), reached });
  assert.ok(Number.isFinite(outcome.shieldStepTranslationMeters));
  assert.equal(
    outcome.bodyEdgeReductionMeters,
    reached.residualAfterArmRefinement.radialGapMeters - reached.residualAfterBodyReach.radialGapMeters,
  );
  assert.equal(
    outcome.stanceEdgeReductionMeters,
    reached.residualAfterBodyReach.radialGapMeters - outcome.residualAfterRefinement.radialGapMeters,
  );
  // No armed intent, so there is no latched target to be near or far from.
  assert.equal(outcome.activeInterceptTargetErrorBeforeMeters, null);
  assert.equal(outcome.activeInterceptTargetErrorAfterMeters, null);
});

test('R18S.3 standing down releases the reaches rather than holding an undriven pose', () => {
  const { director, calls } = harness();
  director.standDown();
  assert.deepEqual(calls.map((entry) => entry.call), ['bodyReset', 'stanceReset']);
});

test('R18S.3 the lab keeps the analysis and the gate, and no rung of the ladder', async () => {
  const controller = await readFile(
    new URL('../src/game/pre-contact-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /createParryInterceptDirector\(\{/);
  assert.match(controller, /analyzePredictiveInterceptParry\(\{/, 'the lab still decides whether there is an opportunity');
  for (const escaped of [
    'selectReachableParryInterceptTarget',
    'residualBodyReachRuntime\\.update',
    'residualBodyReachRuntime\\.trackWorldTarget',
    'residualStanceReachRuntime\\.update',
    'fineTrackingRuntime\\.refineWorldTarget',
  ]) {
    assert.doesNotMatch(controller, new RegExp(escaped), `rung left behind in the lab: ${escaped}`);
  }
});
