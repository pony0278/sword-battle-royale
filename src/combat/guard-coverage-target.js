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

// R24C.1 - the measured aim answers a blade that is COMING, and stays where it met it.
//
// Measured on both defenders at 2.40m (the shield hand, mm per frame): (1) a swing thrown while
// the last one's blade is still retracting past the shield engaged the measured aim on that
// receding blade for its first 0.1s - 34 to 70mm/frame of lunge toward a sword on its way out;
// (2) once the blade had passed the shield plane the aim fell back to the direction anchor and
// the arm turned around at 40mm/frame, one frame after meeting the blade. Together with the
// snap-to-measured this read as a shield hunting for a line rather than taking one. So: the
// measurement only engages while the blade's plane gap is closing (a first reading has no
// trend, and waits one frame), and once it has engaged in a sequence it is held - the blade's
// last measured point is the aim until the sequence ends. Neither changes where the shield is
// when the blade arrives, which is the only thing the swept contact test reads.
export function createGuardCoverageTargetTracker(options = {}) {
  const profile = Object.freeze({ ...GUARD_COVERAGE_TARGET_PROFILE, ...(options.profile || {}) });
  let sequence = null;
  let smoothedPoint = null;
  let lastPlaneGap = null; // R24C.1: the previous frame's plane gap, for the closing test
  let heldThreat = null; // R24C.1: the last measured aim of this sequence

  return Object.freeze({
    select(input = {}) {
      let selection = selectGuardCoverageTarget({ ...input, profile });
      if (input.sequence !== sequence) {
        sequence = input.sequence ?? null;
        smoothedPoint = null;
        lastPlaneGap = null;
        heldThreat = null;
      }
      // R24C.1: a measured reading counts only while the blade is closing on the shield plane, and
      // only inside the window in which it could still arrive (`measurable`, the caller's word -
      // the swing's active window less the guard's own horizon; a swing thrown while the last
      // blade is still on its way home sweeps that blade past the shield with a briefly closing gap).
      const planeGap = input.approach ? finite(input.approach.planeGapMeters, Infinity) : null;
      const closing = planeGap != null && lastPlaneGap != null && planeGap < lastPlaneGap - 1e-6;
      if (planeGap != null) lastPlaneGap = planeGap;
      const measurable = input.measurable !== false;
      if (selection.engaged && (!closing || !measurable) && !heldThreat) {
        selection = Object.freeze({ ...selection, engaged: false, source: 'measured-blade-receding', threat: selection.threat });
        // The threat below is still the measured point; without a closing blade it is not an aim.
        // Fall through to the far-blade selection instead, as if the measurement had not engaged.
        selection = selectGuardCoverageTarget({ ...input, profile, approach: null });
      }
      if (selection.engaged) heldThreat = selection.threat;
      else if (heldThreat) {
        // R24C.1: engaged once this sequence, so the blade has been met or passed - hold the line.
        return Object.freeze({ ...selection, source: 'measured-held', engaged: false, held: true, smoothed: false, threat: heldThreat });
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
      lastPlaneGap = null;
      heldThreat = null;
    },
    get point() { return smoothedPoint; },
    get held() { return heldThreat; }, // R24C.1
  });
}
