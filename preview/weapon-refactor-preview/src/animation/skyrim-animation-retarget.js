import { sanitizeAnimationTargetName } from './animation-target-name.js';

function aliases(...names) {
  return Object.freeze(names.filter(Boolean));
}

export const SKYRIM_BONE_RETARGETS = Object.freeze([
  Object.freeze({
    id: 'root',
    sourceAliases: aliases('NPC Root [Root]', 'NPC Root', 'Root', 'root'),
    target: 'root',
    position: true,
    positionSpace: 'world-root',
  }),
  Object.freeze({
    id: 'pelvis',
    sourceAliases: aliases('NPC Pelvis [Pelv]', 'NPC Pelvis', 'Pelvis', 'pelvis'),
    target: 'hips',
    position: true,
    positionSpace: 'root-relative',
  }),
  Object.freeze({
    id: 'spine',
    sourceAliases: aliases('NPC Spine [Spn0]', 'NPC Spine', 'Spine', 'spine'),
    target: 'spine',
  }),
  Object.freeze({
    id: 'chest',
    sourceAliases: aliases('NPC Spine2 [Spn2]', 'NPC Spine2', 'Spine2', 'spine2', 'Chest', 'chest'),
    target: 'chest',
  }),
  Object.freeze({
    id: 'head',
    sourceAliases: aliases('NPC Head [Head]', 'NPC Head', 'Head', 'head'),
    target: 'head',
  }),

  Object.freeze({
    id: 'upperarm.l',
    sourceAliases: aliases('NPC L UpperArm [LUar]', 'NPC L UpperArm', 'L UpperArm', 'UpperArm.L'),
    target: 'upperarm.l',
    directionEndId: 'lowerarm.l',
    directionTargetChild: 'lowerarm.l',
  }),
  Object.freeze({
    id: 'lowerarm.l',
    sourceAliases: aliases('NPC L Forearm [LLar]', 'NPC L Forearm', 'L Forearm', 'Forearm.L'),
    target: 'lowerarm.l',
    directionEndId: 'wrist.l',
    directionTargetChild: 'wrist.l',
  }),
  Object.freeze({
    id: 'wrist.l',
    sourceAliases: aliases('NPC L Hand [LHnd]', 'NPC L Hand', 'L Hand', 'Hand.L'),
    target: 'wrist.l',
  }),
  Object.freeze({
    id: 'hand.l',
    sourceAliases: aliases('NPC L Hand [LHnd]', 'NPC L Hand', 'L Hand', 'Hand.L'),
    target: 'hand.l',
  }),
  Object.freeze({
    id: 'handslot.l',
    sourceAliases: aliases('Shield', 'SHIELD'),
    target: 'handslot.l',
    helper: 'shield',
  }),

  Object.freeze({
    id: 'upperarm.r',
    sourceAliases: aliases('NPC R UpperArm [RUar]', 'NPC R UpperArm', 'R UpperArm', 'UpperArm.R'),
    target: 'upperarm.r',
    directionEndId: 'lowerarm.r',
    directionTargetChild: 'lowerarm.r',
  }),
  Object.freeze({
    id: 'lowerarm.r',
    sourceAliases: aliases('NPC R Forearm [RLar]', 'NPC R Forearm', 'R Forearm', 'Forearm.R'),
    target: 'lowerarm.r',
    directionEndId: 'wrist.r',
    directionTargetChild: 'wrist.r',
  }),
  Object.freeze({
    id: 'wrist.r',
    sourceAliases: aliases('NPC R Hand [RHnd]', 'NPC R Hand', 'R Hand', 'Hand.R'),
    target: 'wrist.r',
  }),
  Object.freeze({
    id: 'hand.r',
    sourceAliases: aliases('NPC R Hand [RHnd]', 'NPC R Hand', 'R Hand', 'Hand.R'),
    target: 'hand.r',
  }),
  Object.freeze({
    id: 'handslot.r',
    sourceAliases: aliases('Weapon', 'WEAPON'),
    target: 'handslot.r',
    helper: 'weapon',
  }),

  Object.freeze({
    id: 'upperleg.l',
    sourceAliases: aliases('NPC L Thigh [LThg]', 'NPC L Thigh', 'L Thigh', 'Thigh.L'),
    target: 'upperleg.l',
  }),
  Object.freeze({
    id: 'lowerleg.l',
    sourceAliases: aliases('NPC L Calf [LClf]', 'NPC L Calf', 'L Calf', 'Calf.L'),
    target: 'lowerleg.l',
  }),
  Object.freeze({
    id: 'foot.l',
    sourceAliases: aliases('NPC L Foot [Lft ]', 'NPC L Foot [Lft]', 'NPC L Foot', 'L Foot', 'Foot.L'),
    target: 'foot.l',
  }),
  Object.freeze({
    id: 'toes.l',
    sourceAliases: aliases('NPC L Toe0 [LToe]', 'NPC L Toe0', 'L Toe0', 'Toe.L'),
    target: 'toes.l',
  }),
  Object.freeze({
    id: 'upperleg.r',
    sourceAliases: aliases('NPC R Thigh [RThg]', 'NPC R Thigh', 'R Thigh', 'Thigh.R'),
    target: 'upperleg.r',
  }),
  Object.freeze({
    id: 'lowerleg.r',
    sourceAliases: aliases('NPC R Calf [RClf]', 'NPC R Calf', 'R Calf', 'Calf.R'),
    target: 'lowerleg.r',
  }),
  Object.freeze({
    id: 'foot.r',
    sourceAliases: aliases('NPC R Foot [Rft ]', 'NPC R Foot [Rft]', 'NPC R Foot', 'R Foot', 'Foot.R'),
    target: 'foot.r',
  }),
  Object.freeze({
    id: 'toes.r',
    sourceAliases: aliases('NPC R Toe0 [RToe]', 'NPC R Toe0', 'R Toe0', 'Toe.R'),
    target: 'toes.r',
  }),
]);

const SKYRIM_ARM_HELPERS = Object.freeze({
  'clavicle.l': aliases('NPC L Clavicle [LClv]', 'NPC L Clavicle'),
  'clavicle.r': aliases('NPC R Clavicle [RClv]', 'NPC R Clavicle'),
  'upperarmTwist.l': aliases('NPC L UpperarmTwist1 [LUt1]', 'NPC L UpperarmTwist1'),
  'upperarmTwist.r': aliases('NPC R UpperarmTwist1 [RUt1]', 'NPC R UpperarmTwist1'),
  'forearmTwist.l': aliases('NPC L ForearmTwist1 [LLt1]', 'NPC L ForearmTwist1'),
  'forearmTwist.r': aliases('NPC R ForearmTwist1 [RLt1]', 'NPC R ForearmTwist1'),
});

function normalizedNodeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function compactNodeName(value) {
  return normalizedNodeName(value).replace(/[^a-z0-9]/g, '');
}

function nodeNameKeys(value) {
  const normalized = normalizedNodeName(value);
  const compact = compactNodeName(value);
  return [...new Set([normalized, compact].filter(Boolean))];
}

function collectNamedNodes(root) {
  const nodes = new Map();
  root?.traverse?.((node) => {
    for (const key of nodeNameKeys(node?.name)) {
      if (!nodes.has(key)) nodes.set(key, node);
    }
  });
  return nodes;
}

function findNode(root, namedNodes, sourceAliases) {
  for (const alias of sourceAliases) {
    const exact = root?.getObjectByName?.(alias);
    if (exact) return exact;
    for (const key of nodeNameKeys(alias)) {
      const normalized = namedNodes.get(key);
      if (normalized) return normalized;
    }
  }
  return null;
}

export function resolveSkyrimSourceNodes(root, retargets = SKYRIM_BONE_RETARGETS) {
  if (!root) throw new Error('Skyrim retarget source is missing its hierarchy root');
  const namedNodes = collectNamedNodes(root);
  const nodes = {};
  const missing = [];
  for (const mapping of retargets) {
    const node = findNode(root, namedNodes, mapping.sourceAliases || []);
    if (node) nodes[mapping.id] = node;
    else missing.push(mapping.id);
  }
  return { nodes, missing, valid: missing.length === 0 };
}

function resolveArmHelperCoverage(root) {
  const namedNodes = collectNamedNodes(root);
  return Object.fromEntries(Object.entries(SKYRIM_ARM_HELPERS).map(([id, sourceAliases]) => [
    id,
    Boolean(findNode(root, namedNodes, sourceAliases)),
  ]));
}

export function validateSkyrimTargetRig(rig, retargets = SKYRIM_BONE_RETARGETS) {
  const targetBones = new Set(Object.keys(rig?.bones || {}));
  const missing = retargets.map(({ target }) => target).filter((target) => !targetBones.has(target));
  return { valid: missing.length === 0, missing };
}

function createTargetProxy(THREE, rig) {
  const root = new THREE.Object3D();
  const bones = {};
  for (const definition of rig.definition.bones) {
    const bone = new THREE.Object3D();
    const rest = rig.restTransforms[definition.id];
    bone.name = sanitizeAnimationTargetName(definition.id);
    bone.position.fromArray(rest.position);
    bone.quaternion.fromArray(rest.quaternion);
    bone.scale.fromArray(rest.scale);
    (definition.parent ? bones[definition.parent] : root).add(bone);
    bones[definition.id] = bone;
  }
  root.updateMatrixWorld(true);
  return { root, bones };
}

function restoreTargetProxy(proxy, rig) {
  for (const [boneId, rest] of Object.entries(rig.restTransforms)) {
    const bone = proxy.bones[boneId];
    bone.position.fromArray(rest.position);
    bone.quaternion.fromArray(rest.quaternion);
    bone.scale.fromArray(rest.scale);
  }
  proxy.root.updateMatrixWorld(true);
}

function worldSnapshot(THREE, object3d) {
  return {
    position: object3d.getWorldPosition(new THREE.Vector3()),
    quaternion: object3d.getWorldQuaternion(new THREE.Quaternion()),
  };
}

function sampleTimes(duration, fps) {
  const step = 1 / Math.max(1, Number(fps) || 30);
  const times = [];
  for (let time = 0; time < duration - step * 0.25; time += step) times.push(time);
  if (!times.length || Math.abs(times.at(-1) - duration) > 1e-5) times.push(duration);
  return times;
}

export function computeSkyrimTranslationScale(sourceHeight, targetHeight) {
  const source = Number(sourceHeight);
  const target = Number(targetHeight);
  if (!Number.isFinite(source) || !Number.isFinite(target) || source <= 1e-6 || target <= 1e-6) return 1;
  const scale = target / source;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function motionScale(sourceRest, targetRest) {
  const sourceHeight = sourceRest.head.position.distanceTo(sourceRest.root.position);
  const targetHeight = targetRest.head.position.distanceTo(targetRest.root.position);
  return computeSkyrimTranslationScale(sourceHeight, targetHeight);
}

function normalizedDirection(vector, label) {
  if (!vector || vector.lengthSq() <= 1e-10) throw new Error(`Skyrim retarget cannot resolve ${label} direction`);
  return vector.normalize();
}

function humanoidBasis(THREE, rest, semantics) {
  const pelvis = rest[semantics.pelvis]?.position;
  const head = rest[semantics.head]?.position;
  const left = rest[semantics.left]?.position;
  const right = rest[semantics.right]?.position;
  if (!pelvis || !head || !left || !right) throw new Error('Skyrim basis calibration requires pelvis, head, and both upper arms');

  const up = normalizedDirection(head.clone().sub(pelvis), 'up');
  const lateral = right.clone().sub(left);
  lateral.addScaledVector(up, -lateral.dot(up));
  normalizedDirection(lateral, 'right');
  const forward = normalizedDirection(new THREE.Vector3().crossVectors(lateral, up), 'forward');
  const orthogonalUp = normalizedDirection(new THREE.Vector3().crossVectors(forward, lateral), 'orthogonal up');
  const matrix = new THREE.Matrix4().makeBasis(lateral, orthogonalUp, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix).normalize();
  return { right: lateral, up: orthogonalUp, forward, quaternion };
}

function axisMetadata(axis) {
  return axis.toArray().map((value) => Number(value.toFixed(6)));
}

export function computeSkyrimBasisCalibration(THREE, sourceRest, targetRest) {
  if (!THREE?.Vector3 || !THREE?.Quaternion || !THREE?.Matrix4) {
    throw new Error('Skyrim basis calibration requires THREE Vector3/Quaternion/Matrix4');
  }
  const source = humanoidBasis(THREE, sourceRest, {
    pelvis: 'pelvis', head: 'head', left: 'upperarm.l', right: 'upperarm.r',
  });
  const target = humanoidBasis(THREE, targetRest, {
    pelvis: 'hips', head: 'head', left: 'upperarm.l', right: 'upperarm.r',
  });
  const quaternion = target.quaternion.clone().multiply(source.quaternion.clone().invert()).normalize();
  const radians = 2 * Math.acos(Math.min(1, Math.abs(quaternion.w)));
  const angleDegrees = THREE.MathUtils?.radToDeg ? THREE.MathUtils.radToDeg(radians) : (radians * 180) / Math.PI;
  return {
    quaternion,
    angleDegrees,
    source: {
      right: axisMetadata(source.right),
      up: axisMetadata(source.up),
      forward: axisMetadata(source.forward),
    },
    target: {
      right: axisMetadata(target.right),
      up: axisMetadata(target.up),
      forward: axisMetadata(target.forward),
    },
  };
}

export function measureVectorSampleExcursion(values = []) {
  const sampleCount = Math.floor(values.length / 3);
  if (!sampleCount) return { sampleCount: 0, maxExcursion: 0, maxStep: 0 };
  const sx = Number(values[0]) || 0;
  const sy = Number(values[1]) || 0;
  const sz = Number(values[2]) || 0;
  let px = sx;
  let py = sy;
  let pz = sz;
  let maxExcursion = 0;
  let maxStep = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const offset = index * 3;
    const x = Number(values[offset]) || 0;
    const y = Number(values[offset + 1]) || 0;
    const z = Number(values[offset + 2]) || 0;
    maxExcursion = Math.max(maxExcursion, Math.hypot(x - sx, y - sy, z - sz));
    if (index > 0) maxStep = Math.max(maxStep, Math.hypot(x - px, y - py, z - pz));
    px = x;
    py = y;
    pz = z;
  }
  return { sampleCount, maxExcursion, maxStep };
}

export function classifySkyrimTranslationSafety(metrics = {}, targetHeight = 1, options = {}) {
  const height = Math.max(1e-6, Number(targetHeight) || 1);
  const maxExcursionRatio = Math.max(0, Number(options.maxExcursionRatio ?? 3));
  const maxStepRatio = Math.max(0, Number(options.maxStepRatio ?? 1.5));
  const root = metrics.root || { maxExcursion: 0, maxStep: 0 };
  const hips = metrics.hips || { maxExcursion: 0, maxStep: 0 };
  const excursionRatio = Math.max(root.maxExcursion || 0, hips.maxExcursion || 0) / height;
  const stepRatio = Math.max(root.maxStep || 0, hips.maxStep || 0) / height;
  return {
    safe: excursionRatio <= maxExcursionRatio && stepRatio <= maxStepRatio,
    excursionRatio,
    stepRatio,
    maxExcursionRatio,
    maxStepRatio,
  };
}

function directionAngleDegrees(THREE, a, b) {
  if (!a || !b || a.lengthSq() <= 1e-10 || b.lengthSq() <= 1e-10) return 180;
  const radians = a.angleTo(b);
  return THREE.MathUtils?.radToDeg ? THREE.MathUtils.radToDeg(radians) : (radians * 180) / Math.PI;
}

function summarizeAngleSamples(values = []) {
  if (!values.length) return { sampleCount: 0, meanDegrees: 0, maxDegrees: 0 };
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: values.length,
    meanDegrees: total / values.length,
    maxDegrees: Math.max(...values),
  };
}

function decodedSource(input) {
  const root = input?.root || input?.scene || null;
  const clip = input?.clip || input?.animations?.[0] || null;
  return { root, clip };
}

export function retargetSkyrimClip(THREE, decoded, rig, options = {}) {
  if (!THREE?.AnimationMixer || !THREE?.AnimationClip) {
    throw new Error('Skyrim retargeting requires the Three.js animation runtime');
  }
  if (!rig?.definition || !rig?.restTransforms || !rig?.bones) {
    throw new Error('Skyrim retargeting requires the Action Studio procedural target rig');
  }

  const { root: sourceRoot, clip: sourceClip } = decodedSource(decoded);
  if (!sourceRoot || !sourceClip) {
    throw new Error('Decoded Skyrim animation must provide a hierarchy root and an animation clip');
  }

  const retargets = options.boneRetargets || SKYRIM_BONE_RETARGETS;
  const targetReport = validateSkyrimTargetRig(rig, retargets);
  if (!targetReport.valid) {
    throw new Error(`Action Studio rig is missing Skyrim retarget targets: ${targetReport.missing.join(', ')}`);
  }

  sourceRoot.updateMatrixWorld(true);
  const sourceReport = resolveSkyrimSourceNodes(sourceRoot, retargets);
  if (!sourceReport.valid) {
    throw new Error(`Decoded Skyrim hierarchy is missing required bones: ${sourceReport.missing.join(', ')}`);
  }

  const targetProxy = createTargetProxy(THREE, rig);
  const sourceRest = {};
  const targetRest = {};
  retargets.forEach(({ id, target }) => {
    sourceRest[id] = worldSnapshot(THREE, sourceReport.nodes[id]);
    targetRest[target] = worldSnapshot(THREE, targetProxy.bones[target]);
  });

  const measuredTranslationScale = motionScale(sourceRest, targetRest);
  const requestedTranslationScale = Number(options.translationScale);
  const translationScale = Number.isFinite(requestedTranslationScale) && requestedTranslationScale > 0
    ? requestedTranslationScale
    : measuredTranslationScale;
  const targetHeight = targetRest.head.position.distanceTo(targetRest.root.position);
  const measuredBasisCalibration = computeSkyrimBasisCalibration(THREE, sourceRest, targetRest);
  const basisEnabled = options.basisCalibration !== false;
  const requestedBasis = options.basisQuaternion;
  const basisQuaternion = requestedBasis?.isQuaternion
    ? requestedBasis.clone().normalize()
    : measuredBasisCalibration.quaternion.clone();
  if (!basisEnabled) basisQuaternion.identity();
  const basisQuaternionInverse = basisQuaternion.clone().invert();
  const targetRootRestQuaternionInverse = targetRest.root.quaternion.clone().invert();
  const directionConstraintsEnabled = options.armDirectionConstraints !== false;

  const fps = Math.max(1, Number(options.fps) || 30);
  const times = sampleTimes(sourceClip.duration, fps);
  const samples = new Map(retargets.map(({ target, position }) => [target, {
    quaternion: [],
    position: position ? [] : null,
  }]));
  const armDirectionSamples = {
    left: { upper: [], lower: [] },
    right: { upper: [], lower: [] },
  };

  const mixer = new THREE.AnimationMixer(sourceRoot);
  const action = mixer.clipAction(sourceClip).reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const sourceWorldQuaternion = new THREE.Quaternion();
  const sourceWorldPosition = new THREE.Vector3();
  const rotationDelta = new THREE.Quaternion();
  const desiredWorldQuaternion = new THREE.Quaternion();
  const parentWorldQuaternion = new THREE.Quaternion();
  const desiredWorldPosition = new THREE.Vector3();
  const sourceRootWorldPosition = new THREE.Vector3();
  const sourceRootWorldQuaternion = new THREE.Quaternion();
  const sourceRootWorldQuaternionInverse = new THREE.Quaternion();
  const sourceRootRestQuaternionInverse = sourceRest.root.quaternion.clone().invert();
  const sourceMotionDelta = new THREE.Vector3();
  const sourceRelativePosition = new THREE.Vector3();
  const sourceRelativeRest = sourceRest.pelvis.position.clone()
    .sub(sourceRest.root.position)
    .applyQuaternion(sourceRootRestQuaternionInverse);
  const sourceRelativeDelta = new THREE.Vector3();
  const sourceSegmentStart = new THREE.Vector3();
  const sourceSegmentEnd = new THREE.Vector3();
  const desiredSegmentDirection = new THREE.Vector3();
  const predictedTargetDirection = new THREE.Vector3();
  const directionCorrection = new THREE.Quaternion();
  const targetSegmentStart = new THREE.Vector3();
  const targetSegmentEnd = new THREE.Vector3();

  function sourceDirection(startId, endId, out) {
    sourceReport.nodes[startId].getWorldPosition(sourceSegmentStart);
    sourceReport.nodes[endId].getWorldPosition(sourceSegmentEnd);
    return out.copy(sourceSegmentEnd)
      .sub(sourceSegmentStart)
      .applyQuaternion(basisQuaternion)
      .normalize();
  }

  function recordArmDirection(side, segment, sourceStartId, sourceEndId, targetStartId, targetEndId) {
    sourceDirection(sourceStartId, sourceEndId, desiredSegmentDirection);
    targetProxy.bones[targetStartId].getWorldPosition(targetSegmentStart);
    targetProxy.bones[targetEndId].getWorldPosition(targetSegmentEnd);
    predictedTargetDirection.copy(targetSegmentEnd).sub(targetSegmentStart).normalize();
    armDirectionSamples[side][segment].push(directionAngleDegrees(
      THREE,
      desiredSegmentDirection,
      predictedTargetDirection,
    ));
  }

  times.forEach((time) => {
    mixer.setTime(time);
    sourceRoot.updateMatrixWorld(true);
    restoreTargetProxy(targetProxy, rig);

    const sourceMotionRoot = sourceReport.nodes.root;
    sourceMotionRoot.getWorldPosition(sourceRootWorldPosition);
    sourceMotionRoot.getWorldQuaternion(sourceRootWorldQuaternion);
    sourceRootWorldQuaternionInverse.copy(sourceRootWorldQuaternion).invert();

    retargets.forEach(({
      id,
      target,
      position,
      positionSpace,
      directionEndId,
      directionTargetChild,
    }) => {
      const sourceBone = sourceReport.nodes[id];
      const targetBone = targetProxy.bones[target];
      sourceBone.getWorldQuaternion(sourceWorldQuaternion);
      rotationDelta.copy(sourceWorldQuaternion).multiply(sourceRest[id].quaternion.clone().invert());
      rotationDelta.premultiply(basisQuaternion).multiply(basisQuaternionInverse).normalize();
      desiredWorldQuaternion.copy(rotationDelta).multiply(targetRest[target].quaternion);

      if (directionConstraintsEnabled && directionEndId && directionTargetChild) {
        sourceDirection(id, directionEndId, desiredSegmentDirection);
        predictedTargetDirection
          .fromArray(rig.restTransforms[directionTargetChild].position)
          .normalize()
          .applyQuaternion(desiredWorldQuaternion)
          .normalize();
        directionCorrection.setFromUnitVectors(predictedTargetDirection, desiredSegmentDirection);
        desiredWorldQuaternion.premultiply(directionCorrection).normalize();
      }

      targetBone.parent.getWorldQuaternion(parentWorldQuaternion);
      targetBone.quaternion.copy(parentWorldQuaternion.invert().multiply(desiredWorldQuaternion)).normalize();

      if (position && positionSpace === 'root-relative') {
        sourceBone.getWorldPosition(sourceWorldPosition);
        sourceRelativePosition.copy(sourceWorldPosition)
          .sub(sourceRootWorldPosition)
          .applyQuaternion(sourceRootWorldQuaternionInverse);
        sourceRelativeDelta.copy(sourceRelativePosition)
          .sub(sourceRelativeRest)
          .applyQuaternion(sourceRest.root.quaternion)
          .applyQuaternion(basisQuaternion)
          .applyQuaternion(targetRootRestQuaternionInverse)
          .multiplyScalar(translationScale);
        targetBone.position.fromArray(rig.restTransforms[target].position).add(sourceRelativeDelta);
      } else if (position) {
        sourceBone.getWorldPosition(sourceWorldPosition);
        sourceMotionDelta.copy(sourceWorldPosition)
          .sub(sourceRest[id].position)
          .applyQuaternion(basisQuaternion)
          .multiplyScalar(translationScale);
        desiredWorldPosition.copy(targetRest[target].position).add(sourceMotionDelta);
        targetBone.position.copy(targetBone.parent.worldToLocal(desiredWorldPosition));
      }

      targetBone.updateMatrixWorld(true);
      samples.get(target).quaternion.push(...targetBone.quaternion.toArray());
      if (position) samples.get(target).position.push(...targetBone.position.toArray());
    });

    targetProxy.root.updateMatrixWorld(true);
    recordArmDirection('left', 'upper', 'upperarm.l', 'lowerarm.l', 'upperarm.l', 'lowerarm.l');
    recordArmDirection('left', 'lower', 'lowerarm.l', 'wrist.l', 'lowerarm.l', 'wrist.l');
    recordArmDirection('right', 'upper', 'upperarm.r', 'lowerarm.r', 'upperarm.r', 'lowerarm.r');
    recordArmDirection('right', 'lower', 'lowerarm.r', 'wrist.r', 'lowerarm.r', 'wrist.r');
  });
  action.stop();

  const clipId = String(options.clipId || sourceClip.name || 'SKYRIM_GUARD/Action');
  const tracks = [];
  retargets.forEach(({ target, position }) => {
    const targetName = sanitizeAnimationTargetName(target);
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${targetName}.quaternion`, times, samples.get(target).quaternion,
    ));
    if (position) {
      tracks.push(new THREE.VectorKeyframeTrack(
        `${targetName}.position`, times, samples.get(target).position,
      ));
    }
  });

  const translationMetrics = {
    root: measureVectorSampleExcursion(samples.get('root')?.position || []),
    hips: measureVectorSampleExcursion(samples.get('hips')?.position || []),
  };
  const translationSafety = classifySkyrimTranslationSafety(
    translationMetrics,
    targetHeight,
    options.translationSafety,
  );

  const leftUpper = summarizeAngleSamples(armDirectionSamples.left.upper);
  const leftLower = summarizeAngleSamples(armDirectionSamples.left.lower);
  const rightUpper = summarizeAngleSamples(armDirectionSamples.right.upper);
  const rightLower = summarizeAngleSamples(armDirectionSamples.right.lower);
  const maxDirectionErrorDegrees = Math.max(
    leftUpper.maxDegrees,
    leftLower.maxDegrees,
    rightUpper.maxDegrees,
    rightLower.maxDegrees,
  );
  const armHelperCoverage = resolveArmHelperCoverage(sourceRoot);
  const armChainMetrics = {
    directionConstraintsEnabled,
    left: { upper: leftUpper, lower: leftLower },
    right: { upper: rightUpper, lower: rightLower },
    maxDirectionErrorDegrees,
    weaponHelperMapped: retargets.some(({ id, target }) => id === 'handslot.r' && target === 'handslot.r'),
    shieldHelperMapped: retargets.some(({ id, target }) => id === 'handslot.l' && target === 'handslot.l'),
    targetHandTracks: ['hand.l', 'handslot.l', 'hand.r', 'handslot.r'].filter((target) => samples.has(target)),
    helperCoverage: armHelperCoverage,
    claviclePolicy: 'folded-through-source-world-joint-directions',
    twistPolicy: 'deformation-only-sibling-helpers-not-double-applied-to-rigid-block-limbs',
  };

  const clip = new THREE.AnimationClip(clipId, sourceClip.duration, tracks);
  clip.userData = {
    source: 'skyrim',
    sourceClip: sourceClip.name,
    retargetFps: fps,
    translationScale,
    measuredTranslationScale,
    targetHeight,
    translationMetrics,
    translationSafety,
    basisCalibration: {
      enabled: basisEnabled,
      angleDegrees: measuredBasisCalibration.angleDegrees,
      quaternion: basisQuaternion.toArray().map((value) => Number(value.toFixed(8))),
      source: measuredBasisCalibration.source,
      target: measuredBasisCalibration.target,
    },
    armChainMetrics,
    positionSpaces: Object.fromEntries(retargets.filter((entry) => entry.position).map((entry) => [entry.target, entry.positionSpace || 'world-root'])),
    targetRigId: rig.definition.id,
  };
  return clip;
}

export function createSkyrimRetargetLibrary(THREE, decodedEntries, rig, options = {}) {
  const entries = Array.from(decodedEntries || []);
  if (!entries.length) throw new Error('Skyrim retarget library requires at least one decoded animation');
  const clips = new Map();
  for (const entry of entries) {
    const clip = retargetSkyrimClip(THREE, entry.decoded || entry, rig, {
      ...options,
      clipId: entry.clipId || options.clipId,
    });
    if (clips.has(clip.name)) throw new Error(`Duplicate Skyrim retarget clip id: ${clip.name}`);
    clips.set(clip.name, clip);
  }
  return {
    clips,
    source: 'skyrim',
    retargetFps: Math.max(1, Number(options.fps) || 30),
    duplicates: [],
  };
}
