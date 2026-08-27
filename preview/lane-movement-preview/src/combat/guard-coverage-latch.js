export const GUARD_COVERAGE_LATCH_STAGE = 'R18R.2';

// R18R.2: Guard is meant to be omnidirectional, not omniscient. Two limits shape it, and each
// answers a different question:
//   reactionDelayMs - how long the defender must watch a committed swing before the shield may
//                     move at all. This is what keeps a short-warning attack unblockable; without
//                     it, "Guard covers every direction" degenerates into "Guard is invincible".
//   coveredDistanceMeters - how close the tracked shield line has to be before we call it covered.
//
// Covered does not mean "stop tracking", it means "stop relaxing". A guard plan that reports zero
// required correction is reporting that the shield is on the line *where it is now* - and where it
// is now is the tracking offset the guard spent frames earning. Feeding that zero into the
// tracking servo returns the arm to neutral, the next frame reads uncovered again, and the guard
// spends an entire exchange oscillating without ever accumulating travel. Holding the offset
// instead is both the correct servo behaviour and the honest animation: nobody drops their shield
// halfway through the swing they raised it for.
export const GUARD_COVERAGE_LATCH_PROFILE = Object.freeze({
  reactionDelayMs: 70,
  coveredDistanceMeters: 0.012,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector(input) {
  return Object.freeze({ x: finite(input?.x), y: finite(input?.y), z: finite(input?.z) });
}

function magnitude(input) {
  return Math.hypot(finite(input?.x), finite(input?.y), finite(input?.z));
}

export function createGuardCoverageState() {
  return Object.freeze({ sequence: null, observedMs: 0, covered: false });
}

function replaceCorrection(plan, correction, reason) {
  if (!plan) return null;
  const next = vector(correction);
  return Object.freeze({
    ...plan,
    appliedDistance: magnitude(next),
    correction: next,
    reason,
  });
}

export function decideGuardCoverage(state = createGuardCoverageState(), input = {}) {
  const profile = Object.freeze({ ...GUARD_COVERAGE_LATCH_PROFILE, ...(input.profile || {}) });
  const plan = input.plan || null;
  const sequence = input.sequence ?? null;
  const deltaMs = Math.max(0, finite(input.deltaMs, 1000 / 60));
  const base = sequence !== state.sequence
    ? { ...createGuardCoverageState(), sequence }
    : { ...state };
  const measuredGapMeters = input.approach
    ? Math.hypot(finite(input.approach.planeGapMeters), finite(input.approach.radialGapMeters))
    : null;
  const requiredDistance = finite(plan?.requiredDistance, 0);

  const decide = (nextState, nextPlan, reason, covered) => Object.freeze({
    state: Object.freeze(nextState),
    plan: nextPlan,
    covered,
    reacting: nextState.observedMs >= profile.reactionDelayMs,
    observedMs: nextState.observedMs,
    requiredDistance,
    measuredGapMeters,
    measuredPoint: input.approach?.planePoint || null,
    measuredWorldPoint: input.approach?.point || null,
    surfaceCenter: plan?.threat?.surface?.center || null,
    surfaceNormal: plan?.threat?.surface?.normal || null,
    engaged: Boolean(input.engaged),
    reason,
    stage: GUARD_COVERAGE_LATCH_STAGE,
    profile,
  });

  if (!input.committed) {
    return decide(
      { ...base, covered: false },
      replaceCorrection(plan, { x: 0, y: 0, z: 0 }, 'attack-not-committed'),
      'attack-not-committed',
      false,
    );
  }

  const observedMs = base.observedMs + deltaMs;
  if (observedMs < profile.reactionDelayMs) {
    return decide(
      { ...base, observedMs, covered: false },
      replaceCorrection(plan, { x: 0, y: 0, z: 0 }, 'guard-reaction-delay'),
      'guard-reaction-delay',
      false,
    );
  }

  if (plan && plan.reachable === true && requiredDistance <= profile.coveredDistanceMeters) {
    return decide(
      { ...base, observedMs, covered: true },
      replaceCorrection(plan, input.currentOffset, 'guard-holding-covered-line'),
      'guard-holding-covered-line',
      true,
    );
  }

  return decide({ ...base, observedMs, covered: false }, plan, 'guard-tracking-the-threat', false);
}

export function createGuardCoverageLatch(options = {}) {
  let state = createGuardCoverageState();
  let report = null;
  return Object.freeze({
    update(input = {}) {
      const decision = decideGuardCoverage(state, { profile: options.profile, ...input });
      state = decision.state;
      report = Object.freeze({
        stage: decision.stage,
        reason: decision.reason,
        covered: decision.covered,
        reacting: decision.reacting,
        engaged: decision.engaged,
        observedMs: decision.observedMs,
        requiredDistance: decision.requiredDistance,
        measuredGapMeters: decision.measuredGapMeters,
        measuredPoint: decision.measuredPoint,
        measuredWorldPoint: decision.measuredWorldPoint,
        surfaceCenter: decision.surfaceCenter,
        surfaceNormal: decision.surfaceNormal,
        profile: decision.profile,
        authority: 'guard-coverage-hold-no-contact-authority',
      });
      return decision.plan;
    },
    reset() {
      state = createGuardCoverageState();
      report = null;
    },
    get report() { return report; },
    get state() { return state; },
  });
}
