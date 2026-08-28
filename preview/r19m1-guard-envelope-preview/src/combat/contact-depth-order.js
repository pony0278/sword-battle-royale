export const CONTACT_DEPTH_ORDER_STAGE = 'R19Y.1';

// R19Y.1: who gets asked first, the shield or the body.
//
// "The shield is asked first, always" (R18U.1) carried a premise nobody had to state on the
// lane: the shield is BETWEEN the blade and the body, so a blade the guard caught never reaches
// the body at all. Stage B made the premise falsifiable, and the B3 investigation falsified it:
// with the defender's back turned, the blade passed through the body's space and struck the
// resting shield slung on the FAR side - four in four, at range and up close, with every active
// system disabled - because the resolution order asked the shield first regardless of where the
// shield actually was. A back-turned defender was nearly immune to the very attacks that should
// punish a turned back hardest.
//
// The fix keeps the rule and states its premise. The shield is between when the attacker and the
// defender's body stand on OPPOSITE sides of the shield plane - the geometry every measurement
// was taken in, where nothing changes. When they stand on the SAME side, the shield is behind
// the body along the attack's approach, and the body is asked first. Doubt resolves to the
// shield: near-degenerate readings (either point within a hand's width of the plane, as when a
// -90 rotation lays the plane along the attack axis) keep the legacy order, because at those
// angles the blade misses the shield anyway (measured 0/4 across the collapse band) and a wrong
// "body-first" there would be taking blocks away on noise.
export const CONTACT_DEPTH_PLANE_EPSILON_METERS = 0.1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function planeSide(point, surface) {
  const dx = finite(point.x) - finite(surface.center.x);
  const dy = finite(point.y) - finite(surface.center.y);
  const dz = finite(point.z) - finite(surface.center.z);
  return dx * finite(surface.normal.x) + dy * finite(surface.normal.y) + dz * finite(surface.normal.z);
}

// Orders one exchange's contact questions. Inputs are world points: the attacker's root (stable,
// unlike the blade, whose base itself crosses the plane mid-swing) and the defender's chest.
// Returns shield-first for every malformed input, because the legacy order is the measured one.
export function decideContactDepthOrder(input = {}) {
  const surface = input.shieldSurface;
  const attacker = input.attackerPoint;
  const body = input.bodyPoint;
  if (!surface?.center || !surface?.normal || !attacker || !body) {
    return Object.freeze({
      stage: CONTACT_DEPTH_ORDER_STAGE,
      order: 'shield-first',
      reason: 'missing-geometry-keeps-the-measured-order',
      authority: 'contact-question-ordering-no-contact-authority',
    });
  }
  const attackerSide = planeSide(attacker, surface);
  const bodySide = planeSide(body, surface);
  const degenerate = Math.abs(attackerSide) < CONTACT_DEPTH_PLANE_EPSILON_METERS
    || Math.abs(bodySide) < CONTACT_DEPTH_PLANE_EPSILON_METERS;
  const shieldBetween = degenerate || attackerSide * bodySide < 0;
  return Object.freeze({
    stage: CONTACT_DEPTH_ORDER_STAGE,
    order: shieldBetween ? 'shield-first' : 'body-first',
    reason: degenerate ? 'plane-nearly-edge-on-doubt-resolves-to-the-shield'
      : shieldBetween ? 'shield-between-attacker-and-body'
        : 'shield-behind-the-body-along-the-approach',
    attackerSideMeters: attackerSide,
    bodySideMeters: bodySide,
    authority: 'contact-question-ordering-no-contact-authority',
  });
}
