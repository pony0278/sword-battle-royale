import { createDefaultCharacter } from '../../src/character/default-character.js';
import {
  SKYRIM_GUARD_CONVERTED_FILES,
  loadSkyrimConvertedAnimationLibrary,
} from '../../src/animation/skyrim-converted-animation-library.js';

const THREE = window.THREE;
const report = document.getElementById('report');

if (!THREE?.GLTFLoader) throw new Error('G2.4.3 requires Three.js + GLTFLoader');

function rounded(value) {
  return Number((Number(value) || 0).toFixed(5));
}

function bonePosition(character, id) {
  return character.rig.bones[id].getWorldPosition(new THREE.Vector3());
}

function sampleArmTopology(character, clipId, duration, fraction) {
  const time = Math.max(0, Math.min(duration, duration * fraction));
  character.sampleAnimation(clipId, time, { loop:false, inPlace:true });
  character.object3d.updateMatrixWorld(true);

  const result = { fraction, time: rounded(time), sides: {} };
  for (const side of ['l', 'r']) {
    const shoulder = bonePosition(character, `upperarm.${side}`);
    const elbow = bonePosition(character, `lowerarm.${side}`);
    const wrist = bonePosition(character, `wrist.${side}`);
    const hand = bonePosition(character, `hand.${side}`);
    const upperLength = shoulder.distanceTo(elbow);
    const lowerLength = elbow.distanceTo(wrist);
    const handLength = wrist.distanceTo(hand);
    result.sides[side] = {
      upperLength: rounded(upperLength),
      lowerLength: rounded(lowerLength),
      handLength: rounded(handLength),
      pass: upperLength > 0.15 && lowerLength > 0.15 && handLength > 0.03,
    };
  }
  result.pass = result.sides.l.pass && result.sides.r.pass;
  return result;
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
  const metrics = clip.userData?.armChainMetrics || null;
  const trackNames = new Set(clip.tracks.map((track) => track.name));
  const requiredTracks = [
    'handl.quaternion',
    'handslotl.quaternion',
    'handr.quaternion',
    'handslotr.quaternion',
  ];
  const missingTracks = requiredTracks.filter((name) => !trackNames.has(name));
  const topology = [0, 0.25, 0.5, 0.75, 0.998].map((fraction) => sampleArmTopology(
    character,
    clipId,
    clip.duration,
    fraction,
  ));

  const directionLimitDegrees = 1.0;
  const pass = metrics?.directionConstraintsEnabled === true
    && Number(metrics?.maxDirectionErrorDegrees) <= directionLimitDegrees
    && metrics?.weaponHelperMapped === true
    && metrics?.shieldHelperMapped === true
    && missingTracks.length === 0
    && topology.every((sample) => sample.pass);

  const result = {
    stage: 'G2.4.3',
    pass,
    clipId,
    duration: rounded(clip.duration),
    directionLimitDegrees,
    armChainMetrics: metrics,
    requiredTracks,
    missingTracks,
    topology,
    policy: {
      clavicle: 'fold source world joint direction into target limb direction',
      twist: 'do not double-apply deformation-only sibling twist bones to rigid line limbs',
      hand: 'Skyrim Hand drives wrist + hand targets',
      weapon: 'Skyrim Weapon helper drives KayKit handslot.r',
    },
  };

  document.documentElement.dataset.g243 = pass ? 'pass' : 'fail';
  report.textContent = JSON.stringify(result, null, 2);
  window.__G243_RESULT__ = result;
}

run().catch((error) => {
  document.documentElement.dataset.g243 = 'fail';
  const result = { stage:'G2.4.3', pass:false, error:error?.message || String(error) };
  report.textContent = JSON.stringify(result, null, 2);
  window.__G243_RESULT__ = result;
});
