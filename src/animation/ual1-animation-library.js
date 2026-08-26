import {
  QUATERNIUS_BONE_RETARGETS,
  loadQuaterniusAnimationLibrary,
  retargetQuaterniusClip,
} from './quaternius-animation-retarget.js';

export const UAL1_ANIMATION_FILES = Object.freeze([
  Object.freeze({ id: 'Sword_Attack', file: 'Sword_Attack.glb' }),
  Object.freeze({ id: 'Sword_Idle', file: 'Sword_Idle.glb' }),
]);

export const UAL1_BONE_RETARGETS = QUATERNIUS_BONE_RETARGETS;

const DEFAULT_BASE_URL = '../../assets/UAL1_Animation_Split_Package/Animation_Only/No_Root_Motion/';

export function retargetUal1Clip(THREE, gltf, rig, options = {}) {
  return retargetQuaterniusClip(THREE, gltf, rig, {
    ...options,
    source: 'ual1',
    clipPrefix: 'UAL1',
  });
}

export const loadUal1AnimationLibrary = (loader, options = {}) => loadQuaterniusAnimationLibrary(loader, {
  ...options,
  files: UAL1_ANIMATION_FILES,
  baseUrl: options.baseUrl || DEFAULT_BASE_URL,
  source: 'ual1',
  clipPrefix: 'UAL1',
});
