// Does a REAL two-handed clip put the off hand on the hilt?
//
// build/measure-grip-reach.mjs asks this of the authored pose - seven left-arm angles that know
// nothing about where a hilt is - and handoff/44 recorded the answer: gaps of 0.27 to 1.26 on a
// character 1.4457 tall, with the hands on opposite sides of the body at impact. That was pinned as
// a record of failure for a real clip to beat.
//
// This is the same question asked of a converted Skyrim source pack, through the production bridge
// rather than a pose. The measurement itself is build/skyrim-grip-reach.mjs, shared with the test.
//
// Usage:
//   node build/measure-skyrim-grip-reach.mjs [source.glb] [weapon]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { V3_LONGSWORD_DEFINITION } from '../src/character/procedural-v3-weapon.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { composeSkyrimWeaponMountCalibration } from '../src/animation/skyrim-weapon-bind-calibration.js';
import { OFF_HAND_GRIP_SCOPE, applyOffHandGripIk } from '../src/animation/off-hand-grip-ik.js';
import { TWO_HAND_GRIP_REACH_TOLERANCE } from './grip-reach.mjs';
import { measureSkyrimGripReach, parseSourceGlb } from './skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const WEAPONS = { greatsword: V3_GREATSWORD_DEFINITION, longsword: V3_LONGSWORD_DEFINITION };

// --no-ik measures the gap the retarget leaves on its own, which is the before half of the pair.
const withoutIk = process.argv.includes('--no-ik');
const [, , sourceArg, weaponArg] = process.argv.filter((argument) => argument !== '--no-ik');
const sourcePath = path.resolve(ROOT, sourceArg || 'assets/skyrim/greatsword/converted/2hm_idle.source.glb');
const weaponId = weaponArg || 'greatsword';
const definition = WEAPONS[weaponId];
if (!definition) throw new Error(`unknown weapon "${weaponId}" - one of ${Object.keys(WEAPONS).join(', ')}`);

const id = path.basename(sourcePath, '.source.glb');
const gltf = await parseSourceGlb(THREE, await readFile(sourcePath));
const report = measureSkyrimGripReach(THREE, {
  gltf,
  definition,
  mount: DEFAULT_KAYKIT_SWORD_MOUNT,
  entry: { id, file: path.basename(sourcePath), clipId: `SKYRIM_SOURCE/${id}`, role: 'measurement' },
  createDefaultCharacter,
  createDebugSword,
  mountDebugSword,
  retargetConvertedSkyrimGltf,
  composeSkyrimWeaponMountCalibration,
  applyOffHandGripIk: withoutIk ? null : applyOffHandGripIk,
});

console.log(`${path.relative(ROOT, sourcePath)} · ${weaponId}`);
console.log(`clip ${report.clipName} · ${report.duration.toFixed(3)} s · height ${report.height.toFixed(4)} `
  + `· head-to-root ${report.stature.toFixed(4)}`);
console.log(`a grip counts as reached at <= ${TWO_HAND_GRIP_REACH_TOLERANCE} (see build/grip-reach.mjs)\n`);
console.log('  t (s)    gap      % of height   reached');
let reachedSamples = 0;
report.gaps.forEach(({ seconds, gap }, step) => {
  const reached = gap <= TWO_HAND_GRIP_REACH_TOLERANCE;
  if (reached) reachedSamples += 1;
  if (step % 3 === 0 || reached) {
    console.log(`  ${seconds.toFixed(3).padStart(6)}   ${gap.toFixed(4)}   `
      + `${(gap / report.height * 100).toFixed(1).padStart(6)}%       ${reached ? 'yes' : 'NO'}`);
  }
});
console.log(`\nbest ${report.best.toFixed(4)} · worst ${report.worst.toFixed(4)} `
  + `· ${reachedSamples}/${report.gaps.length} samples within tolerance`);

// Where the reach went, if it went. Two spans, because they answer different questions and mixing
// them is what made the first version of this report wrong.
console.log('\nwrist to wrist - a property of the POSE, which a rotation retarget should preserve');
console.log(`  in the source clip     ${(report.source.wristSpan * 100).toFixed(1)}%  of head-to-root`);
console.log(`  after retargeting      ${(report.wristSpan * 100).toFixed(1)}%`
  + `   (${(report.wristSpan / report.source.wristSpan).toFixed(2)}x the source)`);
console.log('\nequipment point to equipment point - a property of the GRIP, and what has to reach');
console.log(`  in the source clip     ${(report.source.equipmentSpan * 100).toFixed(1)}%  (Weapon -> Shield)`);
console.log(`  on this rig            ${(report.equipmentSpan * 100).toFixed(1)}%  (HAND_R -> HAND_L)`
  + `   (${(report.equipmentSpan / report.source.equipmentSpan).toFixed(2)}x the source)`);
console.log('\nhow far each equipment point sits off its own wrist');
console.log(`  source off hand        ${(report.source.offHandSocketOffset * 100).toFixed(1)}%`
  + `   main hand ${(report.source.mainHandSocketOffset * 100).toFixed(1)}%`);
console.log(`  this rig               ${(report.socketOffset * 100).toFixed(1)}%  on both sides`
  + `   (${(report.socketOffset / report.source.offHandSocketOffset).toFixed(1)}x the source's off hand)`);
console.log(`\nSECONDARY_GRIP sits ${report.secondaryGripFromMainHand.toFixed(4)} from the main hand; the source's`
  + ` equipment span is ${(report.source.equipmentSpan * report.stature).toFixed(4)}`);
console.log(`weapon bind correction ${report.bindCorrectionDegrees.toFixed(1)} deg, composed into the mount`);
if (report.offHandGrip) {
  const ik = report.offHandGrip;
  console.log(`\noff-hand grip IK · ${OFF_HAND_GRIP_SCOPE.bones.join(' + ')} · budget ${OFF_HAND_GRIP_SCOPE.maxCorrectionDegrees} deg`);
  console.log(`  worst gap without it  ${ik.worstBefore.toFixed(4)}`);
  console.log(`  largest correction    shoulder ${ik.worstShoulderDegrees.toFixed(1)} deg · elbow ${ik.worstElbowDegrees.toFixed(1)} deg`);
  if (!ik.applied) console.log(`  REFUSED on some frames: ${[...new Set(ik.refused)].join(', ')}`);
} else {
  console.log('\noff-hand grip IK · not applied (--no-ik)');
}

if (report.worst > TWO_HAND_GRIP_REACH_TOLERANCE) {
  console.log(`\nFAIL · the off hand is not on the hilt for the whole clip. Worst gap `
    + `${report.worst.toFixed(4)}, or ${(report.worst / report.height * 100).toFixed(0)}% of the character's height.`);
  process.exitCode = 1;
} else {
  console.log(`\nPASS · every sample puts the off hand on the hilt. Worst gap ${report.worst.toFixed(4)}.`);
}
