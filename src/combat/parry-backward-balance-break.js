export const PARRY_BACKWARD_BALANCE_BREAK_STAGE = 'G4.3B.5R.2.6';

export const PARRY_BACKWARD_BALANCE_BREAK_PHASES = Object.freeze({
  WAIT: 'wait',
  RISE: 'rise',
  PEAK: 'peak',
  HANDOFF: 'handoff',
  COMPLETE: 'complete',
});

export const PARRY_BACKWARD_BALANCE_BREAK_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    startMs: 24,
    riseEndMs: 68,
    peakEndMs: 76,
    completeMs: 96,
    minimumChestBackwardDegrees: 11.5,
    pitchAmplification: 1.90,
    spinePitchRatio: 0.66,
    hipsCounterPitchRatio: 0.24,
    yawScale: 0.52,
    rollScale: 0.60,
    legScale: 1.80,
    minimumThighBendDegrees: 5.5,
    minimumKneeBendDegrees: 8.0,
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    startMs: 18,
    riseEndMs: 66,
    peakEndMs: 100,
    completeMs: 104,
    minimumChestBackwardDegrees: 15,
    pitchAmplification: 2.10,
    spinePitchRatio: 0.70,
    hipsCounterPitchRatio: 0.28,
    yawScale: 0.46,
    rollScale: 0.56,
    legScale: 2.0,
    minimumThighBendDegrees: 7.0,
    minimumKneeBendDegrees: 10.0,
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
  const base = PARRY_BACKWARD_BALANCE_BREAK_PROFILES[outcome];
  return base ? Object.freeze({ ...base, ...overrides }) : null;
}

function sampleWeight(profile, elapsedMs) {
  const elapsed = Math.max(0, finite(elapsedMs));
  if (elapsed < profile.startMs) {
    return Object.freeze({ phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.WAIT, weight: 0, complete: false });
  }
  if (elapsed < profile.riseEndMs) {
    const t = (elapsed - profile.startMs) / Math.max(1, profile.riseEndMs - profile.startMs);
    return Object.freeze({ phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.RISE, weight: smoothstep01(t), complete: false });
  }
  if (elapsed < profile.peakEndMs) {
    return Object.freeze({ phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.PEAK, weight: 1, complete: false });
  }
  if (elapsed < profile.completeMs) {
    const t = (elapsed - profile.peakEndMs) / Math.max(1, profile.completeMs - profile.peakEndMs);
    return Object.freeze({ phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.HANDOFF, weight: 1 - smoothstep01(t), complete: false });
  }
  return Object.freeze({ phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.COMPLETE, weight: 0, complete: true });
}

function loadedLegs(plan = {}) {
  const attackDirection = String(plan.attackDirection || '');
  const lateralSign = Math.sign(finite(plan.weapon?.lateralSign));
  if (attackDirection === 'top') return Object.freeze({ left: 0.78, right: 0.78 });
  return Object.freeze({
    left: lateralSign >= 0 ? 1 : 0.62,
    right: lateralSign <= 0 ? 1 : 0.62,
  });
}

export function sampleParryBackwardBalanceBreak(input = {}) {
  const plan = input.plan;
  const outcome = resolveOutcome(input.outcome, plan?.responseClass);
  const profile = getProfile(outcome, input.profile || {});
  if (!profile || !plan?.planned) {
    return Object.freeze({
      stage: PARRY_BACKWARD_BALANCE_BREAK_STAGE,
      active: false,
      complete: true,
      reason: !profile ? 'non-parry-outcome' : 'missing-recoil-plan',
      authority: 'backward-balance-break-body-first-contact-constraint-last',
    });
  }

  const elapsedMs = Math.max(0, finite(input.elapsedMs));
  const sampled = sampleWeight(profile, elapsedMs);
  const body = plan.body || {};
  const bodyStrength = Math.max(0, finite(body.strength));
  const legs = loadedLegs(plan);
  const weight = sampled.weight;

  const sourceBackwardPitch = Math.abs(finite(body.pitchDegrees));
  const chestBackwardDegrees = Math.max(
    profile.minimumChestBackwardDegrees,
    sourceBackwardPitch * profile.pitchAmplification,
  );
  const thighBase = Math.max(
    profile.minimumThighBendDegrees,
    7.5 * bodyStrength * profile.legScale,
  );
  const kneeBase = Math.max(
    profile.minimumKneeBendDegrees,
    11 * bodyStrength * profile.legScale,
  );

  const pose = Object.freeze({
    chestYawDegrees: finite(body.yawDegrees) * 0.58 * profile.yawScale * weight,
    chestPitchDegrees: -chestBackwardDegrees * weight,
    chestRollDegrees: finite(body.rollDegrees) * 0.72 * profile.rollScale * weight,
    spineYawDegrees: finite(body.yawDegrees) * 0.36 * profile.yawScale * weight,
    spinePitchDegrees: -chestBackwardDegrees * profile.spinePitchRatio * weight,
    spineRollDegrees: finite(body.rollDegrees) * 0.44 * profile.rollScale * weight,
    hipsYawDegrees: finite(body.yawDegrees) * 0.16 * profile.yawScale * weight,
    hipsPitchDegrees: chestBackwardDegrees * profile.hipsCounterPitchRatio * weight,
    hipsRollDegrees: finite(body.rollDegrees) * 0.20 * profile.rollScale * weight,
    leftThighBendDegrees: thighBase * legs.left * weight,
    rightThighBendDegrees: thighBase * legs.right * weight,
    leftKneeBendDegrees: kneeBase * legs.left * weight,
    rightKneeBendDegrees: kneeBase * legs.right * weight,
  });

  return Object.freeze({
    stage: PARRY_BACKWARD_BALANCE_BREAK_STAGE,
    outcome,
    elapsedMs,
    phase: sampled.phase,
    weight,
    active: !sampled.complete,
    complete: sampled.complete,
    pose,
    profile,
    chestBackwardDegrees: chestBackwardDegrees * weight,
    bodyFirst: true,
    contactConstraintLast: true,
    rootMotion: false,
    handoffTarget: 'G4.3B.5R.2.8',
    authority: 'backward-preload-releases-before-legacy-two-actor-recoil-passthrough',
  });
}

function applyLocalAxisAngle(THREE, bone, axis, degrees) {
  if (!bone || Math.abs(degrees) < 1e-5) return;
  const delta = new THREE.Quaternion();
  delta.setFromAxisAngle(axis, degrees * Math.PI / 180);
  bone.quaternion.multiply(delta).normalize();
}

export function createParryBackwardBalanceBreakRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3B.5R.2.6 requires THREE.Vector3 + Quaternion');
  const rig = options.rig;
  const required = ['hips', 'spine', 'chest', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r'];
  const missing = required.filter((id) => !rig?.bones?.[id]);
  if (missing.length) throw new Error(`G4.3B.5R.2.6 missing attacker balance-break bones: ${missing.join(', ')}`);

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
      active: true,
      stage: PARRY_BACKWARD_BALANCE_BREAK_STAGE,
      outcome,
      elapsedMs: 0,
      phase: PARRY_BACKWARD_BALANCE_BREAK_PHASES.WAIT,
      weight: 0,
      rootMotion: false,
    });
    return lastReport;
  }

  function applyPose(pose) {
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
    if (!active) return Object.freeze({ active: false, stage: PARRY_BACKWARD_BALANCE_BREAK_STAGE, report: lastReport });
    active.elapsedMs += Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
    const sample = sampleParryBackwardBalanceBreak({
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
