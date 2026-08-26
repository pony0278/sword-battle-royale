export const PARRIED_TORSO_WORLD_LEAN_STAGE = 'R18P.2';

// The parried reaction's backward pitch is an additive on top of the frozen
// attack-contact pose, and a TOP contact pose leans well forward. Measured
// live, the nominal 32-degree additive only pulls the torso from +13 to +5
// degrees of world lean: every degree is spent un-leaning the attack, and the
// silhouette never crosses vertical, while the Step 1 diagnostic (near-upright
// base) reaches -15 with the identical plan. Balance reads in world space, so
// the target must too: this module measures the hips-to-head line against
// vertical every frame and closes the remaining gap with world-axis rotations
// distributed over hips/spine/chest. It runs after the additive as a
// last-writer servo, which makes it pose-independent by construction.
export const PARRIED_TORSO_WORLD_LEAN_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    targetBackwardLeanDegrees: 16,
    entryRiseMs: 120,
    maximumCorrectionDegrees: 44,
    distribution: Object.freeze({ hips: 0.30, spine: 0.35, chest: 0.35 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
  // Blocking absorbs rather than redirects: the attacker keeps far more of
  // its stance than a parried one, so the silhouette only just crosses
  // vertical instead of being driven behind it.
  block: Object.freeze({
    outcome: 'block',
    targetBackwardLeanDegrees: 7,
    entryRiseMs: 90,
    maximumCorrectionDegrees: 30,
    distribution: Object.freeze({ hips: 0.26, spine: 0.34, chest: 0.40 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    targetBackwardLeanDegrees: 21,
    entryRiseMs: 120,
    maximumCorrectionDegrees: 52,
    distribution: Object.freeze({ hips: 0.30, spine: 0.35, chest: 0.35 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
});

// The same impulse, read from the other end. A defender that redirected the
// blow keeps its posture; one that absorbed it gives ground but stays braced,
// which is why the block defender leans further than the parrying one and
// still far less than either attacker.
export const DEFENDER_TORSO_WORLD_LEAN_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    targetBackwardLeanDegrees: 3,
    entryRiseMs: 120,
    maximumCorrectionDegrees: 20,
    distribution: Object.freeze({ hips: 0.30, spine: 0.35, chest: 0.35 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
  block: Object.freeze({
    outcome: 'block',
    targetBackwardLeanDegrees: 5,
    entryRiseMs: 90,
    maximumCorrectionDegrees: 24,
    distribution: Object.freeze({ hips: 0.30, spine: 0.35, chest: 0.35 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    targetBackwardLeanDegrees: 2,
    entryRiseMs: 120,
    maximumCorrectionDegrees: 20,
    distribution: Object.freeze({ hips: 0.30, spine: 0.35, chest: 0.35 }),
    authority: 'world-space-backward-lean-enforced-behind-vertical',
  }),
});

// (outcome x role) -- the reaction system needs both axes everywhere.
const ROLE_PROFILE_SETS = Object.freeze({
  attacker: PARRIED_TORSO_WORLD_LEAN_PROFILES,
  defender: DEFENDER_TORSO_WORLD_LEAN_PROFILES,
});

export const PARRIED_TORSO_LEAN_BONES = Object.freeze(['hips', 'spine', 'chest']);

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
  const m = Math.hypot(x, z);
  if (m <= 1e-6) return null;
  return Object.freeze({ x: x / m, y: 0, z: z / m });
}

function rejection(reason) {
  return Object.freeze({ stage: PARRIED_TORSO_WORLD_LEAN_STAGE, accepted: false, reason });
}

export function planParriedTorsoWorldLean(input = {}) {
  const profiles = ROLE_PROFILE_SETS[String(input.role || 'attacker').toLowerCase()]
    || PARRIED_TORSO_WORLD_LEAN_PROFILES;
  const profile = {
    ...(profiles[String(input.outcome || '').toLowerCase()] || profiles.parry),
    ...(input.profile || {}),
  };
  const backward = horizontalUnit(input.backwardDirection);
  if (!backward) return rejection('missing-horizontal-backward-direction');

  // Positive lean = toward the defender; the lateral axis is chosen so a
  // positive rotation about it tips the torso toward `backward`.
  const forward = Object.freeze({ x: -backward.x, y: 0, z: -backward.z });
  const lateralAxis = Object.freeze({ x: backward.z, y: 0, z: -backward.x });
  const baseLeanDegrees = finite(input.baseLeanDegrees);

  return Object.freeze({
    stage: PARRIED_TORSO_WORLD_LEAN_STAGE,
    accepted: true,
    profile,
    role: String(input.role || 'attacker').toLowerCase(),
    outcome: profile.outcome,
    backward,
    forward,
    lateralAxis,
    baseLeanDegrees,
    targetBackwardLeanDegrees: finite(profile.targetBackwardLeanDegrees),
    entryRiseMs: Math.max(1, finite(profile.entryRiseMs, 1)),
    distribution: profile.distribution,
    startsAfterDeflectImpulse: true,
    authority: profile.authority,
  });
}

// Where the silhouette should be right now: eased in over the entry window,
// then riding the reaction's own torso weight, so the collapse accent's 1.03x
// surge pushes past the nominal target and the settle walks it back.
export function sampleParriedTorsoLeanTarget(plan, input = {}) {
  if (plan?.accepted !== true) return null;
  const torsoWeight = clamp(input.torsoWeight ?? 1, 0, 1.25);
  const entryBlend = smoothstep01(finite(input.elapsedMs) / plan.entryRiseMs);
  const strength = torsoWeight * entryBlend;
  const targetLeanDegrees = plan.baseLeanDegrees
    + (-plan.targetBackwardLeanDegrees - plan.baseLeanDegrees) * strength;
  return Object.freeze({
    stage: PARRIED_TORSO_WORLD_LEAN_STAGE,
    elapsedMs: Math.max(0, finite(input.elapsedMs)),
    torsoWeight,
    entryBlend,
    targetLeanDegrees,
    behindVertical: targetLeanDegrees < 0,
  });
}

// How far to rotate this frame: the full remaining gap, bounded. The base
// pose is rebuilt every frame by the presentation, so the previous frame's
// correction is already gone -- a rate limit here would leave a permanent
// deficit rather than smoothing anything. Smoothness comes from the target
// curve, not the servo.
export function computeParriedTorsoLeanCorrection(plan, currentLeanDegrees, target) {
  if (plan?.accepted !== true || !target) return null;
  const gap = finite(currentLeanDegrees) - target.targetLeanDegrees;
  const bound = Math.max(0, finite(plan.profile.maximumCorrectionDegrees, 44));
  return Object.freeze({
    stage: PARRIED_TORSO_WORLD_LEAN_STAGE,
    currentLeanDegrees: finite(currentLeanDegrees),
    targetLeanDegrees: target.targetLeanDegrees,
    correctionDegrees: clamp(gap, -bound, bound),
  });
}

export function createParriedTorsoWorldLeanRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('R18P.2 requires THREE.Vector3 + Quaternion');
  }
  const rig = options.rig || null;
  const hipsWorld = new THREE.Vector3();
  const headWorld = new THREE.Vector3();
  const parentWorld = new THREE.Quaternion();
  const worldDelta = new THREE.Quaternion();
  const localDelta = new THREE.Quaternion();
  const axisVector = new THREE.Vector3();

  let plan = null;
  let elapsedMs = 0;
  let lastReport = null;

  function bone(id) { return rig?.bones?.[id] || null; }

  function measureLeanDegrees(forward) {
    const hips = bone('hips');
    const head = bone('head');
    if (!hips?.getWorldPosition || !head?.getWorldPosition) return null;
    rig?.root?.updateMatrixWorld?.(true);
    hips.getWorldPosition(hipsWorld);
    head.getWorldPosition(headWorld);
    const dx = headWorld.x - hipsWorld.x;
    const dy = headWorld.y - hipsWorld.y;
    const dz = headWorld.z - hipsWorld.z;
    const alongForward = dx * forward.x + dz * forward.z;
    return Math.atan2(alongForward, dy) * 180 / Math.PI;
  }

  function start(input = {}) {
    const backward = horizontalUnit(input.backwardDirection);
    if (!backward) { plan = null; return rejection('missing-horizontal-backward-direction'); }
    const forward = { x: -backward.x, z: -backward.z };
    const baseLeanDegrees = measureLeanDegrees(forward);
    if (baseLeanDegrees == null) { plan = null; return rejection('rig-torso-bones-unavailable'); }
    plan = planParriedTorsoWorldLean({ ...input, baseLeanDegrees });
    elapsedMs = 0;
    lastReport = null;
    return plan;
  }

  function advance(deltaMs = 0) {
    if (plan?.accepted !== true) return null;
    elapsedMs += Math.max(0, finite(deltaMs));
    return elapsedMs;
  }

  function apply(input = {}) {
    if (plan?.accepted !== true) return null;
    const target = sampleParriedTorsoLeanTarget(plan, {
      torsoWeight: input.torsoWeight,
      elapsedMs,
    });
    const currentLean = measureLeanDegrees(plan.forward);
    if (currentLean == null) return null;
    const correction = computeParriedTorsoLeanCorrection(plan, currentLean, target);
    axisVector.set(plan.lateralAxis.x, plan.lateralAxis.y, plan.lateralAxis.z);
    // Distributed shares under-deliver on the hips-to-head line (a chest
    // rotation moves the head through less angle than it rotates the chest),
    // so the servo iterates: measure, rotate the remaining gap, re-measure.
    // Three passes land within a fraction of a degree.
    let remainingDegrees = correction.correctionDegrees;
    for (let pass = 0; pass < 3 && Math.abs(remainingDegrees) > 0.2; pass += 1) {
      for (const id of PARRIED_TORSO_LEAN_BONES) {
        const target3 = bone(id);
        if (!target3?.quaternion) continue;
        const share = finite(plan.distribution[id], 0);
        if (share <= 0) continue;
        worldDelta.setFromAxisAngle(axisVector, remainingDegrees * share * Math.PI / 180);
        parentWorld.identity();
        target3.parent?.getWorldQuaternion?.(parentWorld);
        localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld);
        target3.quaternion.premultiply(localDelta);
      }
      rig?.root?.updateMatrixWorld?.(true);
      const measured = measureLeanDegrees(plan.forward);
      if (measured == null) break;
      remainingDegrees = measured - target.targetLeanDegrees;
    }
    lastReport = Object.freeze({
      ...correction,
      torsoWeight: target.torsoWeight,
      entryBlend: target.entryBlend,
      elapsedMs,
      appliedLeanDegrees: measureLeanDegrees(plan.forward),
      debugForward: plan.forward,
      debugHips: { x: hipsWorld.x, y: hipsWorld.y, z: hipsWorld.z },
      debugHead: { x: headWorld.x, y: headWorld.y, z: headWorld.z },
    });
    return lastReport;
  }

  function releaseOwnership() {
    const report = lastReport;
    plan = null; elapsedMs = 0; lastReport = null;
    return report;
  }

  return Object.freeze({
    start,
    advance,
    apply,
    releaseOwnership,
    reset: releaseOwnership,
    get active() { return plan?.accepted === true; },
    get plan() { return plan; },
    get report() { return lastReport; },
  });
}
