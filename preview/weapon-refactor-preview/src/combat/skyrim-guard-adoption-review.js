const DEFAULT_EQUIVALENCE_THRESHOLDS = Object.freeze({
  goodMeanDegrees: 8,
  goodP95Degrees: 15,
  goodMaxDegrees: 25,
  warnMeanDegrees: 15,
  warnP95Degrees: 28,
  warnMaxDegrees: 45,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function inRange(value, min, max) {
  return value >= min && value <= max;
}

export function classifySkyrimPoseEquivalence(metrics = {}, thresholds = {}) {
  const limits = { ...DEFAULT_EQUIVALENCE_THRESHOLDS, ...thresholds };
  const meanDegrees = Math.max(0, finite(metrics.meanDegrees));
  const p95Degrees = Math.max(0, finite(metrics.p95Degrees));
  const maxDegrees = Math.max(0, finite(metrics.maxDegrees));

  const good = meanDegrees <= limits.goodMeanDegrees
    && p95Degrees <= limits.goodP95Degrees
    && maxDegrees <= limits.goodMaxDegrees;
  const warning = !good
    && meanDegrees <= limits.warnMeanDegrees
    && p95Degrees <= limits.warnP95Degrees
    && maxDegrees <= limits.warnMaxDegrees;

  return Object.freeze({
    status: good ? 'good' : warning ? 'warning' : 'bad',
    meanDegrees,
    p95Degrees,
    maxDegrees,
    thresholds: Object.freeze(limits),
  });
}

export function classifySkyrimWeaponSocketEquivalence(input = {}, thresholds = {}) {
  const goodMaxDegrees = Math.max(0, finite(thresholds.goodMaxDegrees, 15));
  const warnMaxDegrees = Math.max(goodMaxDegrees, finite(thresholds.warnMaxDegrees, 30));
  const maxDegrees = Math.max(0, finite(input.maxDegrees, 180));
  return Object.freeze({
    status: maxDegrees <= goodMaxDegrees ? 'good' : maxDegrees <= warnMaxDegrees ? 'warning' : 'bad',
    maxDegrees,
    thresholds: Object.freeze({ goodMaxDegrees, warnMaxDegrees }),
  });
}

export function classifyTriangleGuardSample(input = {}) {
  const metrics = Object.freeze({
    weaponHandHeight: finite(input.weaponHandHeight, -1),
    offHandHeight: finite(input.offHandHeight, -1),
    weaponHandCenterDistance: Math.max(0, finite(input.weaponHandCenterDistance, 99)),
    offHandCenterDistance: Math.max(0, finite(input.offHandCenterDistance, 99)),
    swordTipHeight: finite(input.swordTipHeight, -1),
    swordForwardDot: finite(input.swordForwardDot, -1),
    triangleArea: Math.max(0, finite(input.triangleArea, 0)),
    torsoYawDegrees: Math.max(0, finite(input.torsoYawDegrees, 180)),
  });

  const gates = Object.freeze({
    weaponHandHeight: inRange(metrics.weaponHandHeight, 0.45, 1.10),
    offHandHeight: inRange(metrics.offHandHeight, 0.40, 1.05),
    weaponHandCenterDistance: metrics.weaponHandCenterDistance <= 0.70,
    offHandCenterDistance: metrics.offHandCenterDistance <= 0.75,
    swordTipHeight: metrics.swordTipHeight >= 0.55,
    swordForwardDot: metrics.swordForwardDot >= 0.20,
    triangleArea: metrics.triangleArea >= 0.025,
    torsoYawDegrees: inRange(metrics.torsoYawDegrees, 10, 45),
  });

  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const severe = [
    metrics.weaponHandHeight < 0.20,
    metrics.offHandHeight < 0.15,
    metrics.weaponHandCenterDistance > 1.20,
    metrics.offHandCenterDistance > 1.20,
    metrics.swordTipHeight < 0.20,
    metrics.swordForwardDot < -0.20,
  ].filter(Boolean).length;

  const status = failures.length === 0
    ? 'good'
    : severe >= 2 || failures.length >= 6
      ? 'bad'
      : 'warning';

  return Object.freeze({ status, metrics, gates, failures: Object.freeze(failures), severe });
}

export function decideSkyrimGuardAdoption(input = {}) {
  const equivalenceStatus = String(input.equivalenceStatus || 'bad').toLowerCase();
  const weaponSocketStatus = String(input.weaponSocketStatus || 'good').toLowerCase();
  const suitabilityStatuses = Array.from(input.suitabilityStatuses || [])
    .map((value) => String(value || 'bad').toLowerCase());

  let decision = 'PENDING';
  let reason = 'technical-equivalence-not-accepted';

  if (equivalenceStatus !== 'bad') {
    if (weaponSocketStatus === 'bad') {
      reason = 'weapon-socket-equivalence-not-accepted';
    } else if (suitabilityStatuses.includes('bad')) {
      decision = 'REJECT';
      reason = 'source-pose-correction-cost-too-high';
    } else if (equivalenceStatus === 'warning' || weaponSocketStatus === 'warning' || suitabilityStatuses.includes('warning')) {
      decision = 'ADOPT WITH CORRECTIONS';
      reason = 'retarget-is-usable-but-triangle-guard-needs-local-corrections';
    } else if (suitabilityStatuses.length && suitabilityStatuses.every((value) => value === 'good')) {
      decision = 'ADOPT';
      reason = 'source-and-target-equivalent-and-triangle-guard-gates-pass';
    }
  }

  return Object.freeze({
    decision,
    reason,
    equivalenceStatus,
    weaponSocketStatus,
    suitabilityStatuses: Object.freeze(suitabilityStatuses),
  });
}
