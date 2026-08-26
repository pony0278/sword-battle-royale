export const PARRY_ROOT_DISPLACEMENT_STAGE = 'R18O.1';

// Bounded whole-body displacement for a parried exchange.
//
// Backward lean alone reads as a bow rather than a stagger: the brain judges
// balance from the centre of mass leaving the support base, not from spine
// angle. These profiles move the root so the silhouette actually loses its
// footing, while staying inside a distance a planted recovery can justify.
//
// Displacement is deliberately scoped to run only after DEFLECT_IMPULSE. The
// swept Sword x Shield probe owns parry success, and moving either actor while
// that probe is live would change the contact geometry it measures.
export const PARRY_ROOT_DISPLACEMENT_PROFILES = Object.freeze({
  attacker: Object.freeze({
    role: 'attacker',
    peakMeters: 0.16,
    maximumPeakMeters: 0.24,
    verticalDropMeters: 0.022,
    riseMs: 90,
    holdMs: 160,
    // The envelope has to finish inside the reaction that drives it: the
    // exchange stops advancing this clock once the recoil completes, so a
    // longer recovery would strand the root off its base.
    recoverMs: 240,
    authority: 'parried-attacker-loses-footing-backward',
  }),
  // The defender won the exchange but still absorbs the blow, so the reaction
  // is the same shape at roughly a third of the travel.
  defender: Object.freeze({
    role: 'defender',
    peakMeters: 0.05,
    maximumPeakMeters: 0.09,
    verticalDropMeters: 0.006,
    riseMs: 70,
    holdMs: 110,
    recoverMs: 220,
    authority: 'parrying-defender-braces-against-the-same-impulse',
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function horizontalUnit(value) {
  const x = finite(value?.x);
  const z = finite(value?.z);
  const length = Math.hypot(x, z);
  if (length <= 1e-6) return null;
  return Object.freeze({ x: x / length, y: 0, z: z / length });
}

function rejection(reason, role = null) {
  return Object.freeze({
    stage: PARRY_ROOT_DISPLACEMENT_STAGE,
    accepted: false,
    reason,
    role,
  });
}

export function planParryRootDisplacement(input = {}) {
  const role = String(input.role || '').toLowerCase();
  const base = PARRY_ROOT_DISPLACEMENT_PROFILES[role];
  if (!base) return rejection('unsupported-displacement-role', role || null);

  const profile = Object.freeze({ ...base, ...(input.profile || {}) });
  const direction = horizontalUnit(input.backwardDirection);
  if (!direction) return rejection('missing-horizontal-backward-direction', role);

  const momentum = clamp(input.momentum ?? 1, 0.6, 1.6);
  const peakMeters = clamp(
    finite(profile.peakMeters) * momentum,
    0,
    finite(profile.maximumPeakMeters, finite(profile.peakMeters)),
  );
  const riseMs = Math.max(1, finite(profile.riseMs, 1));
  const holdMs = Math.max(0, finite(profile.holdMs));
  const recoverMs = Math.max(1, finite(profile.recoverMs, 1));

  return Object.freeze({
    stage: PARRY_ROOT_DISPLACEMENT_STAGE,
    accepted: true,
    role,
    profile,
    direction,
    momentum,
    peakMeters,
    verticalDropMeters: clamp(finite(profile.verticalDropMeters), 0, 0.06),
    riseMs,
    holdMs,
    recoverMs,
    holdEndMs: riseMs + holdMs,
    durationMs: riseMs + holdMs + recoverMs,
    startsAfterDeflectImpulse: true,
    authority: profile.authority,
  });
}

export function sampleParryRootDisplacement(plan, elapsedMs = 0) {
  if (plan?.accepted !== true) return null;
  const elapsed = Math.max(0, finite(elapsedMs));
  const complete = elapsed >= plan.durationMs;
  const weight = complete
    ? 0
    : elapsed <= plan.riseMs
      ? smoothstep01(elapsed / plan.riseMs)
      : elapsed <= plan.holdEndMs
        ? 1
        : 1 - smoothstep01((elapsed - plan.holdEndMs) / plan.recoverMs);

  const distanceMeters = plan.peakMeters * weight;
  return Object.freeze({
    stage: PARRY_ROOT_DISPLACEMENT_STAGE,
    role: plan.role,
    elapsedMs: elapsed,
    complete,
    active: !complete && weight > 1e-6,
    phase: complete
      ? 'recovered'
      : elapsed <= plan.riseMs
        ? 'losing-footing'
        : elapsed <= plan.holdEndMs
          ? 'off-balance'
          : 'recovering',
    weight,
    distanceMeters,
    offsetMeters: Object.freeze({
      x: plan.direction.x * distanceMeters,
      y: -plan.verticalDropMeters * weight,
      z: plan.direction.z * distanceMeters,
    }),
    peakMeters: plan.peakMeters,
    durationMs: plan.durationMs,
    authority: plan.authority,
  });
}

// Owns one actor's displacement clock and writes the offset onto the rig root.
// The root position is re-derived from a captured base every frame, so the
// caller's own pose restore (frozen contact pose, or a rebuilt guard clip)
// cannot accumulate the offset.
export function createParryRootDisplacementRuntime(options = {}) {
  const rig = options.rig || null;
  let plan = null;
  let basePosition = null;
  let elapsedMs = 0;
  let lastSample = null;

  function rootBone() {
    return rig?.bones?.root || null;
  }

  function readBase() {
    const bone = rootBone();
    if (!bone?.position) return null;
    return Object.freeze({
      x: finite(bone.position.x),
      y: finite(bone.position.y),
      z: finite(bone.position.z),
    });
  }

  function writeRoot(offset) {
    const bone = rootBone();
    if (!bone?.position || !basePosition) return false;
    const x = basePosition.x + finite(offset?.x);
    const y = basePosition.y + finite(offset?.y);
    const z = basePosition.z + finite(offset?.z);
    if (typeof bone.position.set === 'function') bone.position.set(x, y, z);
    else { bone.position.x = x; bone.position.y = y; bone.position.z = z; }
    rig?.root?.updateMatrixWorld?.(true);
    return true;
  }

  function reset() {
    if (plan && basePosition) writeRoot({ x: 0, y: 0, z: 0 });
    plan = null;
    basePosition = null;
    elapsedMs = 0;
    lastSample = null;
    return null;
  }

  function start(input = {}) {
    const planned = planParryRootDisplacement(input);
    if (!planned.accepted) {
      lastSample = null;
      return planned;
    }
    if (!rootBone()?.position) {
      lastSample = null;
      return rejection('rig-root-bone-unavailable', planned.role);
    }
    plan = planned;
    basePosition = readBase();
    elapsedMs = 0;
    lastSample = sampleParryRootDisplacement(plan, 0);
    return Object.freeze({ ...planned, basePosition });
  }

  // Advancing and applying are separate so one shared clock can drive both
  // actors while each writes its root at the point in the frame that its own
  // presentation has finished rebuilding.
  function advance(deltaMs = 0) {
    if (!plan) return null;
    elapsedMs += Math.max(0, finite(deltaMs));
    lastSample = sampleParryRootDisplacement(plan, elapsedMs);
    return lastSample;
  }

  function apply() {
    if (!plan || !lastSample) return null;
    writeRoot(lastSample.offsetMeters);
    return lastSample;
  }

  return Object.freeze({
    start,
    advance,
    apply,
    reset,
    get active() { return Boolean(plan) && lastSample?.complete !== true; },
    get plan() { return plan; },
    get report() { return lastSample; },
    get basePosition() { return basePosition; },
  });
}
