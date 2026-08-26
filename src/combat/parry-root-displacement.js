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
// Timing note. This clock starts at DEFLECT_IMPULSE, and the recoil
// presentation clock is latched at its impulse peak for exactly as long as the
// contact lasts, so the two share an origin offset by that peak. Every segment
// below is therefore authored on the recoil's post-impulse-peak timeline --
// `parry-root-displacement.test.js` locks the arithmetic against the burst
// profile so the root sink cannot drift out of the body collapse it belongs to.
//
// A parried actor does not travel once and recover. It loses ground, holds
// the off-balance pose, starts to gather itself, goes still, and only then
// loses the stance for real. The collapse segment is that second failure: it
// is the last thing that happens and the only part that reads as "he could
// not hold it", so recovering straight out of the hold throws it away.
export const PARRY_ROOT_DISPLACEMENT_PROFILES = Object.freeze({
  attacker: Object.freeze({
    role: 'attacker',
    peakMeters: 0.16,
    maximumPeakMeters: 0.24,
    verticalDropMeters: 0.022,
    riseMs: 80,
    holdMs: 124,
    // Partial only. The root gathers back toward its base, which is what
    // gives the collapse below something left to take away.
    recoverMs: 80,
    braceHoldRatio: 0.35,
    collapseStillnessMs: 34,
    collapseMs: 104,
    collapseHoldRatio: 0.62,
    // Measured off the reference motion, where the planted feet drop roughly
    // this far. Most of the visible sink is knee and torso, not the root.
    collapseDropMeters: 0.055,
    // The envelope has to finish inside the reaction that drives it: the
    // exchange stops advancing this clock once the recoil completes, so a
    // longer tail would strand the root off its base.
    collapseSettleMs: 170,
    authority: 'parried-attacker-loses-footing-backward-then-loses-the-stance',
  }),
  // The defender won the exchange but still absorbs the blow, so the reaction
  // is the same shape at roughly a third of the travel, and it gathers itself
  // back sooner rather than collapsing.
  defender: Object.freeze({
    role: 'defender',
    peakMeters: 0.05,
    maximumPeakMeters: 0.09,
    verticalDropMeters: 0.006,
    riseMs: 70,
    holdMs: 124,
    recoverMs: 90,
    braceHoldRatio: 0.45,
    // Both actors are reacting to one impulse, so the defender's stance goes
    // in the same window as the attacker's -- just far less of it.
    collapseStillnessMs: 34,
    collapseMs: 104,
    collapseHoldRatio: 0.58,
    collapseDropMeters: 0.018,
    collapseSettleMs: 170,
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
  const collapseStillnessMs = Math.max(0, finite(profile.collapseStillnessMs));
  const collapseMs = Math.max(0, finite(profile.collapseMs));
  const collapseSettleMs = Math.max(1, finite(profile.collapseSettleMs, 1));
  const braceHoldRatio = clamp(finite(profile.braceHoldRatio, 1), 0, 1);
  const collapseHoldRatio = clamp(finite(profile.collapseHoldRatio, braceHoldRatio), 0, 1);

  const holdEndMs = riseMs + holdMs;
  const braceEndMs = holdEndMs + recoverMs;
  const collapseStillEndMs = braceEndMs + collapseStillnessMs;
  const collapseEndMs = collapseStillEndMs + collapseMs;

  return Object.freeze({
    stage: PARRY_ROOT_DISPLACEMENT_STAGE,
    accepted: true,
    role,
    profile,
    direction,
    momentum,
    peakMeters,
    verticalDropMeters: clamp(finite(profile.verticalDropMeters), 0, 0.06),
    collapseDropMeters: clamp(finite(profile.collapseDropMeters), 0, 0.12),
    riseMs,
    holdMs,
    recoverMs,
    collapseStillnessMs,
    collapseMs,
    collapseSettleMs,
    braceHoldRatio,
    collapseHoldRatio,
    holdEndMs,
    braceEndMs,
    collapseStillEndMs,
    collapseEndMs,
    durationMs: collapseEndMs + collapseSettleMs,
    startsAfterDeflectImpulse: true,
    authority: profile.authority,
  });
}

// The collapse has to arrive, not build: an ease-out puts most of the travel
// in the first two frames so it reads as the stance giving way.
function easeOutCollapse(value) {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 2.4;
}

// Horizontal travel and root sink are separate curves because they peak at
// different times: the actor loses ground first and only drops at the end.
function sampleSegments(plan, elapsed) {
  const braceDistance = plan.peakMeters * plan.braceHoldRatio;
  const braceDrop = plan.verticalDropMeters * plan.braceHoldRatio;
  if (elapsed <= plan.riseMs) {
    const s = smoothstep01(elapsed / plan.riseMs);
    return { phase: 'losing-footing', weight: s, distance: plan.peakMeters * s, drop: plan.verticalDropMeters * s };
  }
  if (elapsed <= plan.holdEndMs) {
    return { phase: 'off-balance', weight: 1, distance: plan.peakMeters, drop: plan.verticalDropMeters };
  }
  if (elapsed <= plan.braceEndMs) {
    const s = smoothstep01((elapsed - plan.holdEndMs) / plan.recoverMs);
    const weight = 1 - (1 - plan.braceHoldRatio) * s;
    return { phase: 'bracing', weight, distance: plan.peakMeters * weight, drop: plan.verticalDropMeters * weight };
  }
  if (elapsed <= plan.collapseStillEndMs) {
    return { phase: 'braced-still', weight: plan.braceHoldRatio, distance: braceDistance, drop: braceDrop };
  }
  if (elapsed <= plan.collapseEndMs) {
    const s = easeOutCollapse((elapsed - plan.collapseStillEndMs) / Math.max(1, plan.collapseMs));
    const weight = plan.braceHoldRatio + (plan.collapseHoldRatio - plan.braceHoldRatio) * s;
    return {
      phase: 'stance-gives',
      weight,
      distance: plan.peakMeters * weight,
      drop: braceDrop + (plan.collapseDropMeters - braceDrop) * s,
    };
  }
  const s = smoothstep01((elapsed - plan.collapseEndMs) / plan.collapseSettleMs);
  const weight = plan.collapseHoldRatio * (1 - s);
  return {
    phase: 'recovering',
    weight,
    distance: plan.peakMeters * weight,
    drop: plan.collapseDropMeters * (1 - s),
  };
}

export function sampleParryRootDisplacement(plan, elapsedMs = 0) {
  if (plan?.accepted !== true) return null;
  const elapsed = Math.max(0, finite(elapsedMs));
  const complete = elapsed >= plan.durationMs;
  const segment = complete
    ? { phase: 'recovered', weight: 0, distance: 0, drop: 0 }
    : sampleSegments(plan, elapsed);

  const distanceMeters = segment.distance;
  return Object.freeze({
    stage: PARRY_ROOT_DISPLACEMENT_STAGE,
    role: plan.role,
    elapsedMs: elapsed,
    complete,
    active: !complete && segment.weight > 1e-6,
    phase: segment.phase,
    weight: segment.weight,
    distanceMeters,
    verticalDropMeters: segment.drop,
    offsetMeters: Object.freeze({
      x: plan.direction.x * distanceMeters,
      y: -segment.drop,
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
