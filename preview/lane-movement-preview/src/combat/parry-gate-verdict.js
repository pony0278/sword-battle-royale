export const PARRY_GATE_VERDICT_STAGE = 'R19G.1';

// R19G.1: what "the parry still works" means, stated once so CI can hold it.
//
// The R19F.1 regression was invisible to 801 green unit tests: every module held its own
// constants while the composed exchange broke - TOP's parry whiffed outright at the shipping
// stance and RIGHT/LEFT released the arm in a different direction every run. The only thing that
// caught it was a hand-driven browser probe. This module is that probe's judgement turned into a
// rule, so the browser gate in CI can hold the composed behaviour the way the suite holds the
// parts.
//
// The bounds are tolerances, not targets, and their calibration matters more than their values:
// a gate that trips on healthy variance gets muted, and a muted golden rule is worse than none.
// Post-fix measurement (24+ repetitions at the calibrated 2.4m stance) shows the release carry
// repeating within +/-0.05 with ~12% of repetitions leaning up to ~40 degrees upward - all still
// reading as the correct throw. The observed failure modes were categorically different: a carry
// pointing DOWN (0.02, -0.98, 0.20), a carry reversed across the body, and run-to-run chaos.
// So each direction asserts the throw's family and forbids the observed failure classes, rather
// than pinning the healthy scatter:
//   TOP    - thrown up:      carry.y >= 0.5   (measured 0.94; worst healthy outlier 0.75)
//   RIGHT  - thrown across:  carry.x <= -0.3  (measured -0.75..-0.98; worst healthy -0.39)
//   LEFT   - thrown across:  carry.x >= 0.3   (measured 0.49..0.99)
//   sides  - never downward: carry.y >= -0.35 (the bug threw straight down at -0.98)
// Connecting at all is the hard half: the fix measured 24/24, so a single miss is a regression.
export const PARRY_GATE_EXPECTED_THROWS = Object.freeze({
  top: Object.freeze({ direction: 'top', minimumCarryY: 0.5 }),
  right: Object.freeze({ direction: 'right', maximumCarryX: -0.3, minimumCarryY: -0.35 }),
  left: Object.freeze({ direction: 'left', minimumCarryX: 0.3, minimumCarryY: -0.35 }),
});

export const PARRY_GATE_DIRECTIONS = Object.freeze(Object.keys(PARRY_GATE_EXPECTED_THROWS));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// One exchange's verdict. Judges only what the regression broke: the parry resolving at all and
// the release carry landing in its direction's family. Everything else the suite already holds.
export function judgeParryGateExchange(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const expected = PARRY_GATE_EXPECTED_THROWS[direction];
  if (!expected) {
    return Object.freeze({
      stage: PARRY_GATE_VERDICT_STAGE, direction, pass: false,
      reasons: Object.freeze([`unknown-direction-${direction || 'none'}`]),
    });
  }
  const reasons = [];
  if (String(input.outcome || '').toLowerCase() !== 'parry') {
    reasons.push(`no-parry-resolution-${input.outcome || 'none'}`);
  }
  const carry = input.carryDirection || null;
  if (!carry) {
    reasons.push('no-release-carry');
  } else {
    const x = finite(carry.x);
    const y = finite(carry.y);
    if (expected.minimumCarryY != null && y < expected.minimumCarryY) {
      reasons.push(`carry-y-${y.toFixed(2)}-below-${expected.minimumCarryY}`);
    }
    if (expected.maximumCarryX != null && x > expected.maximumCarryX) {
      reasons.push(`carry-x-${x.toFixed(2)}-above-${expected.maximumCarryX}`);
    }
    if (expected.minimumCarryX != null && x < expected.minimumCarryX) {
      reasons.push(`carry-x-${x.toFixed(2)}-below-${expected.minimumCarryX}`);
    }
  }
  return Object.freeze({
    stage: PARRY_GATE_VERDICT_STAGE,
    direction,
    pass: reasons.length === 0,
    reasons: Object.freeze(reasons),
    authority: 'ci-composition-gate-judgement-only-no-gameplay-authority',
  });
}

// The whole gate: every direction must pass. Balance numbers (advance distances, ground
// transfers, guard strength) can retune freely without tripping this - it holds only that a
// parry pressed at the prompt still connects and still throws the arm the readable way.
export function judgeParryGateRun(exchanges = []) {
  const verdicts = PARRY_GATE_DIRECTIONS.map((direction) => {
    const exchange = exchanges.find((entry) => String(entry?.direction || '').toLowerCase() === direction);
    return exchange
      ? judgeParryGateExchange(exchange)
      : judgeParryGateExchange({ direction, outcome: 'missing-exchange' });
  });
  return Object.freeze({
    stage: PARRY_GATE_VERDICT_STAGE,
    pass: verdicts.every((verdict) => verdict.pass),
    verdicts: Object.freeze(verdicts),
  });
}
