import { createDefaultCharacter } from '../../src/character/default-character.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';

const THREE = window.THREE;
const report = document.getElementById('report');

if (!THREE?.GLTFLoader) throw new Error('G2.4.2 requires Three.js + GLTFLoader');

function bonePosition(character, id) {
  return character.rig.bones[id].getWorldPosition(new THREE.Vector3());
}

function rounded(value) {
  return Number((Number(value) || 0).toFixed(5));
}

function sampleStandingPose(character, clipId, duration, fraction) {
  const time = Math.max(0, Math.min(duration, duration * fraction));
  character.sampleAnimation(clipId, time, { loop:false, inPlace:true });
  character.object3d.updateMatrixWorld(true);

  const hips = bonePosition(character, 'hips');
  const chest = bonePosition(character, 'chest');
  const head = bonePosition(character, 'head');
  const leftFoot = bonePosition(character, 'foot.l');
  const rightFoot = bonePosition(character, 'foot.r');
  const leftUpperArm = bonePosition(character, 'upperarm.l');
  const rightUpperArm = bonePosition(character, 'upperarm.r');
  const leftWrist = bonePosition(character, 'wrist.l');
  const rightWrist = bonePosition(character, 'wrist.r');

  const torso = head.clone().sub(hips);
  const torsoLength = Math.max(1e-6, torso.length());
  const verticality = torso.y / torsoLength;
  const headHorizontalRatio = Math.hypot(torso.x, torso.z) / torsoLength;
  const chestRise = chest.y - hips.y;
  const leftFootDrop = hips.y - leftFoot.y;
  const rightFootDrop = hips.y - rightFoot.y;

  // G2.4.2 only answers whether the global humanoid coordinate basis is coherent.
  // Wrist / sword fidelity is intentionally diagnostic-only and belongs to the next stage.
  const pass = verticality >= 0.85
    && headHorizontalRatio <= 0.53
    && chestRise >= 0.25
    && leftFootDrop >= 0.12
    && rightFootDrop >= 0.12;

  return {
    fraction,
    time: rounded(time),
    pass,
    verticality: rounded(verticality),
    headHorizontalRatio: rounded(headHorizontalRatio),
    chestRise: rounded(chestRise),
    leftFootDrop: rounded(leftFootDrop),
    rightFootDrop: rounded(rightFootDrop),
    diagnostics: {
      shoulderSpan: rounded(leftUpperArm.distanceTo(rightUpperArm)),
      leftArmReach: rounded(leftUpperArm.distanceTo(leftWrist)),
      rightArmReach: rounded(rightUpperArm.distanceTo(rightWrist)),
    },
  };
}

async function run() {
  const character = createDefaultCharacter(THREE);
  const loader = new THREE.GLTFLoader();
  const library = await loadSkyrimConvertedAnimationLibrary(loader, {
    THREE,
    rig: character.rig,
    fps: 30,
  });
  const clipId = SKYRIM_GUARD_CONVERTED_FILES[0].clipId;
  const clip = library.clips.get(clipId);
  if (!clip) throw new Error(`Missing canonical retarget clip: ${clipId}`);

  character.registerAnimations(library);
  const fractions = [0, 0.25, 0.5, 0.75, 0.998];
  const samples = fractions.map((fraction) => sampleStandingPose(
    character,
    clipId,
    clip.duration,
    fraction,
  ));

  const basis = clip.userData?.basisCalibration || null;
  const translationSafety = clip.userData?.translationSafety || null;
  const pass = basis?.enabled === true
    && translationSafety?.safe !== false
    && samples.every((sample) => sample.pass);

  const result = {
    stage: 'G2.4.2',
    pass,
    clipId,
    duration: rounded(clip.duration),
    basisCalibration: basis,
    translationSafety,
    samples,
    scope: {
      globalStandingBasis: 'gate',
      wristAndSwordFidelity: 'diagnostic-only',
    },
  };

  document.documentElement.dataset.g242 = pass ? 'pass' : 'fail';
  report.textContent = JSON.stringify(result, null, 2);
  window.__G242_RESULT__ = result;
}

run().catch((error) => {
  document.documentElement.dataset.g242 = 'fail';
  const result = { stage:'G2.4.2', pass:false, error:error?.message || String(error) };
  report.textContent = JSON.stringify(result, null, 2);
  window.__G242_RESULT__ = result;
});
