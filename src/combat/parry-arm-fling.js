import {
  ARTICULATED_ARM_IMPULSE_DEFAULTS,
  stepArticulatedArmState,
} from './articulated-arm-impulse-chain.js';

export const PARRY_ARM_FLING_STAGE = 'R18P.1';

// The parried weapon arm is flung by the same contact that decided the parry,
// not by an authored pose. The release impulse is built from three measured
// vectors -- the shield surface normal at impact, the sword's incoming
// velocity, and the defender's own shield sweep velocity -- so the direction
// the arm flies is decided by the geometry of the exchange: a TOP parry
// throws the arm up over the shoulder, a side parry throws it across the
// body. Per-joint swing axes come from each joint's own lever arm to the
// contact point, which is what removes any per-direction authoring.
//
// The chain then integrates freely (articulated-arm-impulse-chain's scalar
// integrator: passive stiffness, damping, joint limits). The joint limits are
// the choreography: the arm flies until they catch it, and the low return
// stiffness keeps it hung there through the off-balance beats.
export const PARRY_ARM_FLING_PROFILES = Object.freeze({
  parry: Object.freeze({
    outcome: 'parry',
    restitution: 0.66,
    friction: 0.85,
    impulseGain: 1.0,
    maximumImpulseNs: 10,
    // The fling only ever runs after a confirmed real-contact parry, so the
    // closing speed carries a floor: the lab's slow-review clock can scale the
    // measured incoming velocity down to where the shield sweep cancels it,
    // and a confirmed hit that produces no reaction is worse than a floored
    // one. The floor approximates the committed attack's authored speed.
    minimumClosingSpeedMetersPerSecond: 3.0,
    // The knock-aside: a parry does not just stop the blade, it carries it
    // across the shield face, perpendicular to its approach. That in-plane
    // direction is computed from the real contact geometry -- for a vertical
    // chop it points up, for a horizontal cut it points across -- and it is
    // the term that actually throws the arm open.
    deflectCarryRatio: 1.15,
    // The constrained hand is already moving with the shield sweep when the
    // marker releases it. That motion is the defender's parry made kinetic --
    // for a TOP exchange it points up -- and it continues into the fling as a
    // second impulse at the hand, weighted by the sword-and-hand mass.
    effectiveHandMassKg: 1.6,
    maximumJointSpeedRadPerSecond: 24,
    jointInertiaKgM2: ARTICULATED_ARM_IMPULSE_DEFAULTS.jointInertiaKgM2,
    // Far softer than the articulated lab's defaults: the fling must hang at
    // the limits through the ~500ms of off-balance beats, not spring back.
    returnStiffnessNmPerRad: Object.freeze({ shoulder: 1.7, elbow: 1.5, wrist: 1.1 }),
    returnDampingNmsPerRad: Object.freeze({ shoulder: 1.15, elbow: 0.72, wrist: 0.36 }),
    // While the off-balance beats run, the return spring is nearly slack so
    // the caught arm hangs at the limit; full stiffness only returns for the
    // recovery. Fast catch and long hang need opposite damping, so the hang
    // is choreography, not physics.
    limitHoldMs: 460,
    limitHoldStiffnessScale: 0.12,
    // One-sided travel from the release pose: the impulse chooses the axis,
    // these choose where the joint is caught.
    travelLimitsRad: Object.freeze({
      shoulder: Object.freeze([-0.12, 1.30]),
      elbow: Object.freeze([-0.16, 0.95]),
      wrist: Object.freeze([-0.20, 0.85]),
    }),
    offHandRatio: 0.62,
    authority: 'contact-impulse-flings-the-weapon-arm-until-joint-limits-catch-it',
  }),
  'perfect-parry': Object.freeze({
    outcome: 'perfect-parry',
    restitution: 0.78,
    friction: 0.95,
    impulseGain: 1.15,
    maximumImpulseNs: 12,
    minimumClosingSpeedMetersPerSecond: 3.5,
    deflectCarryRatio: 1.35,
    effectiveHandMassKg: 1.8,
    maximumJointSpeedRadPerSecond: 28,
    jointInertiaKgM2: ARTICULATED_ARM_IMPULSE_DEFAULTS.jointInertiaKgM2,
    returnStiffnessNmPerRad: Object.freeze({ shoulder: 1.6, elbow: 1.4, wrist: 1.0 }),
    returnDampingNmsPerRad: Object.freeze({ shoulder: 1.10, elbow: 0.70, wrist: 0.34 }),
    limitHoldMs: 560,
    limitHoldStiffnessScale: 0.10,
    travelLimitsRad: Object.freeze({
      shoulder: Object.freeze([-0.12, 1.48]),
      elbow: Object.freeze([-0.16, 1.05]),
      wrist: Object.freeze([-0.20, 0.92]),
    }),
    offHandRatio: 0.72,
    authority: 'contact-impulse-flings-the-weapon-arm-until-joint-limits-catch-it',
  }),
});

export const PARRY_ARM_FLING_JOINT_BONES = Object.freeze({
  shoulder: 'upperarm.r',
  elbow: 'lowerarm.r',
  wrist: 'wrist.r',
});

export const PARRY_ARM_FLING_OFF_HAND_BONE = 'upperarm.l';

const JOINT_NAMES = Object.freeze(['shoulder', 'elbow', 'wrist']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vec(value) {
  return { x: finite(value?.x), y: finite(value?.y), z: finite(value?.z) };
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function length(v) { return Math.hypot(v.x, v.y, v.z); }
function normalize(v) {
  const m = length(v);
  return m > 1e-9 ? mul(v, 1 / m) : null;
}
function freezeVector(v) { return Object.freeze({ x: v.x, y: v.y, z: v.z }); }

function rejection(reason) {
  return Object.freeze({ stage: PARRY_ARM_FLING_STAGE, accepted: false, reason });
}

function resolveProfile(outcome, overrides) {
  const base = PARRY_ARM_FLING_PROFILES[String(outcome || '').toLowerCase()]
    || PARRY_ARM_FLING_PROFILES.parry;
  return overrides ? { ...base, ...overrides } : base;
}

// The release impulse. jn rebounds the closing speed along the shield normal
// (restitution is the "反彈更大" knob); the tangential term is Coulomb drag
// toward the shield's own sweep velocity, which is how the defender's parry
// motion carries the sword with it.
export function computeParryArmFlingImpulse(input = {}) {
  const profile = resolveProfile(input.outcome, input.profile);
  let normal = normalize(vec(input.surfaceNormal));
  if (!normal) return rejection('missing-surface-normal');

  // The buckler reports its authored face normal, whose sign convention is
  // the shield's, not this solver's. The impulse must push the sword back
  // toward the attacker, so the normal is flipped onto the attacker's side
  // of the face when a side hint (the attacker's backward axis) says it
  // points the other way.
  const sideHint = normalize(vec(input.normalSideHint));
  if (sideHint && dot(normal, sideHint) < 0) normal = mul(normal, -1);

  const incoming = vec(input.incomingVelocity);
  const sweep = vec(input.shieldSweepVelocity);
  const momentum = Math.max(0.6, Math.min(1.6, finite(input.momentum, 1)));

  const relative = sub(incoming, sweep);
  const measuredClosingSpeed = dot(relative, normal);
  const closingSpeed = Math.min(
    measuredClosingSpeed,
    -Math.max(0, finite(profile.minimumClosingSpeedMetersPerSecond)),
  );
  if (closingSpeed >= -1e-6) return rejection('no-closing-contact-speed');

  const jn = -(1 + profile.restitution) * closingSpeed * momentum * profile.impulseGain;
  const sweepTangential = sub(sweep, mul(normal, dot(sweep, normal)));
  const tangentDirection = normalize(sweepTangential);
  const jt = tangentDirection ? Math.min(profile.friction * jn, length(sweepTangential) * jn) : 0;

  // In-plane knock-aside: a parry does not just stop the blade, it returns
  // it along the way it came. The carry direction opposes the tangential
  // component of the blade's approach across the shield face -- a downward
  // chop is knocked back up, a horizontal cut is knocked back across -- so
  // every direction gets its own correct throw with no branching.
  const carryRatio = Math.max(0, finite(profile.deflectCarryRatio));
  let carryDirection = null;
  if (carryRatio > 0) {
    const tangentialApproach = sub(relative, mul(normal, dot(relative, normal)));
    const opposed = normalize(tangentialApproach);
    if (opposed) carryDirection = mul(opposed, -1);
  }

  let impulse = mul(normal, jn);
  if (tangentDirection && jt > 0) impulse = add(impulse, mul(tangentDirection, jt));
  if (carryDirection) impulse = add(impulse, mul(carryDirection, carryRatio * jn));
  const magnitude = length(impulse);
  if (magnitude > profile.maximumImpulseNs) {
    impulse = mul(impulse, profile.maximumImpulseNs / magnitude);
  }

  return Object.freeze({
    stage: PARRY_ARM_FLING_STAGE,
    accepted: true,
    profile,
    outcome: profile.outcome,
    momentum,
    closingSpeed,
    measuredClosingSpeed,
    incomingUsed: freezeVector(incoming),
    sweepUsed: freezeVector(sweep),
    normalUsed: freezeVector(normal),
    normalImpulseNs: jn,
    tangentImpulseNs: jt,
    carryImpulseNs: carryDirection ? carryRatio * jn : 0,
    carryDirection: carryDirection ? freezeVector(carryDirection) : null,
    impulse: freezeVector(impulse),
    impulseMagnitudeNs: Math.min(magnitude, profile.maximumImpulseNs),
  });
}

// Each joint swings about the axis of its own lever-arm torque, at the
// angular speed that torque impulse produces through its inertia. Rotating a
// positive angle about (r x J) moves the contact point along J, so the whole
// arm chases the impulse without any per-direction branching.
export function planParryArmFling(input = {}) {
  const impulseReport = computeParryArmFlingImpulse(input);
  if (!impulseReport.accepted) return impulseReport;

  const contactPoint = vec(input.contactPoint);
  const jointOrigins = input.jointOrigins || {};
  const profile = impulseReport.profile;

  // Second impulse: the hand's momentum at release. The grip constraint had
  // the hand riding the shield sweep, so this carries the defender's parry
  // direction (up, for TOP) into the fling instead of discarding it.
  const handOrigin = input.handOrigin ? vec(input.handOrigin) : null;
  const handVelocity = vec(input.handReleaseVelocity);
  const handImpulse = handOrigin
    ? mul(handVelocity, Math.max(0, finite(profile.effectiveHandMassKg)))
    : null;

  const joints = {};
  for (const name of JOINT_NAMES) {
    const origin = jointOrigins[name];
    if (!origin) return rejection(`missing-joint-origin-${name}`);
    const lever = sub(contactPoint, vec(origin));
    let torqueImpulse = cross(lever, impulseReport.impulse);
    if (handImpulse) {
      torqueImpulse = add(torqueImpulse, cross(sub(handOrigin, vec(origin)), handImpulse));
    }
    const axis = normalize(torqueImpulse);
    if (!axis) return rejection(`degenerate-lever-arm-${name}`);
    const inertia = Math.max(1e-4, finite(profile.jointInertiaKgM2[name], 0.1));
    const speed = Math.min(
      length(torqueImpulse) / inertia,
      profile.maximumJointSpeedRadPerSecond,
    );
    joints[name] = Object.freeze({
      axis: freezeVector(axis),
      leverArmMeters: length(lever),
      initialVelocityRadPerSecond: speed,
      travelLimitRad: Object.freeze([...profile.travelLimitsRad[name]]),
    });
  }

  // The off-hand hangs at the side, so the weapon arm's own axis barely
  // lifts it. It gets the lateral axis of the impulse instead -- the arm
  // swings up and away from the hit, the startle half of the thrown-open
  // silhouette -- scaled by the profile ratio.
  const offHandAxis = normalize(cross(impulseReport.impulse, { x: 0, y: 1, z: 0 }))
    || joints.shoulder.axis;

  return Object.freeze({
    ...impulseReport,
    contactPoint: freezeVector(contactPoint),
    joints: Object.freeze(joints),
    offHandAxis: freezeVector(offHandAxis),
    offHandRatio: profile.offHandRatio,
    startsAfterDeflectImpulse: true,
    authority: profile.authority,
  });
}

// Pure integrator over the plan: three scalar joint angles driven by the
// articulated chain's step (passive stiffness pulls back toward the release
// pose, joint limits catch the fling). Substepped for stability.
export function createParryArmFlingIntegrator(plan) {
  if (plan?.accepted !== true) return null;
  const profile = plan.profile;
  const holdMs = Math.max(0, finite(profile.limitHoldMs));
  const holdScale = Math.max(0, Math.min(1, finite(profile.limitHoldStiffnessScale, 1)));
  const scaledStiffness = (scale) => ({
    shoulder: profile.returnStiffnessNmPerRad.shoulder * scale,
    elbow: profile.returnStiffnessNmPerRad.elbow * scale,
    wrist: profile.returnStiffnessNmPerRad.wrist * scale,
  });
  const stepProfileFor = (nowMs) => ({
    restAnglesRad: { shoulder: 0, elbow: 0, wrist: 0 },
    jointInertiaKgM2: profile.jointInertiaKgM2,
    passiveStiffnessNmPerRad: scaledStiffness(nowMs < holdMs ? holdScale : 1),
    passiveDampingNmsPerRad: profile.returnDampingNmsPerRad,
    jointLimitsRad: profile.travelLimitsRad,
  });
  let state = {
    anglesRad: { shoulder: 0, elbow: 0, wrist: 0 },
    jointVelocityRadPerSecond: {
      shoulder: plan.joints.shoulder.initialVelocityRadPerSecond,
      elbow: plan.joints.elbow.initialVelocityRadPerSecond,
      wrist: plan.joints.wrist.initialVelocityRadPerSecond,
    },
  };
  let elapsedMs = 0;
  let anyLimitHit = false;

  return Object.freeze({
    advance(deltaMs = 0) {
      const totalSeconds = Math.max(0, finite(deltaMs)) / 1000;
      const substeps = Math.max(1, Math.ceil(totalSeconds / (1 / 240)));
      const dt = totalSeconds / substeps;
      let limitHits = { shoulder: false, elbow: false, wrist: false };
      for (let i = 0; i < substeps; i += 1) {
        const next = stepArticulatedArmState(state, dt, stepProfileFor(elapsedMs + i * dt * 1000));
        state = {
          anglesRad: { ...next.anglesRad },
          jointVelocityRadPerSecond: { ...next.jointVelocityRadPerSecond },
        };
        for (const name of JOINT_NAMES) limitHits[name] = limitHits[name] || next.limitHits[name];
      }
      anyLimitHit = anyLimitHit
        || limitHits.shoulder || limitHits.elbow || limitHits.wrist;
      elapsedMs += Math.max(0, finite(deltaMs));
      return Object.freeze({
        stage: PARRY_ARM_FLING_STAGE,
        elapsedMs,
        anglesRad: Object.freeze({ ...state.anglesRad }),
        jointVelocityRadPerSecond: Object.freeze({ ...state.jointVelocityRadPerSecond }),
        limitHits: Object.freeze(limitHits),
        caughtByJointLimit: anyLimitHit,
      });
    },
    get anglesRad() { return Object.freeze({ ...state.anglesRad }); },
    get elapsedMs() { return elapsedMs; },
    get caughtByJointLimit() { return anyLimitHit; },
  });
}

// THREE-side runtime. Owns upperarm.r / lowerarm.r / wrist.r (and the
// off-hand upper arm) from DEFLECT_IMPULSE: every apply() rewrites the bones
// from base quaternions captured at release, so the presentation's own arm
// writes earlier in the frame are replaced, not stacked. releaseOwnership()
// stops without restoring, so the recovery blend starts from the flung pose.
export function createParryArmFlingRuntime(THREE, options = {}) {
  if (!THREE?.Vector3 || !THREE?.Quaternion) {
    throw new Error('R18P.1 requires THREE.Vector3 + Quaternion');
  }
  const rig = options.rig || null;
  const worldPosition = new THREE.Vector3();
  const parentWorld = new THREE.Quaternion();
  const worldDelta = new THREE.Quaternion();
  const localDelta = new THREE.Quaternion();
  const axisVector = new THREE.Vector3();

  let plan = null;
  let integrator = null;
  let baseQuaternions = null;
  let lastReport = null;

  function bone(id) { return rig?.bones?.[id] || null; }

  function jointBoneIds() {
    return [
      ...JOINT_NAMES.map((name) => PARRY_ARM_FLING_JOINT_BONES[name]),
      PARRY_ARM_FLING_OFF_HAND_BONE,
    ];
  }

  function captureBases() {
    const bases = {};
    for (const id of jointBoneIds()) {
      const target = bone(id);
      if (!target?.quaternion) return null;
      bases[id] = target.quaternion.clone();
    }
    return bases;
  }

  function readJointOrigins() {
    const origins = {};
    for (const name of JOINT_NAMES) {
      const target = bone(PARRY_ARM_FLING_JOINT_BONES[name]);
      if (!target?.getWorldPosition) return null;
      target.getWorldPosition(worldPosition);
      origins[name] = { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z };
    }
    return origins;
  }

  function applyWorldAxisRotation(target, base, axis, angleRad) {
    axisVector.set(axis.x, axis.y, axis.z);
    worldDelta.setFromAxisAngle(axisVector, angleRad);
    parentWorld.identity();
    target.parent?.getWorldQuaternion?.(parentWorld);
    localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld);
    target.quaternion.copy(base).premultiply(localDelta);
  }

  function start(input = {}) {
    const jointOrigins = readJointOrigins();
    if (!jointOrigins) {
      plan = null; integrator = null; baseQuaternions = null; lastReport = null;
      return rejection('rig-arm-bones-unavailable');
    }
    const planned = planParryArmFling({ ...input, jointOrigins });
    if (!planned.accepted) {
      plan = null; integrator = null; baseQuaternions = null; lastReport = null;
      return planned;
    }
    baseQuaternions = captureBases();
    if (!baseQuaternions) {
      plan = null; integrator = null; lastReport = null;
      return rejection('rig-arm-bones-unavailable');
    }
    plan = planned;
    integrator = createParryArmFlingIntegrator(planned);
    lastReport = null;
    return planned;
  }

  function advance(deltaMs = 0) {
    if (!integrator) return null;
    lastReport = integrator.advance(deltaMs);
    return lastReport;
  }

  function apply() {
    if (!plan || !lastReport || !baseQuaternions) return null;
    for (const name of JOINT_NAMES) {
      const id = PARRY_ARM_FLING_JOINT_BONES[name];
      applyWorldAxisRotation(
        bone(id),
        baseQuaternions[id],
        plan.joints[name].axis,
        lastReport.anglesRad[name],
      );
    }
    applyWorldAxisRotation(
      bone(PARRY_ARM_FLING_OFF_HAND_BONE),
      baseQuaternions[PARRY_ARM_FLING_OFF_HAND_BONE],
      plan.offHandAxis,
      lastReport.anglesRad.shoulder * plan.offHandRatio,
    );
    return lastReport;
  }

  // The reaction is over and the recovery blend will capture whatever pose is
  // on the rig, so stop writing without rewinding the arm.
  function releaseOwnership() {
    const report = lastReport;
    plan = null; integrator = null; baseQuaternions = null; lastReport = null;
    return report;
  }

  function reset() {
    if (baseQuaternions) {
      for (const id of jointBoneIds()) bone(id)?.quaternion?.copy?.(baseQuaternions[id]);
    }
    return releaseOwnership() && null;
  }

  return Object.freeze({
    start,
    advance,
    apply,
    releaseOwnership,
    reset,
    get active() { return Boolean(plan); },
    get plan() { return plan; },
    get report() { return lastReport; },
  });
}
