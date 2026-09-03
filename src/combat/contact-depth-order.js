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
// The fix keeps the rule and states its premise - and R24I.1 (#39) restates it in the frame the
// question actually lives in. The first statement compared plane-side SIGNS: shield-first when
// the attacker and the body sit on opposite sides of the shield plane. That is the right answer
// while the shield stands vertical, and it is exactly wrong when the shield TILTS: an opponent
// covering TOP pitches the disc toward flat, and a near-flat plane puts the attacker's root and
// the defender's chest on the SAME side even with the shield squarely between the blade and the
// body. Measured (the #39 window): a player TOP at 1.2-2.3m, opponent covered, geometric contact
// and temporal eligibility both true - and this check discarded the block as a backstab, so the
// blade fell through to the chest. At 2.4m the attacker's root sat far enough to cross the tilted
// plane's other side, which is why the band never showed it.
//
// So the order is now read along the APPROACH, where "depth" is defined: project the shield's
// center and the body onto the horizontal attacker-to-body line. The shield is between when its
// center sits nearer the attacker than the body does; it is a backstab when the center sits
// beyond the body - the slung-on-the-far-side geometry the B3 investigation measured, which this
// keeps calling body-first. Tilt cannot enter the answer, because the plane's normal no longer
// does. Doubt still resolves to the shield: a shield within a hand's width of the body's own
// depth reads as between, and a degenerate approach (the two of them on top of each other) keeps
// the legacy order.
export const CONTACT_DEPTH_PLANE_EPSILON_METERS = 0.1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Orders one exchange's contact questions. Inputs are world points: the attacker's root (stable,
// unlike the blade, whose base itself crosses the plane mid-swing) and the defender's chest.
// Returns shield-first for every malformed input, because the legacy order is the measured one.
export function decideContactDepthOrder(input = {}) {
  const surface = input.shieldSurface;
  const attacker = input.attackerPoint;
  const body = input.bodyPoint;
  if (!surface?.center || !attacker || !body) {
    return Object.freeze({
      stage: CONTACT_DEPTH_ORDER_STAGE,
      order: 'shield-first',
      reason: 'missing-geometry-keeps-the-measured-order',
      authority: 'contact-question-ordering-no-contact-authority',
    });
  }
  const approachX = finite(body.x) - finite(attacker.x);
  const approachZ = finite(body.z) - finite(attacker.z);
  const approachMeters = Math.hypot(approachX, approachZ);
  if (approachMeters < CONTACT_DEPTH_PLANE_EPSILON_METERS) {
    return Object.freeze({
      stage: CONTACT_DEPTH_ORDER_STAGE,
      order: 'shield-first',
      reason: 'plane-nearly-edge-on-doubt-resolves-to-the-shield',
      authority: 'contact-question-ordering-no-contact-authority',
    });
  }
  const shieldAlongMeters = ((finite(surface.center.x) - finite(attacker.x)) * approachX
    + (finite(surface.center.z) - finite(attacker.z)) * approachZ) / approachMeters;
  const bodyAlongMeters = approachMeters;
  const shieldBetween = shieldAlongMeters <= bodyAlongMeters + CONTACT_DEPTH_PLANE_EPSILON_METERS;
  return Object.freeze({
    stage: CONTACT_DEPTH_ORDER_STAGE,
    order: shieldBetween ? 'shield-first' : 'body-first',
    reason: shieldBetween ? 'shield-between-attacker-and-body'
      : 'shield-behind-the-body-along-the-approach',
    shieldAlongMeters,
    bodyAlongMeters,
    authority: 'contact-question-ordering-no-contact-authority',
  });
}
