import { MEASURED_GUARD_RELIABLE_CONE_DEGREES } from './guard-frontal-cone.js';

export const GUARD_CONE_GATE_STAGE = 'R19Z.1';

// R19Z.1: outside the measured cone, coverage is never committed. Stage B3's cone rule.
//
// The B2 sweep (R19X.1) measured how much facing error the shipping guard survives, and past
// each direction's reliable band the numbers do not slide to zero - they flicker (TOP blocked
// 2/4 at -110 and 3/4 at 180), because a rotated shield re-enters a centre-line chop's plane by
// geometric accident, timed by frame jitter. The B3 investigation pinned those out-of-cone
// blocks on the ACTIVE systems: with coverage disabled the same angles miss on their own. A
// defence that answers two times in four behind a turned back is worse than one that honestly
// does not - it reads as random, and randomness deciding a boundary is exactly what R19R.1
// dissected out of RIGHT@1.8.
//
// So the rule is the band, per direction rather than the universal intersection: each arc
// approaches from its own side, and LEFT's away-side fragility (the tight edge of the universal
// cone) is LEFT's own fact, not TOP's. Inside the band everything runs exactly as measured.
// Outside it the exchange is never committed to - coverage, guard turn, all of it, the same
// one-flag stand-down R19N applies to a swing that cannot reach - because the sweep measured
// the SYSTEM's tolerance with every part running, and a partial stand-down (turn without
// coverage) would be a configuration nobody measured. Whatever the resting shield still
// catches after that is passive geometry, and the depth order (R19Y.1) already polices it.
// Doubt resolves to guarding: an unmeasured direction or an unreadable error keeps the gate
// open, the same doubt-direction as R19N's relevance, because taking a defence away needs a
// measurement behind it.
export function planGuardConeGate(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const band = MEASURED_GUARD_RELIABLE_CONE_DEGREES[direction] || null;
  const errorRadians = Number(input.facingErrorRadians);
  const errorDegrees = Number.isFinite(errorRadians) ? (errorRadians * 180) / Math.PI : NaN;
  if (!band || !Number.isFinite(errorDegrees)) {
    return Object.freeze({
      stage: GUARD_CONE_GATE_STAGE,
      direction,
      engaged: true,
      facingErrorDegrees: Number.isFinite(errorDegrees) ? errorDegrees : null,
      reliableCone: band,
      reason: !band
        ? 'unmeasured-direction-doubt-resolves-to-guarding'
        : 'unreadable-facing-error-doubt-resolves-to-guarding',
      authority: 'coverage-commitment-only-no-contact-authority',
    });
  }
  // The band edges are measured angles a runtime value reaches through radian conversion, so a
  // float ulp must never be what pushes an edge reading out of its own band.
  const inside = errorDegrees >= band.fromDegrees - 1e-9 && errorDegrees <= band.toDegrees + 1e-9;
  return Object.freeze({
    stage: GUARD_CONE_GATE_STAGE,
    direction,
    engaged: inside,
    facingErrorDegrees: errorDegrees,
    reliableCone: band,
    reason: inside
      ? 'facing-error-inside-the-measured-cone'
      : 'facing-error-outside-the-measured-cone-coverage-stands-down',
    authority: 'coverage-commitment-only-no-contact-authority',
  });
}
