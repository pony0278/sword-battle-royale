// Where does the retarget put the body, vertically?
//
// handoff/46 recorded "the pelvis sits 24.6 points lower than the source's and the feet 6.2 higher"
// as an unexplained finding. This asks the question precisely enough to answer it, because the
// obvious framing is a trap: only `root` and `pelvis` carry position through
// SKYRIM_BONE_RETARGETS. Every other bone is rotation-only, so a foot's height is not transferred
// at all - it is whatever the target rig's own leg lengths put it at once the rotations are applied.
//
// And the pelvis is anchored at the TARGET's rest position plus the source's delta FROM ITS OWN
// REST, so a pose sitting at rest transfers nothing: the target sits at its own rest height by
// design. Comparing the two rigs' posed proportions therefore measures the rigs, not the retarget.
//
// So the comparison that can actually indict the retarget is REST vs REST first, POSE DELTA second:
//
//   rest       what each rig is shaped like, before any clip. A difference here is the rigs.
//   delta      how far each moves from its own rest once the clip plays. A difference HERE is the
//              retarget, because the delta is the only thing the retarget claims to carry.
//
// Usage:
//   node build/measure-skyrim-stance.mjs [source.glb]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from './skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const SOURCE = process.argv[2] || 'assets/skyrim/greatsword/converted/2hm_idle.source.glb';

// Resolved by the RETARGET'S OWN resolver, not by hand-typed names. Two reasons, both learned
// here: GLTFLoader rewrites Skyrim's spaces and brackets (and `NPC L Foot [Lft ]` carries a
// trailing space inside the bracket), and the scene contains BOTH `NPC_Root_Root` and
// `NPC_Root_Root_1`. Picking the wrong one of those would measure a node the retarget never reads,
// which is exactly the class of mistake this file exists to avoid.
const STANCE_RETARGETS = Object.freeze([
  ...SKYRIM_BONE_RETARGETS.filter(({ id }) => ['root', 'pelvis', 'head'].includes(id)),
  Object.freeze({ id: 'foot.l', sourceAliases: Object.freeze(['NPC L Foot [Lft ]', 'NPC L Foot', 'L Foot']), target: 'foot.l' }),
  Object.freeze({ id: 'foot.r', sourceAliases: Object.freeze(['NPC R Foot [Rft ]', 'NPC R Foot', 'R Foot']), target: 'foot.r' }),
]);

const TARGET_BONES = { root: 'root', pelvis: 'hips', head: 'head', footL: 'foot.l', footR: 'foot.r' };

const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, SOURCE)));
const character = createDefaultCharacter(THREE);
const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, {
  id: 'stance', file: path.basename(SOURCE), clipId: 'SKYRIM_SOURCE/stance', role: 'measurement',
}, { fps: 30 });
character.registerAnimations([clip]);

// The source's own node names vary across exports; resolve them and say so if one is missing.
const sourceRoot = gltf.scene;
const resolved = resolveSkyrimSourceNodes(sourceRoot, STANCE_RETARGETS);
if (!resolved.valid) throw new Error(`the source hierarchy is missing ${resolved.missing.join(', ')}`);
const sourceNodes = {
  root: resolved.nodes.root, pelvis: resolved.nodes.pelvis, head: resolved.nodes.head,
  footL: resolved.nodes['foot.l'], footR: resolved.nodes['foot.r'],
};

function sourceHeights() {
  sourceRoot.updateMatrixWorld(true);
  const at = (node) => node.getWorldPosition(new THREE.Vector3());
  const p = Object.fromEntries(Object.entries(sourceNodes).map(([k, n]) => [k, at(n)]));
  // Skyrim is Z-up in its own file; the converted GLB is Y-up. Height is read off the axis the
  // head actually separates from the root on, rather than assumed, so a convention change is loud.
  const axisDelta = p.head.clone().sub(p.root);
  const axis = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(axisDelta[b]) > Math.abs(axisDelta[a]) ? b : a), 'x');
  const stature = Math.abs(axisDelta[axis]);
  const up = Math.sign(axisDelta[axis]) || 1;
  const h = (v) => (up * (v[axis] - p.root[axis])) / stature;
  return { axis, stature, pelvis: h(p.pelvis), footL: h(p.footL), footR: h(p.footR) };
}

function targetHeights() {
  character.object3d.updateMatrixWorld(true);
  const bones = character.rig.bones;
  const at = (name) => bones[name].getWorldPosition(new THREE.Vector3());
  const p = Object.fromEntries(Object.entries(TARGET_BONES).map(([k, n]) => [k, at(n)]));
  const stature = p.head.y - p.root.y;
  const h = (v) => (v.y - p.root.y) / stature;
  return { stature, pelvis: h(p.pelvis), footL: h(p.footL), footR: h(p.footR) };
}

// REST. The source's rest is the pose captured at load; the target's is the rig before any clip.
const sourceRest = sourceHeights();
const targetRest = targetHeights();

// POSE. Sampled at the same fractions of each clip's own duration, so a 2.5 s and a 6.667 s take
// are compared at the same points in their cycle rather than at the same wall-clock seconds.
const duration = character.getAnimationDuration(clip.name);
const mixer = new THREE.AnimationMixer(sourceRoot);
mixer.clipAction(gltf.animations[0]).play();
const sourceDuration = gltf.animations[0].duration;

const rows = [];
for (let step = 0; step <= 10; step += 1) {
  const f = step / 10;
  mixer.setTime(sourceDuration * f);
  const s = sourceHeights();
  character.sampleAnimation(clip.name, duration * f);
  const t = targetHeights();
  rows.push({ f, s, t });
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const signed = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}`;

console.log(`${SOURCE}`);
console.log(`clip ${clip.name} · source ${sourceDuration.toFixed(3)}s · target ${duration.toFixed(3)}s`);
console.log(`source up-axis ${sourceRest.axis} · source stature ${sourceRest.stature.toFixed(4)} · target ${targetRest.stature.toFixed(4)}`);
console.log('\nheights as a fraction of each rig\'s OWN head-to-root, so the two are comparable\n');
console.log('REST - what the rigs are shaped like. A gap here is the RIGS, not the retarget.');
console.log(`  pelvis   source ${pct(sourceRest.pelvis)}   target ${pct(targetRest.pelvis)}   gap ${signed(targetRest.pelvis - sourceRest.pelvis)} pts`);
console.log(`  foot.l   source ${pct(sourceRest.footL)}   target ${pct(targetRest.footL)}   gap ${signed(targetRest.footL - sourceRest.footL)} pts`);
console.log(`  foot.r   source ${pct(sourceRest.footR)}   target ${pct(targetRest.footR)}   gap ${signed(targetRest.footR - sourceRest.footR)} pts`);

console.log('\nPOSE - absolute heights while the clip plays.');
console.log('  t/dur    pelvis src   pelvis tgt      foot.l src   foot.l tgt      foot.r src   foot.r tgt');
for (const { f, s, t } of rows) {
  console.log(`  ${f.toFixed(1)}      ${pct(s.pelvis).padStart(7)}    ${pct(t.pelvis).padStart(7)}       ${pct(s.footL).padStart(7)}    ${pct(t.footL).padStart(7)}       ${pct(s.footR).padStart(7)}    ${pct(t.footR).padStart(7)}`);
}

console.log('\nDELTA FROM EACH RIG\'S OWN REST - the only thing the retarget claims to carry.');
console.log('  t/dur    pelvis src   pelvis tgt   diff      foot.l src   foot.l tgt   diff');
for (const { f, s, t } of rows) {
  const sp = s.pelvis - sourceRest.pelvis; const tp = t.pelvis - targetRest.pelvis;
  const sf = s.footL - sourceRest.footL; const tf = t.footL - targetRest.footL;
  console.log(`  ${f.toFixed(1)}      ${signed(sp).padStart(7)}    ${signed(tp).padStart(7)}   ${signed(tp - sp).padStart(6)}      ${signed(sf).padStart(7)}    ${signed(tf).padStart(7)}   ${signed(tf - sf).padStart(6)}`);
}
