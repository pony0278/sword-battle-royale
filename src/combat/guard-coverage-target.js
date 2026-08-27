import { buildGuardDirectionalAnchorThreat } from './guard-directional-anchor.js';

export const GUARD_COVERAGE_TARGET_STAGE = 'R18R.3';

// R18R.3: Guard has two sources of truth about where the blade will be, and they are good at
// different ranges.
//   The predicted threat extrapolates each blade node linearly, which is fine while the swing is
//   still far out and its direction is the only thing that matters.
//   The measured swept closest approach is the real interpolated blade against the real shield
//   disc. Once the blade is close it is simply correct, and the prediction's linear extrapolation
//   of a rotating swing is not.
// Guard trusts the prediction to turn toward the attack and the measurement to actually meet it.
export const GUARD_COVERAGE_TARGET_PROFILE = Object.freeze({
  engagementPlaneMeters: 0.9,
  engagementCombinedMeters: 1.2,
  // Aim at the shield face, not its rim. Spending the whole travel budget to arrive exactly on
  // the rim leaves the exact swept contact test to decide by a millimetre.
  contactInsetMeters: 0.00,
  // The predicted crossing point of a swinging blade wanders frame to frame. A servo with a hard
  // speed cap spends its whole travel budget turning around instead of arriving, so the aim point
  // is smoothed while it is still a prediction. Once the measurement engages there is nothing left
  // to guess and the aim snaps to it.
  smoothingSeconds: 0.09,
  // A predicted threat point over half a metre off the shield plane is not a crossing this guard
  // can aim at - the linear-in-time part of a whipping swing simply is not there yet. Below that
  // the prediction is credible and beats the direction-level anchor; above it, it does not.
  predictionCredibleePlaneMeters: 0.18,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function freezeVector(input) {
  return Object.freeze({ x: finite(input?.x), y: finite(input?.y), z: finite(input?.z) });
}

export function selectGuardCoverageTarget(input = {}) {
  const profile = Object.freeze({ ...GUARD_COVERAGE_TARGET_PROFILE, ...(input.profile || {}) });
  const approach = input.approach || null;
  const predictedThreat = input.predictedThreat || null;
  const surface = input.bucklerSurface || predictedThreat?.surface || null;

  const planeGapMeters = approach ? finite(approach.planeGapMeters, Infinity) : Infinity;
  const combinedGapMeters = approach ? finite(approach.combinedGapMeters, Infinity) : Infinity;
  const engaged = planeGapMeters <= profile.engagementPlaneMeters
    && combinedGapMeters <= profile.engagementCombinedMeters;

  if (engaged) {
    const radius = finite(surface?.radius, 0);
    const inset = Math.min(radius, Math.max(0, profile.contactInsetMeters));
    const radialDistance = finite(approach.radialDistanceMeters);
    const aimedRadialDistance = Math.max(0, radialDistance - inset);
    const center = surface?.center;
    // R18R.7: Aim at where the blade actually is, not at its shadow on the shield plane. A
    // correction built from the projected point has no component along the shield normal, so a
    // guard that is laterally perfect can still sit centimetres in front of or behind the blade
    // and never touch it - measured on LEFT, where the whole residual was 4.9cm of depth against
    // 1.8cm of lateral. The rim inset is still applied in-plane only; depth is taken as measured.
    const scale = radialDistance > 1e-6 ? aimedRadialDistance / radialDistance : 0;
    const aimedPoint = center
      ? Object.freeze({
          x: center.x + (approach.planePoint.x - center.x) * scale + (approach.point.x - approach.planePoint.x),
          y: center.y + (approach.planePoint.y - center.y) * scale + (approach.point.y - approach.planePoint.y),
          z: center.z + (approach.planePoint.z - center.z) * scale + (approach.point.z - approach.planePoint.z),
        })
      : freezeVector(approach.point);
    return Object.freeze({
      stage: GUARD_COVERAGE_TARGET_STAGE,
      source: 'measured-swept-approach',
      engaged: true,
      planeGapMeters,
      combinedGapMeters,
      profile,
      threat: Object.freeze({
        stage: GUARD_COVERAGE_TARGET_STAGE,
        selection: 'measured-swept-approach',
        point: freezeVector(aimedPoint),
        worldPoint: freezeVector(approach.point),
        signedDistance: finite(approach.signedDistance),
        radialDistance: Math.hypot(
          aimedPoint.x - finite(center?.x),
          aimedPoint.y - finite(center?.y),
          aimedPoint.z - finite(center?.z),
        ),
        outsideDisc: finite(approach.radialGapMeters),
        futureSeconds: 0,
        surface,
      }),
    });
  }

  const predictionCredible = Boolean(predictedThreat)
    && Math.abs(finite(predictedThreat.signedDistance, Infinity)) <= profile.predictionCredibleePlaneMeters;
  const anchorThreat = predictionCredible
    ? null
    : buildGuardDirectionalAnchorThreat({ direction: input.direction, bucklerSurface: surface });
  const threat = predictionCredible ? predictedThreat : (anchorThreat || predictedThreat);
  const source = predictionCredible
    ? 'predicted-threat'
    : anchorThreat ? 'directional-anchor' : predictedThreat ? 'predicted-threat' : 'none';

  return Object.freeze({
    stage: GUARD_COVERAGE_TARGET_STAGE,
    source,
    engaged: false,
    planeGapMeters: Number.isFinite(planeGapMeters) ? planeGapMeters : null,
    combinedGapMeters: Number.isFinite(combinedGapMeters) ? combinedGapMeters : null,
    profile,
    threat,
  });
}


function lerpVector(a, b, t) {
  return Object.freeze({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });
}

export function createGuardCoverageTargetTracker(options = {}) {
  const profile = Object.freeze({ ...GUARD_COVERAGE_TARGET_PROFILE, ...(options.profile || {}) });
  let sequence = null;
  let smoothedPoint = null;

  return Object.freeze({
    select(input = {}) {
      const selection = selectGuardCoverageTarget({ ...input, profile });
      if (input.sequence !== sequence) {
        sequence = input.sequence ?? null;
        smoothedPoint = null;
      }
      if (!selection.threat?.point) return selection;
      const raw = freezeVector(selection.threat.point);
      if (selection.engaged || !smoothedPoint) {
        smoothedPoint = raw;
        return Object.freeze({ ...selection, smoothed: false });
      }
      const deltaSeconds = Math.max(1e-4, finite(input.deltaSeconds, 1 / 60));
      const alpha = 1 - Math.exp(-deltaSeconds / Math.max(1e-3, profile.smoothingSeconds));
      smoothedPoint = lerpVector(smoothedPoint, raw, alpha);
      return Object.freeze({
        ...selection,
        smoothed: true,
        threat: Object.freeze({ ...selection.threat, point: smoothedPoint }),
      });
    },
    reset() {
      sequence = null;
      smoothedPoint = null;
    },
    get point() { return smoothedPoint; },
  });
}
