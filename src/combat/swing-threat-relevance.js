export const SWING_THREAT_RELEVANCE_STAGE = 'R19N.1';

// R19N.1: whether a committed swing is anybody's problem.
//
// The guard's coverage machinery engages on attack commitment and nothing else - the coverage
// director contains no reference to separation at all, and the tracking plan's own `reachable`
// flag is computed and then read only by telemetry. So an attack thrown from seven metres away
// ran the full choreography: directional anchor, wrist re-orientation, planted crouch, tracking
// servo. Measured at 5m and 7m the shield centre still travelled 9-11cm and the whole posture
// followed, for a swing that finished metres short of anything. A defender who flinches at that
// distance looks wrong because they are wrong: nothing they can be hit by is happening.
//
// The gate is built from the swing itself rather than from the coverage bands, because the bands
// describe where blocking WORKS and this must describe where the swing can TOUCH - a swing worth
// ignoring is one that cannot even graze a shield held at rest. Measured at 7m stance so nothing
// interferes, three runs per direction, spread under 3mm: the blade tip's furthest forward travel
// relative to the attacker's own start position. That number already contains the attack advance
// and the animation's visual lunge, which is what makes it the honest reach - the ledger's root
// positions alone undersell a swing whose upper body leans half a metre into the blow.
export const MEASURED_SWING_FORWARD_REACH_METERS = Object.freeze({
  top: 3.002,
  right: 2.782,
  left: 2.405,
});

// Where the defender's occupancy starts, in front of their root: the resting shield's face. Same
// stance geometry every measurement uses (defender root at +separation/2, shield held forward).
export const MEASURED_NEUTRAL_SHIELD_FRONT_OFFSET_METERS = 0.564;

// Generous on purpose, and in one direction only: guarding a swing that misses by a hand's width
// costs a flinch, standing still against one that connects costs the exchange. The margin says how
// far past the measured reach the guard still treats a swing as real.
export const SWING_RELEVANCE_MARGIN_METERS = 0.25;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// One question, answered from measurements: can this swing, thrown at this separation, reach the
// space the defender occupies? Distance-only by design - it decides whether the guard engages at
// all, not whether the block succeeds; contact authority stays with the swept probe. An unknown
// direction is treated as relevant, because the failure mode of a wrong "relevant" is a wasted
// flinch and the failure mode of a wrong "irrelevant" is standing still while being hit.
export function assessSwingThreatRelevance(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const reach = MEASURED_SWING_FORWARD_REACH_METERS[direction];
  const separationMeters = finite(input.separationMeters, NaN);
  if (!Number.isFinite(reach) || !Number.isFinite(separationMeters)) {
    return Object.freeze({
      stage: SWING_THREAT_RELEVANCE_STAGE,
      direction,
      relevant: true,
      reason: !Number.isFinite(reach) ? 'unmeasured-direction-assumed-relevant' : 'unknown-separation-assumed-relevant',
      authority: 'swing-reach-engagement-gate-no-contact-authority',
    });
  }
  const reachableSeparationMeters = reach
    + MEASURED_NEUTRAL_SHIELD_FRONT_OFFSET_METERS
    + SWING_RELEVANCE_MARGIN_METERS;
  const relevant = separationMeters <= reachableSeparationMeters;
  return Object.freeze({
    stage: SWING_THREAT_RELEVANCE_STAGE,
    direction,
    relevant,
    separationMeters,
    reachableSeparationMeters,
    shortfallMeters: relevant ? 0 : separationMeters - reachableSeparationMeters,
    reason: relevant ? 'swing-can-reach-the-defender' : 'swing-finishes-short-of-everything',
    authority: 'swing-reach-engagement-gate-no-contact-authority',
  });
}
