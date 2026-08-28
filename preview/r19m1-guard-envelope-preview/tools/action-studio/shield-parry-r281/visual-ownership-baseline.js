export const R18N_VISUAL_OWNERSHIP_BASELINE_STAGE = 'R18N.4.1';

export const R18N_VISUAL_OWNERSHIP_WRITERS = Object.freeze({
  FRAME_START: 'frame-start',
  GUARD_RUNTIME: 'guard-runtime',
  PREDICTIVE_PRESENTATION: 'predictive-presentation',
  ACTIVE_INTERCEPT_PRIMARY: 'active-intercept-primary-arm',
  ACTIVE_INTERCEPT_RESIDUAL_ARM: 'active-intercept-residual-arm',
  RESIDUAL_BODY_REACH: 'residual-body-reach',
  RESIDUAL_STANCE_REACH: 'residual-stance-reach',
  PREDICTIVE_SHIELD_ARM_ADDITIVE: 'predictive-shield-arm-bounded-additive',
  TOP_PREP_READABILITY_HOLD: 'top-prep-readability-hold',
  ACTIVE_INTERCEPT_FINAL_CLOSURE: 'active-intercept-final-arm-closure',
  PRE_CONTACT_FINAL: 'pre-contact-final',
});

export const R18N_VISUAL_OWNERSHIP_ORDER = Object.freeze([
  R18N_VISUAL_OWNERSHIP_WRITERS.FRAME_START,
  R18N_VISUAL_OWNERSHIP_WRITERS.GUARD_RUNTIME,
  R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_PRESENTATION,
  R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_PRIMARY,
  R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_RESIDUAL_ARM,
  R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_BODY_REACH,
  R18N_VISUAL_OWNERSHIP_WRITERS.RESIDUAL_STANCE_REACH,
  R18N_VISUAL_OWNERSHIP_WRITERS.PREDICTIVE_SHIELD_ARM_ADDITIVE,
  R18N_VISUAL_OWNERSHIP_WRITERS.TOP_PREP_READABILITY_HOLD,
  R18N_VISUAL_OWNERSHIP_WRITERS.ACTIVE_INTERCEPT_FINAL_CLOSURE,
  R18N_VISUAL_OWNERSHIP_WRITERS.PRE_CONTACT_FINAL,
]);

export const R18N_VISUAL_OWNERSHIP_TRACKED_BONES = Object.freeze([
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',
  'upperleg.l', 'lowerleg.l', 'foot.l',
  'upperleg.r', 'lowerleg.r', 'foot.r',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function freezeQuaternion(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
    w: finite(value.w, 1),
  });
}

function freezePose(pose = {}, boneIds = R18N_VISUAL_OWNERSHIP_TRACKED_BONES) {
  const entries = [];
  for (const boneId of boneIds) {
    if (!pose?.[boneId]) continue;
    entries.push([boneId, freezeQuaternion(pose[boneId])]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function captureVisualOwnershipPose(rig, boneIds = R18N_VISUAL_OWNERSHIP_TRACKED_BONES) {
  const bones = rig?.bones || {};
  const pose = {};
  for (const boneId of boneIds) {
    const quaternion = bones[boneId]?.quaternion;
    if (!quaternion) continue;
    pose[boneId] = quaternion;
  }
  return freezePose(pose, boneIds);
}

export function quaternionAngularDistanceDegrees(a = {}, b = {}) {
  const ax = finite(a.x); const ay = finite(a.y); const az = finite(a.z); const aw = finite(a.w, 1);
  const bx = finite(b.x); const by = finite(b.y); const bz = finite(b.z); const bw = finite(b.w, 1);
  const aLength = Math.hypot(ax, ay, az, aw) || 1;
  const bLength = Math.hypot(bx, by, bz, bw) || 1;
  const dot = Math.abs((ax * bx + ay * by + az * bz + aw * bw) / (aLength * bLength));
  return 2 * Math.acos(clamp(dot, -1, 1)) * 180 / Math.PI;
}

export function diffVisualOwnershipPose(before = {}, after = {}, options = {}) {
  const epsilonDegrees = Math.max(0, finite(options.epsilonDegrees, 0.05));
  const boneIds = options.boneIds || Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]));
  const changedBones = [];
  const deltasDegrees = {};
  for (const boneId of boneIds) {
    const previous = before?.[boneId];
    const current = after?.[boneId];
    if (!previous || !current) continue;
    const deltaDegrees = quaternionAngularDistanceDegrees(previous, current);
    deltasDegrees[boneId] = deltaDegrees;
    if (deltaDegrees > epsilonDegrees) changedBones.push(boneId);
  }
  return Object.freeze({
    epsilonDegrees,
    changedBones: Object.freeze(changedBones),
    deltasDegrees: Object.freeze(deltasDegrees),
  });
}

function normalizePoseInput(input, boneIds) {
  if (input?.rig) return captureVisualOwnershipPose(input.rig, boneIds);
  return freezePose(input?.pose || {}, boneIds);
}

export function createVisualOwnershipBaselineRecorder(options = {}) {
  const boneIds = Object.freeze([...(options.boneIds || R18N_VISUAL_OWNERSHIP_TRACKED_BONES)]);
  const epsilonDegrees = Math.max(0, finite(options.epsilonDegrees, 0.05));
  const writerOrder = Object.freeze([...(options.writerOrder || R18N_VISUAL_OWNERSHIP_ORDER)]);
  const orderIndex = new Map(writerOrder.map((writer, index) => [writer, index]));
  let activeFrame = null;
  let latestReport = null;

  function beginFrame(input = {}) {
    const pose = normalizePoseInput(input, boneIds);
    activeFrame = {
      sequence: input.sequence ?? null,
      attackPhase: input.attackPhase ?? null,
      elapsedSeconds: Number.isFinite(Number(input.elapsedSeconds)) ? Number(input.elapsedSeconds) : null,
      samples: [Object.freeze({
        writer: R18N_VISUAL_OWNERSHIP_WRITERS.FRAME_START,
        orderIndex: orderIndex.get(R18N_VISUAL_OWNERSHIP_WRITERS.FRAME_START) ?? -1,
        orderViolation: false,
        changedBones: Object.freeze([]),
        deltasDegrees: Object.freeze({}),
        pose,
        metadata: Object.freeze({ ...(input.metadata || {}) }),
      })],
      lastOrderIndex: orderIndex.get(R18N_VISUAL_OWNERSHIP_WRITERS.FRAME_START) ?? -1,
      orderViolations: [],
      lastWriterByBone: {},
    };
    latestReport = null;
    return activeFrame.samples[0];
  }

  function record(writer, input = {}) {
    if (!activeFrame) throw new Error('R18N.4.1 visual ownership recorder requires beginFrame() before record()');
    if (!orderIndex.has(writer)) throw new Error(`R18N.4.1 unknown visual ownership writer: ${writer}`);
    if (writer === R18N_VISUAL_OWNERSHIP_WRITERS.FRAME_START) {
      throw new Error('R18N.4.1 frame-start is reserved for beginFrame()');
    }
    const previous = activeFrame.samples[activeFrame.samples.length - 1];
    const pose = normalizePoseInput(input, boneIds);
    const diff = diffVisualOwnershipPose(previous.pose, pose, { boneIds, epsilonDegrees });
    const currentOrderIndex = orderIndex.get(writer);
    const orderViolation = currentOrderIndex < activeFrame.lastOrderIndex;
    if (orderViolation) activeFrame.orderViolations.push(Object.freeze({ writer, previousWriter: previous.writer }));
    activeFrame.lastOrderIndex = Math.max(activeFrame.lastOrderIndex, currentOrderIndex);
    for (const boneId of diff.changedBones) activeFrame.lastWriterByBone[boneId] = writer;
    const sample = Object.freeze({
      writer,
      orderIndex: currentOrderIndex,
      orderViolation,
      changedBones: diff.changedBones,
      deltasDegrees: diff.deltasDegrees,
      pose,
      metadata: Object.freeze({ ...(input.metadata || {}) }),
    });
    activeFrame.samples.push(sample);
    return sample;
  }

  function finish(input = {}) {
    if (!activeFrame) return latestReport;
    const changedByWriter = {};
    for (const sample of activeFrame.samples) changedByWriter[sample.writer] = sample.changedBones;
    latestReport = Object.freeze({
      stage: R18N_VISUAL_OWNERSHIP_BASELINE_STAGE,
      sequence: activeFrame.sequence,
      attackPhase: activeFrame.attackPhase,
      elapsedSeconds: activeFrame.elapsedSeconds,
      contact: input.contact === true,
      orderValid: activeFrame.orderViolations.length === 0,
      orderViolations: Object.freeze([...activeFrame.orderViolations]),
      observedOrder: Object.freeze(activeFrame.samples.map((sample) => sample.writer)),
      expectedOrder: writerOrder,
      trackedBones: boneIds,
      changedByWriter: Object.freeze(changedByWriter),
      lastWriterByBone: Object.freeze({ ...activeFrame.lastWriterByBone }),
      samples: Object.freeze([...activeFrame.samples]),
      authority: 'observer-only-no-rig-write-no-contact-authority',
    });
    activeFrame = null;
    return latestReport;
  }

  function reset() {
    activeFrame = null;
    latestReport = null;
  }

  return Object.freeze({
    beginFrame,
    record,
    finish,
    reset,
    get active() { return Boolean(activeFrame); },
    get report() { return latestReport; },
  });
}
