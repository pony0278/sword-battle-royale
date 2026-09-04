import {
  LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
  publishPostCouplingRecoilStaggerHandoff,
} from './post-coupling-recoil-stagger-handoff.js';

export const SHIELD_DRIVEN_CONTACT_COUPLING_STAGE = 'G4.3B.5R.2';

export const SHIELD_CONTACT_COUPLING_PHASES = Object.freeze({
  HOLD: 'contact-hold',
  DRIVE: 'shield-drive',
  RELEASE: 'contact-release',
  COMPLETE: 'complete',
});

export const SHIELD_CONTACT_COUPLING_PROFILES = Object.freeze({
  block: Object.freeze({
    outcome: 'block', durationMs: 105, holdMs: 18, driveEndMs: 68,
    shieldGiveMeters: 0.035, shieldSweepMeters: 0, shieldLiftMeters: 0,
    attackerFollowRatio: 0.82, attackerReleaseBiasMeters: 0.012,
    defenderUpperArmMaxDegrees: 10, defenderLowerArmMaxDegrees: 14,
    attackerUpperArmMaxDegrees: 10, attackerLowerArmMaxDegrees: 14,
  }),
  parry: Object.freeze({
    outcome: 'parry', durationMs: 96, holdMs: 12, driveEndMs: 72,
    shieldGiveMeters: 0.012, shieldSweepMeters: 0.105, shieldLiftMeters: 0.028,
    attackerFollowRatio: 0.88, attackerReleaseBiasMeters: 0.018,
    defenderUpperArmMaxDegrees: 16, defenderLowerArmMaxDegrees: 22,
    attackerUpperArmMaxDegrees: 14, attackerLowerArmMaxDegrees: 20,
    recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry', durationMs: 104, holdMs: 10, driveEndMs: 76,
    shieldGiveMeters: 0.010, shieldSweepMeters: 0.125, shieldLiftMeters: 0.036,
    attackerFollowRatio: 0.92, attackerReleaseBiasMeters: 0.024,
    defenderUpperArmMaxDegrees: 18, defenderLowerArmMaxDegrees: 25,
    attackerUpperArmMaxDegrees: 16, attackerLowerArmMaxDegrees: 23,
    recoilHandoffMode: LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE,
  }),
});

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp01(value) { return Math.max(0, Math.min(1, finite(value))); }
function smoothstep(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }
function vec(input = {}) { return { x: finite(input.x), y: finite(input.y), z: finite(input.z) }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function length(a) { return Math.hypot(a.x, a.y, a.z); }
function normalize(a, fallback = { x: 0, y: 0, z: 1 }) {
  const m = length(a); return m > 1e-8 ? { x: a.x / m, y: a.y / m, z: a.z / m } : { ...fallback };
}
function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function freezeVector(a) { return Object.freeze({ x: a.x, y: a.y, z: a.z }); }
function resolveOutcome(value) {
  const key = String(value || 'block').toLowerCase();
  return SHIELD_CONTACT_COUPLING_PROFILES[key] ? key : 'block';
}
function lateralSignFor(direction, contactPoint = {}) {
  if (direction === 'left') return 1;
  if (direction === 'right') return -1;
  const x = finite(contactPoint.x); return Math.abs(x) > 0.015 ? Math.sign(x) : 1;
}

export function getShieldContactCouplingProfile(outcome = 'block', overrides = {}) {
  return Object.freeze({ ...SHIELD_CONTACT_COUPLING_PROFILES[resolveOutcome(outcome)], ...overrides });
}

export function sampleShieldContactCoupling(input = {}) {
  const outcome = resolveOutcome(input.outcome);
  const profile = getShieldContactCouplingProfile(outcome, input.profile || {});
  const rawElapsedMs = Math.max(0, finite(input.elapsedMs));
  const elapsedMs = Math.min(rawElapsedMs, profile.durationMs);
  const complete = rawElapsedMs >= profile.durationMs;
  const incomingDirection = normalize(vec(input.incomingVelocity || input.incomingDirection));
  const worldUp = { x: 0, y: 1, z: 0 };
  let tangent = normalize(cross(worldUp, incomingDirection), { x: 1, y: 0, z: 0 });
  tangent = scale(tangent, lateralSignFor(String(input.attackDirection || '').toLowerCase(), input.contactPoint));

  let phase = SHIELD_CONTACT_COUPLING_PHASES.HOLD;
  let drive = 0;
  let release = 0;
  if (elapsedMs > profile.holdMs && elapsedMs <= profile.driveEndMs) {
    phase = SHIELD_CONTACT_COUPLING_PHASES.DRIVE;
    drive = smoothstep((elapsedMs - profile.holdMs) / Math.max(1, profile.driveEndMs - profile.holdMs));
  } else if (elapsedMs > profile.driveEndMs) {
    phase = complete ? SHIELD_CONTACT_COUPLING_PHASES.COMPLETE : SHIELD_CONTACT_COUPLING_PHASES.RELEASE;
    drive = 1;
    release = smoothstep((elapsedMs - profile.driveEndMs) / Math.max(1, profile.durationMs - profile.driveEndMs));
  }

  const give = profile.shieldGiveMeters * (phase === SHIELD_CONTACT_COUPLING_PHASES.HOLD ? 0 : (1 - 0.45 * release) * drive);
  const sweep = profile.shieldSweepMeters * drive;
  const lift = profile.shieldLiftMeters * drive;
  const shieldOffset = add(add(scale(incomingDirection, give), scale(tangent, sweep)), scale(worldUp, lift));
  const follow = scale(shieldOffset, profile.attackerFollowRatio);
  const attackerWeaponOffset = add(follow, scale(tangent, profile.attackerReleaseBiasMeters * release));

  return Object.freeze({
    stage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
    outcome,
    phase,
    elapsedMs: rawElapsedMs,
    complete,
    releaseAttackerRecoil: complete,
    recoilHandoffMode: profile.recoilHandoffMode || null,
    driveProgress: drive,
    releaseProgress: release,
    incomingDirection: freezeVector(incomingDirection),
    shieldTangent: freezeVector(tangent),
    shieldOffset: freezeVector(shieldOffset),
    attackerWeaponOffset: freezeVector(attackerWeaponOffset),
    profile,
  });
}

function aimEffectorWithBone(THREE, bone, effectorWorld, targetWorld, maxDegrees) {
  if (!bone || maxDegrees <= 0) return 0;
  const boneWorld = new THREE.Vector3(); bone.getWorldPosition(boneWorld);
  const current = effectorWorld.clone().sub(boneWorld); const target = targetWorld.clone().sub(boneWorld);
  if (current.lengthSq() < 1e-10 || target.lengthSq() < 1e-10) return 0;
  current.normalize(); target.normalize();
  const desired = new THREE.Quaternion().setFromUnitVectors(current, target);
  const raw = 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(desired.w))));
  if (raw < 1e-6) return 0;
  const applied = Math.min(raw, maxDegrees * Math.PI / 180);
  const limited = new THREE.Quaternion(); limited.slerpQuaternions(new THREE.Quaternion(), desired, applied / raw);
  const parentWorld = new THREE.Quaternion(); bone.parent?.getWorldQuaternion(parentWorld);
  const localDelta = parentWorld.clone().invert().multiply(limited).multiply(parentWorld);
  bone.quaternion.premultiply(localDelta).normalize();
  return applied * 180 / Math.PI;
}

export function createShieldDrivenContactCouplingRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) throw new Error('G4.3B.5R.2 requires THREE.Vector3 + Quaternion');
  const defenderRig = options.defenderRig; const attackerRig = options.attackerRig; const buckler = options.buckler;
  if (!defenderRig?.bones?.['upperarm.l'] || !defenderRig?.bones?.['lowerarm.l']) throw new Error('G4.3B.5R.2 requires defender left-arm bones');
  if (!attackerRig?.bones?.['upperarm.r'] || !attackerRig?.bones?.['lowerarm.r'] || !attackerRig?.bones?.['hand.r']) throw new Error('G4.3B.5R.2 requires attacker right-arm bones');
  if (!buckler?.getWorldParrySurface) throw new Error('G4.3B.5R.2 requires Buckler parry surface');

  const defenderTarget = new THREE.Vector3(); const defenderEffector = new THREE.Vector3();
  const attackerBaseHand = new THREE.Vector3(); const attackerTarget = new THREE.Vector3(); const attackerEffector = new THREE.Vector3();
  let active = null; let lastReport = null;

  function reset() { active = null; lastReport = null; return null; }
  function start(input = {}) {
    if (active) return Object.freeze({ accepted: false, reason: 'shield-contact-coupling-already-active', report: lastReport });
    const outcome = resolveOutcome(input.outcome); const profile = getShieldContactCouplingProfile(outcome, input.profile || {});
    const surface = input.surfaceAtContact || buckler.getWorldParrySurface();
    attackerRig.root?.updateMatrixWorld?.(true); attackerRig.bones['hand.r'].getWorldPosition(attackerBaseHand);
    active = {
      outcome, profile, attackDirection: String(input.attackDirection || ''),
      contactPoint: vec(input.contactPoint || input.contact?.point),
      incomingVelocity: vec(input.incomingVelocity || input.contact?.incomingVelocity),
      surfaceCenter: vec(surface.center), elapsedMs: 0,
    };
    lastReport = Object.freeze({
      accepted: true,
      active: true,
      stage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
      outcome,
      phase: SHIELD_CONTACT_COUPLING_PHASES.HOLD,
      elapsedMs: 0,
      complete: false,
      releaseAttackerRecoil: false,
      recoilHandoffMode: profile.recoilHandoffMode || null,
      profile,
    });
    return lastReport;
  }

  function reapplyAttackerConstraint(report = lastReport) {
    const profile = report?.profile;
    const offset = report?.attackerWeaponOffset;
    if (!profile || !offset) {
      return Object.freeze({ applied: false, reason: 'missing-coupling-terminal-report' });
    }
    const appliedDegrees = { attackerUpperArm: 0, attackerLowerArm: 0 };
    attackerTarget.set(attackerBaseHand.x + offset.x, attackerBaseHand.y + offset.y, attackerBaseHand.z + offset.z);
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerRig.bones['hand.r'].getWorldPosition(attackerEffector);
    appliedDegrees.attackerLowerArm = aimEffectorWithBone(
      THREE,
      attackerRig.bones['lowerarm.r'],
      attackerEffector,
      attackerTarget,
      profile.attackerLowerArmMaxDegrees,
    );
    attackerRig.root?.updateMatrixWorld?.(true);
    attackerRig.bones['hand.r'].getWorldPosition(attackerEffector);
    appliedDegrees.attackerUpperArm = aimEffectorWithBone(
      THREE,
      attackerRig.bones['upperarm.r'],
      attackerEffector,
      attackerTarget,
      profile.attackerUpperArmMaxDegrees,
    );
    attackerRig.root?.updateMatrixWorld?.(true);
    return Object.freeze({
      applied: true,
      stage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE,
      reason: 'terminal-attacker-contact-constraint-reapplied',
      appliedDegrees: Object.freeze(appliedDegrees),
      attackerWeaponOffset: offset,
    });
  }

  function update(deltaSeconds = 1 / 60) {
    if (!active) return Object.freeze({ active: false, stage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE, report: lastReport });
    active.elapsedMs += Math.max(0, finite(deltaSeconds, 1 / 60)) * 1000;
    const sample = sampleShieldContactCoupling({
      outcome: active.outcome, elapsedMs: active.elapsedMs, attackDirection: active.attackDirection,
      contactPoint: active.contactPoint, incomingVelocity: active.incomingVelocity, profile: active.profile,
    });
    const appliedDegrees = { defenderUpperArm: 0, defenderLowerArm: 0, attackerUpperArm: 0, attackerLowerArm: 0 };

    defenderTarget.set(active.surfaceCenter.x + sample.shieldOffset.x, active.surfaceCenter.y + sample.shieldOffset.y, active.surfaceCenter.z + sample.shieldOffset.z);
    for (let i = 0; i < 2; i += 1) {
      const surface = buckler.getWorldParrySurface(); defenderEffector.set(surface.center.x, surface.center.y, surface.center.z);
      appliedDegrees.defenderLowerArm += aimEffectorWithBone(THREE, defenderRig.bones['lowerarm.l'], defenderEffector, defenderTarget, Math.max(0, active.profile.defenderLowerArmMaxDegrees - appliedDegrees.defenderLowerArm));
      defenderRig.root?.updateMatrixWorld?.(true);
      const afterLower = buckler.getWorldParrySurface(); defenderEffector.set(afterLower.center.x, afterLower.center.y, afterLower.center.z);
      appliedDegrees.defenderUpperArm += aimEffectorWithBone(THREE, defenderRig.bones['upperarm.l'], defenderEffector, defenderTarget, Math.max(0, active.profile.defenderUpperArmMaxDegrees - appliedDegrees.defenderUpperArm));
      defenderRig.root?.updateMatrixWorld?.(true);
    }

    attackerTarget.set(attackerBaseHand.x + sample.attackerWeaponOffset.x, attackerBaseHand.y + sample.attackerWeaponOffset.y, attackerBaseHand.z + sample.attackerWeaponOffset.z);
    attackerRig.bones['hand.r'].getWorldPosition(attackerEffector);
    appliedDegrees.attackerLowerArm = aimEffectorWithBone(THREE, attackerRig.bones['lowerarm.r'], attackerEffector, attackerTarget, active.profile.attackerLowerArmMaxDegrees);
    attackerRig.root?.updateMatrixWorld?.(true); attackerRig.bones['hand.r'].getWorldPosition(attackerEffector);
    appliedDegrees.attackerUpperArm = aimEffectorWithBone(THREE, attackerRig.bones['upperarm.r'], attackerEffector, attackerTarget, active.profile.attackerUpperArmMaxDegrees);
    attackerRig.root?.updateMatrixWorld?.(true);

    const finalSurface = buckler.getWorldParrySurface();
    const surfaceAtContact = Object.freeze({ center: freezeVector(active.surfaceCenter) });
    lastReport = Object.freeze({
      active: !sample.complete, stage: SHIELD_DRIVEN_CONTACT_COUPLING_STAGE, outcome: active.outcome,
      phase: sample.phase, elapsedMs: active.elapsedMs, complete: sample.complete,
      releaseAttackerRecoil: sample.releaseAttackerRecoil,
      recoilHandoffMode: sample.recoilHandoffMode,
      incomingDirection: sample.incomingDirection,
      shieldTangent: sample.shieldTangent,
      shieldOffset: sample.shieldOffset,
      attackerWeaponOffset: sample.attackerWeaponOffset,
      appliedDegrees: Object.freeze(appliedDegrees), finalSurface, profile: active.profile,
    });
    if (sample.complete) {
      publishPostCouplingRecoilStaggerHandoff(attackerRig, {
        couplingReport: lastReport,
        surfaceAtContact,
      });
      active = null;
    }
    return lastReport;
  }

  return Object.freeze({
    start,
    update,
    reset,
    reapplyAttackerConstraint,
    get active() { return Boolean(active); },
    get report() { return lastReport; },
  });
}
