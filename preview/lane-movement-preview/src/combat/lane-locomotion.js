export const LANE_LOCOMOTION_STAGE = 'R19A.1';

// R19A.1: a fighter walking up and down the lane under their own control.
//
// One axis only, deliberately. Every measurement this combat set rests on - the coverage bands,
// the undefended reach, the ground ledger - was taken along a single line between two fighters
// facing each other. Adding sideways movement invalidates all of it at once, because a shield that
// covers a direction at one angle covers something else at another. The lane comes first, gets
// verified, and only then earns the right to become a plane.
//
// On the speeds: there is no authored walk to copy. KayKit's locomotion clips are all in place -
// every Walking_* and Running_* clip has zero net root travel, and their motion lives in bone
// rotation rather than translation, so there is no stride to read off without full forward
// kinematics. The one authored fact available is Dodge_Backward, which carries real root motion:
// 0.650m in 0.40s, or 1.62 m/s. That is a burst, not a walk, so it stands as the ceiling this sits
// under rather than the number itself.
//
// Backward is slower than forward because backpedalling is, and because it is the direction that
// pays off the ground an attacker's step takes: a defender who retreats as fast as an attacker
// advances can never be pressured, and pressure is the whole point of the ledger.
export const LANE_LOCOMOTION_PROFILE = Object.freeze({
  forwardSpeedMps: 1.0,
  backwardSpeedMps: 0.75,
  // Measured against Dodge_Backward, the fastest authored travel this character has. A walk that
  // matched or beat its own dodge would make the dodge pointless.
  authoredBurstCeilingMps: 1.62,
  authority: 'lane-locomotion-only-no-contact-authority',
});

// How close the two of them may get. Below this they are standing inside one another, and every
// contact measurement stops meaning anything - the swept probe would be resolving a blade against
// a shield it started behind.
export const MINIMUM_ENGAGEMENT_SEPARATION_METERS = 0.9;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function zeroed(value) {
  return value === 0 ? 0 : value;
}

// -1 closes the distance, +1 opens it, anything else is standing still. Deliberately not a
// continuous axis: this is keyboard input, and pretending otherwise would invite a speed that
// depends on how an input device happens to report itself.
export function normalizeLaneIntent(intent) {
  const value = finite(intent);
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

// Returns the distance this fighter travels this frame, and refuses to hand back a step that would
// take them through their opponent. The clamp is reported rather than silent, because a defender
// pinned against the minimum is in the most interesting situation the ledger can produce and the
// caller will want to say so.
export function planLaneStep(input = {}) {
  const profile = Object.freeze({ ...LANE_LOCOMOTION_PROFILE, ...(input.profile || {}) });
  const intent = normalizeLaneIntent(input.intent);
  const deltaSeconds = Math.max(0, finite(input.deltaSeconds));
  const separationMeters = finite(input.separationMeters, Infinity);
  const minimumSeparationMeters = Math.max(0, finite(
    input.minimumSeparationMeters,
    MINIMUM_ENGAGEMENT_SEPARATION_METERS,
  ));

  const speed = intent > 0 ? profile.backwardSpeedMps : profile.forwardSpeedMps;
  // `-1 * speed * 0` is negative zero, which compares unequal to zero under strict equality and
  // would leak that distinction into every caller that checks whether anybody moved.
  const requestedMeters = zeroed(intent * speed * deltaSeconds);

  // Closing is the only direction that can run out of room.
  const roomToClose = Math.max(0, separationMeters - minimumSeparationMeters);
  const allowedMeters = zeroed(requestedMeters < 0
    ? -Math.min(roomToClose, -requestedMeters)
    : requestedMeters);

  return Object.freeze({
    stage: LANE_LOCOMOTION_STAGE,
    intent,
    requestedMeters,
    meters: allowedMeters,
    clamped: Math.abs(allowedMeters - requestedMeters) > 1e-9,
    atMinimumSeparation: roomToClose <= 1e-9,
    separationMeters,
    minimumSeparationMeters,
    profile,
    authority: profile.authority,
  });
}

// Holds one fighter's held intent and turns frames into travel. It writes nothing: the lane ledger
// owns where anybody is, and this only says how far they asked to go since the last frame.
export function createLaneLocomotionRuntime(options = {}) {
  const profile = Object.freeze({ ...LANE_LOCOMOTION_PROFILE, ...(options.profile || {}) });
  let intent = 0;
  let lastStep = null;

  function setIntent(next) {
    intent = normalizeLaneIntent(next);
    return intent;
  }

  function update({ deltaSeconds, separationMeters, minimumSeparationMeters } = {}) {
    lastStep = planLaneStep({ intent, deltaSeconds, separationMeters, minimumSeparationMeters, profile });
    return lastStep;
  }

  function reset() {
    intent = 0;
    lastStep = null;
    return null;
  }

  return Object.freeze({
    setIntent,
    update,
    reset,
    get intent() { return intent; },
    get report() { return lastStep; },
    get profile() { return profile; },
  });
}
