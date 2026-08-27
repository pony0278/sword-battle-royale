import { attachEquipment } from './character-sockets.js';
import {
  createProceduralKayKitRig,
  restoreProceduralKayKitRestPose,
} from './procedural-kaykit-rig.js';
import { applyPoseToProceduralKayKitRig } from '../animation/kaykit-pose-adapter.js';
import {
  ROOT_ROTATION_POLICIES,
  createKayKitAnimationController,
  normalizeRootRotationPolicy,
  validateKayKitClipBindings,
} from '../animation/kaykit-animation-library.js';

export function createAnimationPlaybackSignature(name, playOptions = {}) {
  const inPlace = playOptions.inPlace !== false;
  const rootRotationPolicy = inPlace
    ? normalizeRootRotationPolicy(playOptions.rootRotationPolicy)
    : ROOT_ROTATION_POLICIES.PRESERVE;
  return `${String(name || '')}|${inPlace ? 'in-place' : 'root-motion'}|root-rotation-${rootRotationPolicy}`;
}

export function createProceduralKayKitCharacter(THREE, options = {}) {
  const rig = createProceduralKayKitRig(THREE, options);
  const animation = createKayKitAnimationController(THREE, rig.root);
  let mode = 'pose';
  let externalAnimationClock = false;
  let playbackSignature = null;

  function resetForAnimation() {
    restoreProceduralKayKitRestPose(rig);
    rig.motionRoot.position.set(0, 0, 0);
    rig.motionRoot.rotation.set(0, 0, 0);
    rig.motionRoot.scale.set(1, 1, 1);
    rig.root.updateMatrixWorld(true);
    rig.updateAppearance();
  }

  function prepareAnimation(name, playOptions = {}) {
    const nextSignature = createAnimationPlaybackSignature(name, playOptions);
    if (mode !== 'kaykit' || playbackSignature !== nextSignature) {
      animation.stop();
      resetForAnimation();
    }
    playbackSignature = nextSignature;
  }

  const character = {
    object3d: rig.root,
    rig,
    sockets: rig.sockets,
    animation,
    get mode() { return mode; },
    get playbackSignature() { return playbackSignature; },
    applyPose(pose) {
      if (mode !== 'pose') animation.stop();
      mode = 'pose';
      externalAnimationClock = false;
      playbackSignature = null;
      const result = applyPoseToProceduralKayKitRig(rig, pose);
      rig.updateAppearance();
      return result;
    },
    setRigNodesVisible(value) { rig.lineAppearance?.setNodesVisible(value); },
    setRigGlowVisible(value) { rig.lineAppearance?.setGlowVisible(value); },
    attach(socketId, object3d, calibration) {
      return attachEquipment(rig.sockets, socketId, object3d, calibration);
    },
    registerAnimations(source, registerOptions = {}) {
      const clips = source?.clips || source;
      const report = validateKayKitClipBindings(clips, Object.keys(rig.bones));
      if (registerOptions.strict !== false && !report.valid) {
        const summary = [...report.missing.entries()]
          .map(([clipName, targets]) => `${clipName}: ${targets.join(', ')}`)
          .join('; ');
        throw new Error(`KayKit animation targets do not match procedural rig: ${summary}`);
      }
      animation.register(clips);
      return report;
    },
    playAnimation(name, playOptions = {}) {
      prepareAnimation(name, playOptions);
      mode = 'kaykit';
      externalAnimationClock = false;
      return animation.play(name, playOptions);
    },
    hasAnimation(name) {
      return animation.has(name);
    },
    getAnimationDuration(name) {
      return animation.getClipDuration(name);
    },
    sampleAnimation(name, timeSeconds, sampleOptions = {}) {
      prepareAnimation(name, sampleOptions);
      mode = 'kaykit';
      externalAnimationClock = true;
      return animation.sample(name, timeSeconds, sampleOptions);
    },
    stopAnimation() {
      animation.stop();
      resetForAnimation();
      mode = 'pose';
      externalAnimationClock = false;
      playbackSignature = null;
    },
    update(deltaSeconds, camera) {
      if (mode === 'kaykit' && !externalAnimationClock) animation.update(deltaSeconds);
      rig.updateAppearance(camera);
    },
  };

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location?.search || '');
      if (params.get('g252') === '1') window.__ACTION_STUDIO_G252_CHARACTER = character;
    } catch (_error) {
      // Debug-only exposure must never affect the runtime character.
    }
  }

  return character;
}
