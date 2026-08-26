export const R18N_TOP_DIRECTION_COMPATIBILITY_PROBE_STAGE = 'R18N.4.3-B.1.1';

export const R18N_TOP_DIRECTION_COMPATIBILITY_VARIANTS = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
});

export const R18N_TOP_DIRECTION_COMPATIBILITY_POLICY = Object.freeze({
  minimumStepMeters: 1e-6,
  minimumTargetMeters: 1e-6,
  minimumUpwardDot: -0.02,
  minimumTargetDot: -0.05,
  authority: 'lab-probe-only-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function freezeVector(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  });
}

function subtract(a = {}, b = {}) {
  return freezeVector({
    x: finite(a.x) - finite(b.x),
    y: finite(a.y) - finite(b.y),
    z: finite(a.z) - finite(b.z),
  });
}

function magnitude(value = {}) {
  return Math.hypot(finite(value.x), finite(value.y), finite(value.z));
}

function normalizedDot(a = {}, b = {}) {
  const aMagnitude = magnitude(a);
  const bMagnitude = magnitude(b);
  if (aMagnitude <= 1e-12 || bMagnitude <= 1e-12) return null;
  return (
    finite(a.x) * finite(b.x)
    + finite(a.y) * finite(b.y)
    + finite(a.z) * finite(b.z)
  ) / (aMagnitude * bMagnitude);
}

export function normalizeTopDirectionCompatibilityVariant(value) {
  const variant = String(value || '').trim().toUpperCase();
  return Object.values(R18N_TOP_DIRECTION_COMPATIBILITY_VARIANTS).includes(variant)
    ? variant
    : null;
}

export function analyzeTopDirectionCompatibilityProbe(input = {}, overrides = {}) {
  const policy = { ...R18N_TOP_DIRECTION_COMPATIBILITY_POLICY, ...overrides };
  const variant = normalizeTopDirectionCompatibilityVariant(input.variant);
  const beforeCenter = freezeVector(input.beforeCenter);
  const afterCenter = freezeVector(input.afterCenter || input.beforeCenter);
  const targetCenter = input.targetCenter ? freezeVector(input.targetCenter) : null;
  const additiveStep = subtract(afterCenter, beforeCenter);
  const targetVector = targetCenter ? subtract(targetCenter, beforeCenter) : null;
  const additiveStepMeters = magnitude(additiveStep);
  const targetDistanceMeters = targetVector ? magnitude(targetVector) : null;
  const upwardDot = additiveStepMeters > policy.minimumStepMeters
    ? additiveStep.y / additiveStepMeters
    : null;
  const targetDot = additiveStepMeters > policy.minimumStepMeters
    && targetVector
    && targetDistanceMeters > policy.minimumTargetMeters
    ? normalizedDot(additiveStep, targetVector)
    : null;

  let compatible = null;
  let reason = 'insufficient-additive-motion';
  if (variant === R18N_TOP_DIRECTION_COMPATIBILITY_VARIANTS.A) {
    reason = 'solver-only-baseline';
  } else if (additiveStepMeters > policy.minimumStepMeters) {
    const upwardCompatible = upwardDot == null || upwardDot >= policy.minimumUpwardDot;
    const targetCompatible = targetDot == null || targetDot >= policy.minimumTargetDot;
    compatible = upwardCompatible && targetCompatible;
    if (!upwardCompatible) reason = 'authored-step-opposes-top-upward-readability';
    else if (!targetCompatible) reason = 'authored-step-opposes-active-intercept-target';
    else reason = 'authored-step-compatible-with-top-direction';
  }

  return Object.freeze({
    stage: R18N_TOP_DIRECTION_COMPATIBILITY_PROBE_STAGE,
    direction: String(input.direction || '').toLowerCase() || null,
    variant,
    beforeCenter,
    afterCenter,
    targetCenter,
    additiveStep,
    additiveStepMeters,
    targetVector,
    targetDistanceMeters,
    upwardDot,
    targetDot,
    compatible,
    reason,
    additiveApplied: input.additiveApplied === true,
    policy: Object.freeze({
      minimumStepMeters: policy.minimumStepMeters,
      minimumTargetMeters: policy.minimumTargetMeters,
      minimumUpwardDot: policy.minimumUpwardDot,
      minimumTargetDot: policy.minimumTargetDot,
    }),
    authority: policy.authority,
  });
}

export function shouldRetainTopDirectionAdditive(report = {}) {
  if (report.variant !== R18N_TOP_DIRECTION_COMPATIBILITY_VARIANTS.C) return true;
  return report.compatible !== false;
}
