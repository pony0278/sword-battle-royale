export const GUARD_DIRECTIONAL_ANCHOR_STAGE = 'R18R.5';

// R18R.5: Where a given attack direction actually arrives, in the shield's own frame.
//
// Measured, not assumed. Each entry is the offset from the neutral (un-tracked) buckler centre to
// the blade's closest approach at the frame of minimum measured gap, resolved into the shield's
// right/up axes (right = up x normal). Captured headlessly per direction against the R281 lab:
//   top   arrives 0.19m across, level, 0.01m short  - already inside the disc, no correction needed
//   right arrives 0.12m across, 0.21m down, 0.05m short - a few centimetres of correction
//   left  arrives 0.23m across, 0.43m down, 0.08m short - a genuine low sweep, and the reason a
//                                            high guard that only tracks a prediction never met it
// `forward` is along the shield normal and matters more than its size suggests: a guard that is
// laterally perfect but centimetres off in depth passes straight through the swing without
// touching it.
// These are direction-level coverage, deliberately coarse: they say where to be before the swing
// commits to its final arc, which is the only thing a defender can know that early. The predicted
// threat refines them once it is credible, and the measured sweep replaces them once the blade is
// close enough to measure. Re-measure these if the attack clips or the actors' spacing change.
export const GUARD_DIRECTIONAL_COVERAGE_ANCHORS = Object.freeze({
  top: Object.freeze({ right: -0.19, up: 0.03, forward: -0.01 }),
  right: Object.freeze({ right: -0.12, up: -0.21, forward: -0.05 }),
  left: Object.freeze({ right: -0.23, up: -0.43, forward: -0.08 }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(input) {
  return { x: finite(input?.x), y: finite(input?.y), z: finite(input?.z) };
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(value) {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  return magnitude > 1e-9
    ? { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude }
    : { x: 0, y: 0, z: 0 };
}

export function getGuardDirectionalAnchor(direction) {
  return GUARD_DIRECTIONAL_COVERAGE_ANCHORS[String(direction || '').toLowerCase()] || null;
}

export function resolveGuardDirectionalAnchorPoint(input = {}) {
  const anchor = input.anchor || getGuardDirectionalAnchor(input.direction);
  const surface = input.bucklerSurface;
  if (!anchor || !surface?.center) return null;
  const forward = normalize(vec(surface.normal));
  if (!(Math.hypot(forward.x, forward.y, forward.z) > 0)) return null;
  const right = normalize(cross({ x: 0, y: 1, z: 0 }, forward));
  const up = normalize(cross(forward, right));
  const center = vec(surface.center);
  return Object.freeze({
    x: center.x + right.x * anchor.right + up.x * anchor.up + forward.x * finite(anchor.forward),
    y: center.y + right.y * anchor.right + up.y * anchor.up + forward.y * finite(anchor.forward),
    z: center.z + right.z * anchor.right + up.z * anchor.up + forward.z * finite(anchor.forward),
  });
}

export function buildGuardDirectionalAnchorThreat(input = {}) {
  const point = resolveGuardDirectionalAnchorPoint(input);
  if (!point) return null;
  const surface = input.bucklerSurface;
  const center = vec(surface.center);
  return Object.freeze({
    stage: GUARD_DIRECTIONAL_ANCHOR_STAGE,
    selection: 'directional-anchor',
    direction: String(input.direction || '').toLowerCase() || null,
    point,
    worldPoint: point,
    signedDistance: 0,
    radialDistance: Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z),
    outsideDisc: 0,
    futureSeconds: 0,
    surface,
    authority: 'direction-level-coverage-guidance-no-contact-authority',
  });
}
