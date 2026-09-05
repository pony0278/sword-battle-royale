// Adversarial re-measure: is the rotation-only foot divergence "expected by construction",
// or does it put the foot through the floor?
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };

const CLIPS = [
  'assets/skyrim/greatsword/converted/2hm_idle.source.glb',
  'assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb',
  'assets/skyrim/guard/converted/shd_blockidle.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];

const STANCE_RETARGETS = Object.freeze([
  ...SKYRIM_BONE_RETARGETS.filter(({ id }) => ['root', 'pelvis', 'head'].includes(id)),
  { id: 'upperleg.l', sourceAliases: ['NPC L Thigh [LThg]', 'NPC L Thigh', 'L Thigh'], target: 'upperleg.l' },
  { id: 'lowerleg.l', sourceAliases: ['NPC L Calf [LClf]', 'NPC L Calf', 'L Calf'], target: 'lowerleg.l' },
  { id: 'foot.l', sourceAliases: ['NPC L Foot [Lft ]', 'NPC L Foot', 'L Foot'], target: 'foot.l' },
  { id: 'toes.l', sourceAliases: ['NPC L Toe0 [LToe]', 'NPC L Toe0', 'L Toe0'], target: 'toes.l' },
  { id: 'upperleg.r', sourceAliases: ['NPC R Thigh [RThg]', 'NPC R Thigh', 'R Thigh'], target: 'upperleg.r' },
  { id: 'lowerleg.r', sourceAliases: ['NPC R Calf [RClf]', 'NPC R Calf', 'R Calf'], target: 'lowerleg.r' },
  { id: 'foot.r', sourceAliases: ['NPC R Foot [Rft ]', 'NPC R Foot', 'R Foot'], target: 'foot.r' },
  { id: 'toes.r', sourceAliases: ['NPC R Toe0 [RToe]', 'NPC R Toe0', 'R Toe0'], target: 'toes.r' },
]);

const KEYS = ['root', 'pelvis', 'head', 'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
              'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r'];
const TARGET_OF = { root: 'root', pelvis: 'hips', head: 'head', 'upperleg.l': 'upperleg.l',
  'lowerleg.l': 'lowerleg.l', 'foot.l': 'foot.l', 'toes.l': 'toes.l', 'upperleg.r': 'upperleg.r',
  'lowerleg.r': 'lowerleg.r', 'foot.r': 'foot.r', 'toes.r': 'toes.r' };

const SAMPLES = 200;
const out = [];

for (const SOURCE of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, SOURCE)));
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig,
    { id: 'stance', file: path.basename(SOURCE), clipId: 'SKYRIM_SOURCE/stance', role: 'measurement' },
    { fps: 30 });
  character.registerAnimations([clip]);

  const sourceRoot = gltf.scene;
  const resolved = resolveSkyrimSourceNodes(sourceRoot, STANCE_RETARGETS);
  if (!resolved.valid) throw new Error(`${SOURCE}: missing ${resolved.missing.join(', ')}`);
  const sNodes = Object.fromEntries(KEYS.map((k) => [k, resolved.nodes[k]]));

  function sourceRaw() {
    sourceRoot.updateMatrixWorld(true);
    return Object.fromEntries(KEYS.map((k) => [k, sNodes[k].getWorldPosition(new THREE.Vector3())]));
  }
  function targetRaw() {
    character.object3d.updateMatrixWorld(true);
    const b = character.rig.bones;
    return Object.fromEntries(KEYS.map((k) => [k, b[TARGET_OF[k]].getWorldPosition(new THREE.Vector3())]));
  }

  // Source up-axis from REST head-to-root, read once.
  const sRest0 = sourceRaw();
  const d = sRest0.head.clone().sub(sRest0.root);
  const axis = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(d[b]) > Math.abs(d[a]) ? b : a), 'x');
  const up = Math.sign(d[axis]) || 1;
  const sStature = Math.abs(d[axis]);
  const sH = (p) => (up * (p[axis] - sRest0.root[axis])) / sStature;   // fraction of source stature
  const sAbs = (p) => up * (p[axis] - sRest0.root[axis]);              // source units above root

  const tRest0 = targetRaw();
  const tStature = tRest0.head.y - tRest0.root.y;
  const tH = (p) => (p.y - tRest0.root.y) / tStature;
  const tAbs = (p) => p.y - tRest0.root.y;                             // target units above root

  const sRest = Object.fromEntries(KEYS.map((k) => [k, sH(sRest0[k])]));
  const tRest = Object.fromEntries(KEYS.map((k) => [k, tH(tRest0[k])]));

  const dur = character.getAnimationDuration(clip.name);
  const mixer = new THREE.AnimationMixer(sourceRoot);
  const action = mixer.clipAction(gltf.animations[0]);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const sDur = gltf.animations[0].duration;

  const rows = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const f = i / SAMPLES;
    mixer.setTime(sDur * f);
    const sp = sourceRaw();
    character.sampleAnimation(clip.name, dur * f);
    const tp = targetRaw();
    rows.push({
      f,
      s: Object.fromEntries(KEYS.map((k) => [k, sH(sp[k])])),
      t: Object.fromEntries(KEYS.map((k) => [k, tH(tp[k])])),
      sAbs: Object.fromEntries(KEYS.map((k) => [k, sAbs(sp[k])])),
      tAbs: Object.fromEntries(KEYS.map((k) => [k, tAbs(tp[k])])),
    });
  }
  out.push({ SOURCE, clipName: clip.name, sStature, tStature, sRest, tRest, rows, clip });
}

// ---------- report ----------
const p2 = (v) => (v * 100).toFixed(2);
const sg = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}`;

console.log('=== 1. REPRODUCE: worst delta-from-own-rest disagreement (target - source), points of own stature');
console.log('clip'.padEnd(20), 'foot.l'.padStart(8), 'foot.r'.padStart(8), 'head'.padStart(8), 'pelvis'.padStart(8));
for (const c of out) {
  const worst = (k) => c.rows.reduce((w, r) => {
    const v = (r.t[k] - c.tRest[k]) - (r.s[k] - c.sRest[k]);
    return Math.abs(v) > Math.abs(w) ? v : w;
  }, 0);
  console.log(path.basename(c.SOURCE, '.source.glb').padEnd(20),
    sg(worst('foot.l')).padStart(8), sg(worst('foot.r')).padStart(8),
    sg(worst('head')).padStart(8), sg(worst('pelvis')).padStart(8));
}

console.log('\n=== 2. RIG SHAPE: leg length as a fraction of each rig\'s OWN head-to-root (rest)');
console.log('clip'.padEnd(20), 'src hip->ankle'.padStart(14), 'tgt hip->ankle'.padStart(14), 'ratio t/s'.padStart(10));
for (const c of out) {
  const sLeg = c.sRest['upperleg.l'] - c.sRest['foot.l'];
  const tLeg = c.tRest['upperleg.l'] - c.tRest['foot.l'];
  console.log(path.basename(c.SOURCE, '.source.glb').padEnd(20),
    `${p2(sLeg)}%`.padStart(14), `${p2(tLeg)}%`.padStart(14), (tLeg / sLeg).toFixed(3).padStart(10));
}

console.log('\n=== 3. FLOOR: ankle height above the root plane, points of own stature.');
console.log('    rest = clearance the rig starts with; min = lowest the clip ever puts it.');
console.log('clip'.padEnd(20), 'SRC rest'.padStart(9), 'SRC min'.padStart(9), 'TGT rest'.padStart(9), 'TGT min'.padStart(9), 'TGT below-rest'.padStart(15));
for (const c of out) {
  for (const foot of ['foot.l', 'foot.r']) {
    const sMin = Math.min(...c.rows.map((r) => r.s[foot]));
    const tMin = Math.min(...c.rows.map((r) => r.t[foot]));
    console.log(`${path.basename(c.SOURCE, '.source.glb')} ${foot}`.padEnd(20),
      `${p2(c.sRest[foot])}`.padStart(9), `${p2(sMin)}`.padStart(9),
      `${p2(c.tRest[foot])}`.padStart(9), `${p2(tMin)}`.padStart(9),
      `${sg(tMin - c.tRest[foot])}`.padStart(15));
  }
}

console.log('\n=== 4. ABSOLUTE target-model units (character head-to-root = target stature)');
for (const c of out.slice(0, 1)) console.log(`target stature (root->head) = ${c.tStature.toFixed(4)} model units`);
console.log('clip'.padEnd(24), 'tgt ankle rest'.padStart(14), 'tgt ankle min'.padStart(14), 'drop'.padStart(9));
for (const c of out) {
  for (const foot of ['foot.l', 'foot.r']) {
    const restAbs = c.rows[0].tAbs[foot] - (c.rows[0].t[foot] - c.tRest[foot]) * c.tStature;
    const minAbs = Math.min(...c.rows.map((r) => r.tAbs[foot]));
    console.log(`${path.basename(c.SOURCE, '.source.glb')} ${foot}`.padEnd(24),
      restAbs.toFixed(4).padStart(14), minAbs.toFixed(4).padStart(14), (minAbs - restAbs).toFixed(4).padStart(9));
  }
}
