import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';

const THREE = window.THREE;
const STAGE = 'G2.5.2';
const CLIP_ID = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
const FPS = 30;
const SAMPLE_COUNT = 1201;

function vectorArray(vector) {
  return vector?.toArray?.().map((value) => Number(value.toFixed(8))) || [0, 0, 0];
}

function distanceFrom(values, origin) {
  return Math.hypot(
    values[0] - origin[0],
    values[1] - origin[1],
    values[2] - origin[2],
  );
}

function capture(character) {
  const rig = character.rig;
  rig.root.updateMatrixWorld(true);
  return {
    object: vectorArray(character.object3d.position),
    motionRoot: vectorArray(rig.motionRoot.position),
    root: vectorArray(rig.bones.root.position),
    hips: vectorArray(rig.bones.hips.position),
  };
}

function createReportNode() {
  let node = document.getElementById('g252RuntimeReport');
  if (!node) {
    node = document.createElement('pre');
    node.id = 'g252RuntimeReport';
    node.style.cssText = 'white-space:pre-wrap;position:fixed;left:8px;bottom:8px;z-index:99999;max-width:48vw;max-height:42vh;overflow:auto;padding:10px;background:#07111ddd;color:#9fffd2;font:11px/1.4 monospace;';
    document.body.appendChild(node);
  }
  return node;
}

export async function runActionStudioSkyrimRuntimeParityProbe() {
  if (!THREE?.GLTFLoader) throw new Error(`${STAGE} requires THREE.GLTFLoader`);
  const character = window.__ACTION_STUDIO_G252_CHARACTER;
  if (!character?.rig?.bones || !character?.animation) {
    throw new Error(`${STAGE} did not receive the real Action Studio character instance`);
  }

  const loader = new THREE.GLTFLoader();
  const library = await loadSkyrimConvertedAnimationLibrary(loader, {
    THREE,
    rig: character.rig,
    baseUrl: '../../assets/skyrim/guard/converted/',
    fps: FPS,
  });
  const clip = library.clips.get(CLIP_ID);
  if (!clip) throw new Error(`${STAGE} missing canonical clip ${CLIP_ID}`);

  character.registerAnimations(library);
  const prepared = character.animation.getPreparedClipDiagnostics(CLIP_ID, true);
  character.stopAnimation();
  character.playAnimation(CLIP_ID, {
    loop: false,
    inPlace: true,
    speed: 1,
    fadeSeconds: 0,
  });
  character.animation.update(0);

  const origin = capture(character);
  const maxima = { object: 0, motionRoot: 0, root: 0, hips: 0 };
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    character.animation.update(1 / FPS);
    const sample = capture(character);
    for (const key of Object.keys(maxima)) {
      maxima[key] = Math.max(maxima[key], distanceFrom(sample[key], origin[key]));
    }
  }

  const targetHeight = Math.max(0.000001, Number(clip.userData?.targetHeight) || 1);
  const translationScale = Number(clip.userData?.translationScale);
  const safety = clip.userData?.translationSafety || {};
  const ratios = Object.fromEntries(Object.entries(maxima).map(([key, value]) => [key, value / targetHeight]));
  const gates = {
    realActionStudioCharacter: true,
    inPlaceRootTrackRemoved: prepared.sourceRootPositionTracks >= 1 && prepared.preparedRootPositionTracks === 0,
    correctedTranslationScale: Number.isFinite(translationScale) && translationScale > 0 && translationScale < 0.1,
    retargetTranslationSafety: safety.safe === true,
    objectStable: ratios.object <= 0.02,
    motionRootStable: ratios.motionRoot <= 0.02,
    rootStable: ratios.root <= 0.05,
    hipsStable: ratios.hips <= 0.08,
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  const report = {
    stage: STAGE,
    pass: failures.length === 0,
    clipId: CLIP_ID,
    runtimeEntryMode: window.__ACTION_STUDIO_ENTRY_MODE || 'unknown',
    fps: FPS,
    sampleCount: SAMPLE_COUNT,
    duration: clip.duration,
    targetHeight,
    translationScale,
    measuredTranslationScale: clip.userData?.measuredTranslationScale,
    translationSafety: safety,
    prepared,
    origin,
    maxima,
    ratios,
    gates,
    failures,
  };

  character.stopAnimation();
  document.body.dataset.g252 = report.pass ? 'pass' : 'fail';
  document.body.dataset.g252Entry = report.runtimeEntryMode;
  document.body.dataset.g252Scale = Number.isFinite(translationScale) ? translationScale.toFixed(8) : 'invalid';
  document.body.dataset.g252RootStripped = String(gates.inPlaceRootTrackRemoved);
  createReportNode().textContent = JSON.stringify(report, null, 2);
  window.__ACTION_STUDIO_G252_REPORT = report;
  return report;
}

async function autoRun() {
  try {
    const report = await runActionStudioSkyrimRuntimeParityProbe();
    const status = document.getElementById('kaykitStatus');
    if (status) {
      status.textContent = `${STAGE} ${report.pass ? 'PASS' : 'FAIL'} · Skyrim scale ${report.translationScale.toFixed(6)} · in-place root ${report.prepared.preparedRootPositionTracks === 0 ? 'stripped' : 'PRESENT'} · hips excursion ${(report.ratios.hips * 100).toFixed(2)}% height`;
      status.classList.toggle('error', !report.pass);
    }
  } catch (error) {
    document.body.dataset.g252 = 'fail';
    createReportNode().textContent = JSON.stringify({ stage: STAGE, pass: false, error: error?.message || String(error) }, null, 2);
  }
}

autoRun();
