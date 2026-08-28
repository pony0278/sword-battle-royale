export const GUARD_EFFECTIVENESS_STAGE = 'R19L.2';

// R19L.1: whether holding a guard ever saves anybody.
//
// Every earlier measurement of the guard asked "does a block resolve?" - including this session's
// own close-range sweeps, which concluded the guard "works from 1.55m out and fails below". That
// question is the wrong one, and the framing survived several rounds of work before the obvious
// objection landed: at long range you do not need a block, because the attack was going to miss.
// A block against a swing that would never have connected is theatre, and counting it as a working
// guard hides the thing that matters.
//
// So this pairs the two halves at the same stance and direction: run the exchange with no defence
// chosen (R19I.1's neutral defender, nothing intercepts) to see whether the blade reaches the body
// at all, then run it again in BLOCK mode to see whether the guard stops it. The page is reloaded
// between the halves because a chosen mode cannot be un-chosen.
//
// Of twenty-seven pairs, three are a guard turning a landing hit into a block. RIGHT has none at
// any distance: where it can block, the attack was missing anyway, and where the attack lands, it
// never blocks. That is the finding.
//
// The cause is structural rather than a bad constant. Two abilities run in opposite directions
// with distance - the guard's decays as the fighters close (less reach, less time, and the arc
// starts passing outside the shield), while the attack's lethality grows - so the two bands barely
// overlap. The calibrated 2.4m stance is one crossing point of one direction, not a working band.
//
// This also retires a caution raised while investigating: guard-coverage-latch's reactionDelayMs
// exists so that "Guard covers every direction" cannot degenerate into "Guard is invincible", and
// that was offered as a reason to be careful about strengthening the guard. It is not currently
// protecting anything - the guard is nowhere near invincible - and the rule only becomes a real
// balance question once the guard works at all.
// R19L.2 re-ran all twenty-seven pairs after finding a trap in the harness that took them: the
// lab refuses setEngagementSeparation while an exchange is still resolving and returns null to say
// so, and a probe that ignores the return value cannot tell. A body hit keeps the attack runtime
// alive past the settle the first pass allowed, so from the first landed blow onward the lane
// stayed pinned at the 0.90m pushbox and every later trial silently ran there instead of at its
// nominal stance - and being pinned makes trials resolve late, which keeps it pinned. Re-measured
// with one fresh page load per trial, twenty-six of twenty-seven cells reproduced exactly. Only
// RIGHT at 1.8m moved, from a clean miss to a landing blow the guard does not answer, so the
// unanswered count is thirteen rather than twelve. The headline is unchanged.
//
// Two cautions the re-run earns. Cells near a direction's boundary are not deterministic: TOP at
// 2.2m blocks five times in six, and this table's single trial per cell recorded the one miss, so
// a cell here is one sample of a rate rather than a verdict. And R19M.1 has since widened the
// guard's travel envelope, which moves TOP's column; this table is the measurement that motivated
// that change, not a description of the code after it.
export const MEASURED_GUARD_PAIRED_TRIALS = Object.freeze([
  Object.freeze({ stanceMeters: 2.6, direction: 'top', landsUnguarded: true, blocked: true }),
  Object.freeze({ stanceMeters: 2.6, direction: 'right', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.6, direction: 'left', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.4, direction: 'top', landsUnguarded: true, blocked: true }),
  Object.freeze({ stanceMeters: 2.4, direction: 'right', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.4, direction: 'left', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.2, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 2.2, direction: 'right', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.2, direction: 'left', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 2.0, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 2.0, direction: 'right', landsUnguarded: false, blocked: false }),
  Object.freeze({ stanceMeters: 2.0, direction: 'left', landsUnguarded: false, blocked: true }),
  Object.freeze({ stanceMeters: 1.8, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.8, direction: 'right', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.8, direction: 'left', landsUnguarded: true, blocked: true }),
  Object.freeze({ stanceMeters: 1.6, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.6, direction: 'right', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.6, direction: 'left', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.4, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.4, direction: 'right', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.4, direction: 'left', landsUnguarded: false, blocked: false }),
  Object.freeze({ stanceMeters: 1.2, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.2, direction: 'right', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.2, direction: 'left', landsUnguarded: false, blocked: false }),
  Object.freeze({ stanceMeters: 1.0, direction: 'top', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.0, direction: 'right', landsUnguarded: true, blocked: false }),
  Object.freeze({ stanceMeters: 1.0, direction: 'left', landsUnguarded: false, blocked: false }),
]);

export const GUARD_EFFECTIVENESS_DIRECTIONS = Object.freeze(['top', 'right', 'left']);

function stancesWhere(direction, predicate) {
  return Object.freeze(MEASURED_GUARD_PAIRED_TRIALS
    .filter((trial) => trial.direction === direction && predicate(trial))
    .map((trial) => trial.stanceMeters)
    .sort((a, b) => a - b));
}

// Derived from the trials rather than transcribed beside them: a hand-copied band would be the
// first thing to go stale after a retune, and the bands are the whole argument.
function bandsFor(direction) {
  const lands = stancesWhere(direction, (trial) => trial.landsUnguarded);
  const blocks = stancesWhere(direction, (trial) => trial.blocked);
  const matters = stancesWhere(direction, (trial) => trial.landsUnguarded && trial.blocked);
  return Object.freeze({
    direction,
    landingStancesMeters: lands,
    blockingStancesMeters: blocks,
    // The only stances that are actually a defence: the attack would have connected and did not.
    guardMattersStancesMeters: matters,
    guardEverMatters: matters.length > 0,
  });
}

export const MEASURED_GUARD_EFFECTIVENESS = Object.freeze(
  Object.fromEntries(GUARD_EFFECTIVENESS_DIRECTIONS.map((d) => [d, bandsFor(d)])),
);

export const GUARD_EFFECTIVENESS_SUMMARY = Object.freeze({
  stage: GUARD_EFFECTIVENESS_STAGE,
  get trialCount() { return MEASURED_GUARD_PAIRED_TRIALS.length; },
  get guardMattersCount() {
    return MEASURED_GUARD_PAIRED_TRIALS.filter((t) => t.landsUnguarded && t.blocked).length;
  },
  get theatreCount() {
    return MEASURED_GUARD_PAIRED_TRIALS.filter((t) => !t.landsUnguarded && t.blocked).length;
  },
  get unansweredCount() {
    return MEASURED_GUARD_PAIRED_TRIALS.filter((t) => t.landsUnguarded && !t.blocked).length;
  },
  get directionsWithNoWorkingGuard() {
    return Object.freeze(GUARD_EFFECTIVENESS_DIRECTIONS
      .filter((d) => !MEASURED_GUARD_EFFECTIVENESS[d].guardEverMatters));
  },
  authority: 'measured-paired-effectiveness-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// What the pairing says about one stance and direction. Guidance for design work: it reports what
// was observed at the sampled stances and says so plainly when a stance was never sampled, rather
// than interpolating a binary outcome that has no meaningful midpoint.
export function assessGuardEffectiveness(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const bands = MEASURED_GUARD_EFFECTIVENESS[direction];
  if (!bands) {
    return Object.freeze({
      stage: GUARD_EFFECTIVENESS_STAGE, direction, known: false,
      reason: `unmeasured-direction-${direction || 'none'}`,
    });
  }
  const stanceMeters = Math.max(0, finite(input.stanceMeters));
  const trial = MEASURED_GUARD_PAIRED_TRIALS.find((t) => t.direction === direction
    && Math.abs(t.stanceMeters - stanceMeters) < 1e-9) || null;
  return Object.freeze({
    stage: GUARD_EFFECTIVENESS_STAGE,
    direction,
    known: Boolean(trial),
    stanceMeters,
    reason: trial ? 'sampled-stance' : 'stance-not-sampled',
    landsUnguarded: trial?.landsUnguarded ?? null,
    blocked: trial?.blocked ?? null,
    guardMatters: trial ? Boolean(trial.landsUnguarded && trial.blocked) : null,
    bands,
    authority: 'measured-paired-effectiveness-no-contact-authority',
  });
}
