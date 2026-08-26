import { sanitizeAnimationTargetName } from './animation-target-name.js';

export const QUATERNIUS_BONE_RETARGETS = Object.freeze([
  Object.freeze({ source: 'root', target: 'root', position: true }),
  Object.freeze({ source: 'pelvis', target: 'hips', position: true }),
  Object.freeze({ source: 'spine_01', target: 'spine' }),
  Object.freeze({ source: 'spine_03', target: 'chest' }),
  Object.freeze({ source: 'Head', target: 'head' }),
  Object.freeze({ source: 'upperarm_l', target: 'upperarm.l' }),
  Object.freeze({ source: 'lowerarm_l', target: 'lowerarm.l' }),
  Object.freeze({ source: 'hand_l', target: 'wrist.l' }),
  Object.freeze({ source: 'upperarm_r', target: 'upperarm.r' }),
  Object.freeze({ source: 'lowerarm_r', target: 'lowerarm.r' }),
  Object.freeze({ source: 'hand_r', target: 'wrist.r' }),
  Object.freeze({ source: 'thigh_l', target: 'upperleg.l' }),
  Object.freeze({ source: 'calf_l', target: 'lowerleg.l' }),
  Object.freeze({ source: 'foot_l', target: 'foot.l' }),
  Object.freeze({ source: 'ball_l', target: 'toes.l' }),
  Object.freeze({ source: 'thigh_r', target: 'upperleg.r' }),
  Object.freeze({ source: 'calf_r', target: 'lowerleg.r' }),
  Object.freeze({ source: 'foot_r', target: 'foot.r' }),
  Object.freeze({ source: 'ball_r', target: 'toes.r' }),
]);

function loadGlb(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function disposeScene(scene) {
  scene?.traverse?.((object3d) => {
    if (!object3d.isMesh) return;
    object3d.geometry?.dispose?.();
    const materials = Array.isArray(object3d.material) ? object3d.material : [object3d.material];
    materials.forEach((material) => material?.dispose?.());
  });
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

function motionScale(sourceRest, targetRest) {
  const sourceHeight = sourceRest.Head.position.distanceTo(sourceRest.root.position);
  const targetHeight = targetRest.head.position.distanceTo(targetRest.root.position);
  if (sourceHeight < 0.001 || targetHeight < 0.001) return 1;
  return Math.max(0.5, Math.min(1.5, targetHeight / sourceHeight));
}

function sampleTimes(duration, fps) {
  const step = 1 / Math.max(1, Number(fps) || 30);
  const times = [];
  for (let time = 0; time < duration - step * 0.25; time += step) times.push(time);
  if (!times.length || Math.abs(times.at(-1) - duration) > 1e-5) times.push(duration);
  return times;
}

export function retargetQuaterniusClip(THREE, gltf, rig, options = {}) {
  if (!THREE?.AnimationMixer || !THREE?.AnimationClip) {
    throw new Error('Quaternius retargeting requires the Three.js animation runtime');
  }
  const sourceScene = gltf?.scene;
  const sourceClip = gltf?.animations?.[0];
  if (!sourceScene || !sourceClip) throw new Error('Quaternius GLB is missing its source hierarchy or animation');
  const retargets = options.boneRetargets || QUATERNIUS_BONE_RETARGETS;

  sourceScene.updateMatrixWorld(true);
  const sourceNodes = {};
  retargets.forEach(({ source }) => { sourceNodes[source] = sourceScene.getObjectByName(source); });
  const missing = retargets.filter(({ source }) => !sourceNodes[source]).map(({ source }) => source);
  if (missing.length) throw new Error(`${sourceClip.name} is missing Quaternius bones: ${missing.join(', ')}`);

  const targetProxy = createTargetProxy(THREE, rig);
  const sourceRest = {};
  const targetRest = {};
  retargets.forEach(({ source, target }) => {
    sourceRest[source] = worldSnapshot(THREE, sourceNodes[source]);
    targetRest[target] = worldSnapshot(THREE, targetProxy.bones[target]);
  });
  const translationScale = motionScale(sourceRest, targetRest);
  const times = sampleTimes(sourceClip.duration, options.fps || 30);
  const samples = new Map(retargets.map(({ target, position }) => [target, {
    quaternion: [],
    position: position ? [] : null,
  }]));
  const mixer = new THREE.AnimationMixer(sourceScene);
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

  times.forEach((time) => {
    mixer.setTime(time);
    sourceScene.updateMatrixWorld(true);
    restoreTargetProxy(targetProxy, rig);
    retargets.forEach(({ source, target, position }) => {
      const sourceBone = sourceNodes[source];
      const targetBone = targetProxy.bones[target];
      sourceBone.getWorldQuaternion(sourceWorldQuaternion);
      rotationDelta.copy(sourceWorldQuaternion).multiply(sourceRest[source].quaternion.clone().invert());
      desiredWorldQuaternion.copy(rotationDelta).multiply(targetRest[target].quaternion);
      targetBone.parent.getWorldQuaternion(parentWorldQuaternion);
      targetBone.quaternion.copy(parentWorldQuaternion.invert().multiply(desiredWorldQuaternion)).normalize();
      if (position) {
        sourceBone.getWorldPosition(sourceWorldPosition);
        desiredWorldPosition.copy(sourceWorldPosition)
          .sub(sourceRest[source].position)
          .multiplyScalar(translationScale)
          .add(targetRest[target].position);
        targetBone.position.copy(targetBone.parent.worldToLocal(desiredWorldPosition));
      }
      targetBone.updateMatrixWorld(true);
      samples.get(target).quaternion.push(...targetBone.quaternion.toArray());
      if (position) samples.get(target).position.push(...targetBone.position.toArray());
    });
  });
  action.stop();

  const source = String(options.source || 'quaternius').toLowerCase();
  const clipPrefix = String(options.clipPrefix || source.toUpperCase());
  const clipName = `${clipPrefix}/${sourceClip.name || options.id || 'Action'}`;
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
  const clip = new THREE.AnimationClip(clipName, sourceClip.duration, tracks);
  clip.userData = {
    source,
    sourceClip: sourceClip.name,
    retargetFps: options.fps || 30,
    translationScale,
  };
  return clip;
}

export const loadQuaterniusAnimationLibrary = async (loader, options = {}) => {
  if (!loader?.load) throw new Error('loadQuaterniusAnimationLibrary requires a GLTFLoader instance');
  const THREE = options.THREE;
  const rig = options.rig;
  const files = options.files || [];
  if (!THREE || !rig?.definition || !rig?.restTransforms) {
    throw new Error('loadQuaterniusAnimationLibrary requires THREE and the target procedural rig');
  }
  if (!files.length) throw new Error('loadQuaterniusAnimationLibrary requires one or more animation files');
  const baseUrl = String(options.baseUrl || '').replace(/\/?$/, '/');
  const loaded = await Promise.all(files.map(async (entry) => {
    const gltf = await loadGlb(loader, `${baseUrl}${entry.file}`);
    try {
      return retargetQuaterniusClip(THREE, gltf, rig, {
        id: entry.id,
        fps: options.fps || 30,
        source: options.source,
        clipPrefix: options.clipPrefix,
      });
    } finally {
      disposeScene(gltf.scene);
    }
  }));
  return {
    clips: new Map(loaded.map((clip) => [clip.name, clip])),
    files,
    duplicates: [],
    source: String(options.source || 'quaternius').toLowerCase(),
    retargetFps: options.fps || 30,
  };
};
