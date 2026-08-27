import { retargetSkyrimClip } from './skyrim-animation-retarget.js';
import { computeSkyrimWeaponBindCalibration } from './skyrim-weapon-bind-calibration.js';
import {
  canCreateProductionParryDeflectClips,
  createProductionParryDeflectClips,
} from './parry-contact-deflect-runtime-clip.js';
import { stabilizeProductionParryDeflectClips } from './parry-rotation-continuity.js';
import { stabilizeProductionParryUpperBodyClips } from './parry-upper-body-continuity.js';

export const SKYRIM_GUARD_HOLD_CONVERTED_FILE = Object.freeze({
  id: 'shd_blockidle',
  file: 'shd_blockidle.source.glb',
  clipId: 'SKYRIM_GUARD/shd_blockidle',
  role: 'Guard Hold',
});

export const SKYRIM_GUARD_REACTION_CONVERTED_FILES = Object.freeze([
  Object.freeze({
    id: 'shd_blockhit',
    file: 'shd_blockhit.source.glb',
    clipId: 'SKYRIM_GUARD/shd_blockhit',
    role: 'Block Hit',
    visualDecision: 'ADOPT WITH CORRECTIONS',
  }),
  Object.freeze({
    id: 'shd_blockbash',
    file: 'shd_blockbash.source.glb',
    clipId: 'SKYRIM_GUARD/shd_blockbash',
    role: 'Parry Deflect',
    visualDecision: 'ADOPT',
  }),
  Object.freeze({
    id: 'shd_blockbashpower',
    file: 'shd_blockbashpower.source.glb',
    clipId: 'SKYRIM_GUARD/shd_blockbashpower',
    role: 'Perfect Parry',
    visualDecision: 'ADOPT WITH CORRECTIONS',
  }),
]);

export const SKYRIM_GUARD_CONVERTED_FILES = Object.freeze([
  SKYRIM_GUARD_HOLD_CONVERTED_FILE,
  ...SKYRIM_GUARD_REACTION_CONVERTED_FILES,
]);

const DEFAULT_BASE_URL = '../../assets/skyrim/guard/converted/';

function normalizedBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/?$/, '/');
}

function loadGlb(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function parseGlb(loader, arrayBuffer) {
  return new Promise((resolve, reject) => loader.parse(arrayBuffer, '', resolve, reject));
}

function disposeSourceScene(scene) {
  scene?.traverse?.((object3d) => {
    if (!object3d?.isMesh) return;
    object3d.geometry?.dispose?.();
    const materials = Array.isArray(object3d.material) ? object3d.material : [object3d.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function validateBridgeInput(THREE, rig, entry) {
  if (!THREE) throw new Error('Skyrim converted-source bridge requires THREE');
  if (!rig?.definition || !rig?.restTransforms || !rig?.bones) {
    throw new Error('Skyrim converted-source bridge requires the Action Studio procedural target rig');
  }
  if (!entry?.clipId) throw new Error('Skyrim converted-source bridge requires a canonical clipId');
}

function canComputeWeaponBindMetadata(THREE, retargetedClip) {
  return Boolean(
    THREE?.Quaternion
    && THREE?.Object3D
    && THREE?.Euler
    && Array.isArray(retargetedClip?.userData?.basisCalibration?.quaternion)
  );
}

export function retargetConvertedSkyrimGltf(THREE, gltf, rig, entry = SKYRIM_GUARD_CONVERTED_FILES[0], options = {}) {
  validateBridgeInput(THREE, rig, entry);
  const retarget = options.retargetClip || retargetSkyrimClip;
  const scene = gltf?.scene || gltf?.root || null;
  const clip = gltf?.animations?.[0] || gltf?.clip || null;
  if (!scene || !clip) {
    throw new Error('Converted Skyrim GLB must contain a named source hierarchy and at least one animation');
  }
  const retargetedClip = retarget(THREE, { scene, animations: [clip] }, rig, {
    fps: options.fps || 30,
    clipId: entry.clipId,
    boneRetargets: options.boneRetargets,
  });
  if (canComputeWeaponBindMetadata(THREE, retargetedClip)) {
    retargetedClip.userData.weaponBindCalibration = computeSkyrimWeaponBindCalibration(
      THREE,
      scene,
      rig,
      retargetedClip,
    );
  }
  retargetedClip.userData.convertedSource = Object.freeze({
    id: entry.id,
    file: entry.file,
    role: entry.role,
    visualDecision: entry.visualDecision || 'ADOPT',
  });
  return retargetedClip;
}

export function createSkyrimConvertedAnimationLibrary(clip, options = {}) {
  if (!clip?.name) throw new Error('Skyrim converted animation library requires a named retargeted clip');
  return {
    clips: new Map([[clip.name, clip]]),
    files: options.files || SKYRIM_GUARD_CONVERTED_FILES,
    source: 'skyrim',
    retargetFps: Math.max(1, Number(options.fps) || 30),
    duplicates: [],
    bridge: 'converted-glb',
    virtualClips: [],
  };
}

export const loadSkyrimConvertedAnimationLibrary = async (loader, options = {}) => {
  if (!loader?.load) throw new Error('loadSkyrimConvertedAnimationLibrary requires a GLTFLoader instance');
  const THREE = options.THREE;
  const rig = options.rig;
  const files = options.files || SKYRIM_GUARD_CONVERTED_FILES;
  if (!files.length) throw new Error('Skyrim converted animation library requires at least one source file');
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const clips = [];

  for (const entry of files) {
    let gltf;
    try {
      gltf = await loadGlb(loader, `${baseUrl}${entry.file}`);
    } catch (error) {
      const detail = error?.message ? `: ${error.message}` : '';
      throw new Error(`Converted Skyrim source not found: ${entry.file}${detail}`);
    }
    try {
      clips.push(retargetConvertedSkyrimGltf(THREE, gltf, rig, entry, options));
    } finally {
      disposeSourceScene(gltf?.scene);
    }
  }

  const sourceClipMap = new Map(clips.map((clip) => [clip.name, clip]));
  const virtualClips = canCreateProductionParryDeflectClips(THREE, sourceClipMap)
    ? stabilizeProductionParryUpperBodyClips(
      THREE,
      stabilizeProductionParryDeflectClips(
        createProductionParryDeflectClips(THREE, sourceClipMap, {
          fps: Math.max(60, Number(options.productionParryFps) || 60),
        }),
        sourceClipMap,
      ),
      sourceClipMap,
    )
    : [];
  clips.push(...virtualClips);

  return {
    clips: new Map(clips.map((clip) => [clip.name, clip])),
    files,
    source: 'skyrim',
    retargetFps: Math.max(1, Number(options.fps) || 30),
    duplicates: [],
    bridge: 'converted-glb',
    virtualClips: virtualClips.map((clip) => clip.name),
  };
};

export const importSkyrimConvertedAnimationFile = async (loader, file, options = {}) => {
  if (!loader?.parse) throw new Error('importSkyrimConvertedAnimationFile requires a GLTFLoader instance');
  if (!file?.arrayBuffer) throw new Error('Select a converted Skyrim .glb file first');
  const filename = String(file.name || '').toLowerCase();
  if (filename && !filename.endsWith('.glb')) {
    throw new Error('Local Skyrim bridge currently accepts self-contained .glb files only');
  }

  const entry = options.entry || SKYRIM_GUARD_CONVERTED_FILES[0];
  const bytes = await file.arrayBuffer();
  const gltf = await parseGlb(loader, bytes);
  try {
    const clip = retargetConvertedSkyrimGltf(options.THREE, gltf, options.rig, entry, options);
    return createSkyrimConvertedAnimationLibrary(clip, {
      files: [Object.freeze({ ...entry, localFile: file.name || entry.file })],
      fps: options.fps || 30,
    });
  } finally {
    disposeSourceScene(gltf?.scene);
  }
};