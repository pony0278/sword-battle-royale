export const PARALLEL_PARRY_BODY_STAGGER_STAGE = 'G4.3B.5R.2.5';

export const PARALLEL_PARRY_BODY_STAGGER_PHASES = Object.freeze({
  WAIT: 'wait',
  RISE: 'rise',
  PEAK: 'peak',
  HANDOFF: 'handoff',
  COMPLETE: 'complete',
});

export const PARALLEL_PARRY_BODY_STAGGER_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    startMs: 30,
    riseEndMs: 92,
    peakEndMs: 156,
    completeMs: 252,
    chestScale: 1.45,
    spineScale: 1.35,
    hipsScale: 1.30,
    legScale: 1.20,
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    startMs: 24,
    riseEndMs: 86,
    peakEndMs: 172,
    completeMs: 286,
    chestScale: 1.65,
    spineScale: 1.50,
    hipsScale: 1.45,
    legScale: 1.30,
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function resolveOutcome(value, responseClass = '') {
  const explicit = String(value || '').toLowerCase();
  if (explicit === 'parry' || explicit === 'perfect-parry') return explicit;
  if (responseClass === 'perfect-parry-directional-recoil') return 'perfect-parry';
  if (responseClass === 'parry-directional-recoil') return 'parry';
  return null;
}

function getProfile(outcome, overrides = {}) {
  if (!outcome || !PARALLEL_PARRY_BODY_STAGGER_PROFILES[outcome]) return null;
  return Object.freeze({ ...PARALLEL_PARRY_BODY_STAGGER_PROFILES[outcome], ...overrides });
}

function sampleWeight(profile, elapsedMs) {
  const elapsed = Math.max(0, finite(elapsedMs));
  if (elapsed < profile.startMs) {
    return Object.freeze({ phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.WAIT, weight: 0, complete: false });
  }
  if (elapsed < profile.riseEndMs) {
    const t = (elapsed - profile.startMs) / Math.max(1, profile.riseEndMs - profile.startMs);
    return Object.freeze({ phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.RISE, weight: smoothstep01(t), complete: false });
  }
  if (elapsed < profile.peakEndMs) {
    return Object.freeze({ phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.PEAK, weight: 1, complete: false });
  }
  if (elapsed < profile.completeMs) {
    const t = (elapsed - profile.peakEndMs) / Math.max(1, profile.completeMs - profile.peakEndMs);
    return Object.freeze({ phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.HANDOFF, weight: 1 - smoothstep01(t), complete: false });
  }
  return Object.freeze({ phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.COMPLETE, weight: 0, complete: true });
}

function loadedLegs(plan = {}) {
  const attackDirection = String(plan.attackDirection || '');
  const lateralSign = Math.sign(finite(plan.weapon?.lateralSign));
  if (attackDirection === 'top') return Object.freeze({ left: 0.75, right: 0.75 });
  return Object.freeze({
    left: lateralSign >= 0 ? 1 : 0.48,
    right: lateralSign <= 0 ? 1 : 0.48,
  });
}

export function sampleParallelParryBodyStagger(input = {}) {
  const plan = input.plan;
  const outcome = resolveOutcome(input.outcome, plan?.responseClass);
  const profile = getProfile(outcome, input.profile || {});
  if (!profile || !plan?.planned) {
    return Object.freeze({
      stage: PARALLEL_PARRY_BODY_STAGGER_STAGE,
      active: false,
      complete: true,
      reason: !profile ? 'non-parry-outcome' : 'missing-recoil-plan',
      authority: 'attacker-body-only-parallel-to-shield-coupling',
    });
  }

  const elapsedMs = Math.max(0, finite(input.elapsedMs));
  const sampled = sampleWeight(profile, elapsedMs);
  const body = plan.body || {};
  const bodyStrength = Math.max(0, finite(body.strength));
  const legs = loadedLegs(plan);
  const weight = sampled.weight;
  const legBase = 7.5 * bodyStrength * profile.legScale * weight;
  const kneeBase = 11 * bodyStrength * profile.legScale * weight;

  const pose = Object.freeze({
    chestYawDegrees: finite(body.yawDegrees) * 0.58 * profile.chestScale * weight,
    chestPitchDegrees: finite(body.pitchDegrees) * 0.46 * profile.chestScale * weight,
    chestRollDegrees: finite(body.rollDegrees) * 0.72 * profile.chestScale * weight,
    spineYawDegrees: finite(body.yawDegrees) * 0.36 * profile.spineScale * weight,
    spinePitchDegrees: finite(body.pitchDegrees) * 0.34 * profile.spineScale * weight,
    spineRollDegrees: finite(body.rollDegrees) * 0.44 * profile.spineScale * weight,
    hipsYawDegrees: finite(body.yawDegrees) * 0.20 * profile.hipsScale * weight,
    hipsPitchDegrees: finite(body.pitchDegrees) * 0.18 * profile.hipsScale * weight,
    hipsRollDegrees: finite(body.rollDegrees) * 0.26 * profile.hipsScale * weight,
    leftThighBendDegrees: legBase * legs.left,
    rightThighBendDegrees: legBase * legs.right,
    leftKneeBendDegrees: kneeBase * legs.left,
    rightKneeBendDegrees: kneeBase * legs.right,
  });

  return Object.freeze({
    stage: PARALLEL_PARRY_BODY_STAGGER_STAGE,
    outcome,
    elapsedMs,
    phase: sampled.phase,
    weight,
    active: !sampled.complete,
    complete: sampled.complete,
    pose,
    profile,
    weaponChannelsTouched: false,
    rightArmChannelsTouched: false,
    rootMotion: false,
    authority: 'chest-spine-hips-legs-only-parallel-to-shield-coupling',
  });
}

function applyLocalAxisAngle(THREE, bone, axis, degrees) {
  if (!bone || Math.abs(degrees) < 1e-5) return;
  const delta = new THREE.Quaternion();
  delta.setFromAxisAngle(axis, degrees * Math.PI / 180);
  bone.quaternion.multiply(delta).normalize();
}

export function createParallelParryBodyStaggerRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3B.5R.2.5 requires THREE.Vector3 + Quaternion');
  const rig = options.rig;
  const required = ['hips', 'spine', 'chest', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r'];
  const missing = required.filter((id) => !rig?.bones?.[id]);
  if (missing.length) throw new Error(`G4.3B.5R.2.5 missing attacker body bones: ${missing.join(', ')}`);

  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  let active = null;
  let lastReport = null;

  function start(input = {}) {
    const outcome = resolveOutcome(input.outcome, input.plan?.responseClass);
    if (!outcome) return Object.freeze({ accepted: false, reason: 'non-parry-outcome', report: lastReport });
    if (!input.plan?.planned) return Object.freeze({ accepted: false, reason: 'missing-recoil-plan', report: lastReport });
    active = {
      outcome,
      plan: input.plan,
      profile: getProfile(outcome, input.profile || {}),
      elapsedMs: 0,
    };
    lastReport = Object.freeze({
      accepted: true,
      stage: PARALLEL_PARRY_BODY_STAGGER_STAGE,
      outcome,
      elapsedMs: 0,
      phase: PARALLEL_PARRY_BODY_STAGGER_PHASES.WAIT,
      weight: 0,
      active: true,
      complete: false,
      weaponChannelsTouched: false,
      rightArmChannelsTouched: false,
      rootMotion: false,
    });
    return lastReport;
  }

  function applyPose(pose) {
    if (!pose) return;
    applyLocalAxisAngle(THREE, rig.bones.hips, axisY, pose.hipsYawDegrees);
    applyLocalAxisAngle(THREE, rig.bones.hips, axisX, pose.hipsPitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones.hips, axisZ, pose.hipsRollDegrees);
    applyLocalAxisAngle(THREE, rig.bones.spine, axisY, pose.spineYawDegrees);
    applyLocalAxisAngle(THREE, rig.bones.spine, axisX, pose.spinePitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones.spine, axisZ, pose.spineRollDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisY, pose.chestYawDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisX, pose.chestPitchDegrees);
    applyLocalAxisAngle(THREE, rig.bones.chest, axisZ, pose.chestRollDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.l'], axisX, pose.leftThighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['upperleg.r'], axisX, pose.rightThighBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.l'], axisX, -pose.leftKneeBendDegrees);
    applyLocalAxisAngle(THREE, rig.bones['lowerleg.r'], axisX, -pose.rightKneeBendDegrees);
    rig.root?.updateMatrixWorld?.(true);
  }

  function update(deltaSeconds = 1 / 60) {
    if (!active) return Object.freeze({ active: false, stage: PARALLEL_PARRY_BODY_STAGGER_STAGE, report: lastReport });
    active.elapsedMs += Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
    const sample = sampleParallelParryBodyStagger({
      outcome: active.outcome,
      plan: active.plan,
      elapsedMs: active.elapsedMs,
      profile: active.profile,
    });
    applyPose(sample.pose);
    lastReport = Object.freeze({ ...sample, accepted: true });
    if (sample.complete) active = null;
    return lastReport;
  }

  function reset() {
    active = null;
    lastReport = null;
    return null;
  }

  return Object.freeze({
    start,
    update,
    reset,
    get active() { return Boolean(active); },
    get report() { return lastReport; },
  });
}
