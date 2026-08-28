export const BASE_FACING_STAGE = 'R19T.1';

// R19T.1: facing becomes a state with inertia, not a fact recomputed every frame.
//
// B1 derived each fighter's facing as the instantaneous bearing to the opponent - honest on the
// line, where the bearing never moves, and proven harmless there by the golden pair. But the
// moment lateral movement exists, instantaneous facing is two bugs at once: the defender's head
// snaps to any circling opponent, so bearing error cannot exist and the frontal-cone game never
// starts; and the attacker's root rotates mid-swing, dragging the whole attack animation with it
// - full magnetism at the root, the exact tracking model stage B4 is supposed to decide against.
//
// So the bearing stays a fact the ledger reports, and this integrates the facing a body actually
// has: rate-limited toward the bearing, along the shortest arc, and freezable - an attacker's
// facing freezes at commitment and holds until the exchange resolves, which is soft tracking at
// strength zero until B4 measures a real rate.
//
// On the turn rate not being load-bearing yet: at combat range a strafe cannot outrun any sane
// turn - 0.75 m/s of sideways walk at 1.8m of range moves the bearing about 24 deg/s, far under
// the rate below - so live circling will not open a bearing gap on its own. The gap the cone
// measurements care about comes from the FREEZE: a defender who sidesteps while a swing is
// committed moves against a facing that cannot follow. The rate matters at spawn, after big
// displacements, and once dodges exist; it is a constant here so that day changes one number.
export const BASE_FACING_TURN_RATE_RADIANS_PER_SECOND = (180 * Math.PI) / 180;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Shortest signed arc from one angle to another; the bearing wraps at +/-pi and a facing that
// unwinds the long way around because of a sign flip would spin the body through a full turn.
export function wrapAngleRadians(radians) {
  const twoPi = Math.PI * 2;
  let a = finite(radians) % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}

export function createBaseFacingRuntime(options = {}) {
  const turnRate = Math.max(1e-6, finite(options.turnRateRadiansPerSecond, BASE_FACING_TURN_RATE_RADIANS_PER_SECOND));
  let facingRadians = null; // null until the first bearing: a body spawns facing its opponent,
  // it does not swivel there from world zero.

  function update(targetBearingRadians, deltaSeconds, { frozen = false } = {}) {
    const target = finite(targetBearingRadians, facingRadians ?? 0);
    if (facingRadians == null) { facingRadians = target; return facingRadians; }
    if (frozen) return facingRadians;
    const delta = wrapAngleRadians(target - facingRadians);
    const step = Math.min(Math.abs(delta), turnRate * Math.max(0, finite(deltaSeconds)));
    facingRadians = wrapAngleRadians(facingRadians + Math.sign(delta) * step);
    return facingRadians;
  }

  // A stance change teleports the fighters; the facing goes with them rather than turning across
  // the map toward the new arrangement.
  function snapTo(bearingRadians) {
    facingRadians = wrapAngleRadians(finite(bearingRadians));
    return facingRadians;
  }

  return Object.freeze({
    update,
    snapTo,
    get facingRadians() { return facingRadians ?? 0; },
  });
}
