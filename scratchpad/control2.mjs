// Like-for-like control: how far does EACH rig put its own lowest foot point below its own
// rest ground contact, normalized by its own head-to-root? Same question, same normalizer, both rigs.
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
const SRC = {
  'foot.l': ['NPC L Foot [Lft ]'], 'toes.l': ['NPC L Toe0 [LToe]'],
  'foot.r': ['NPC R Foot [Rft ]'], 'toes.r': ['NPC R Toe0 [RToe]'],
};
const STANCE = [
  ...SKYRIM_BONE_RETARGETS.filter(({ id }) => ['root', 'pelvis', 'head'].includes(id)),
  ...Object.entries(SRC).map(([id, sourceAliases]) => ({ id, sourceAliases, target: id })),
];
const G = Object.keys(SRC);
const CLIPS = [
  'assets/skyrim/greatsword/converted/2hm_idle.source.glb',
  'assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb',
  'assets/skyrim/guard/converted/shd_blockidle.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];
console.log('lowest foot/toe BONE, below that rig\'s own rest value, in points of its own head-to-root');
console.log('clip'.padEnd(20), 'SOURCE dips'.padStart(12), 'TARGET dips'.padStart(12), 'ratio'.padStart(8));
for (const S of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, S)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig,
    { id: 'c', file: path.basename(S), clipId: 'C/c', role: 'm' }, { fps: 30 });
  ch.registerAnimations([clip]);
  const rep = resolveSkyrimSourceNodes(gltf.scene, STANCE);
  const sp = () => { gltf.scene.updateMatrixWorld(true);
    return Object.fromEntries([...G, 'root', 'head'].map((k) => [k, rep.nodes[k].getWorldPosition(new THREE.Vector3())])); };
  const tp = () => { ch.object3d.updateMatrixWorld(true);
    return Object.fromEntries([...G, 'root', 'head'].map((k) => [k, ch.rig.bones[k === 'root' ? 'root' : k].getWorldPosition(new THREE.Vector3())])); };
  const s0 = sp();
  const d = s0.head.clone().sub(s0.root);
  const ax = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(d[b]) > Math.abs(d[a]) ? b : a), 'x');
  const up = Math.sign(d[ax]) || 1; const sStat = Math.abs(d[ax]);
  const sh = (p) => (up * (p[ax] - s0.root[ax])) / sStat;
  const t0 = tp(); const tStat = t0.head.y - t0.root.y;
  const th = (p) => (p.y - t0.root.y) / tStat;
  const sRestG = Math.min(...G.map((g) => sh(s0[g])));
  const tRestG = Math.min(...G.map((g) => th(t0[g])));
  const mx = new THREE.AnimationMixer(gltf.scene);
  const a = mx.clipAction(gltf.animations[0]).reset();
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  let sMin = Infinity; let tMin = Infinity;
  for (let i = 0; i <= 200; i += 1) {
    const t = clip.duration * (i / 200) * 0.998;
    mx.setTime(t);
    const s = sp(); ch.sampleAnimation(clip.name, t, { loop: false, inPlace: true }); const tt = tp();
    sMin = Math.min(sMin, Math.min(...G.map((g) => sh(s[g]))));
    tMin = Math.min(tMin, Math.min(...G.map((g) => th(tt[g]))));
  }
  const sd = (sMin - sRestG) * 100; const td = (tMin - tRestG) * 100;
  console.log(path.basename(S, '.source.glb').padEnd(20),
    `${sd.toFixed(2)} pts`.padStart(12), `${td.toFixed(2)} pts`.padStart(12), (td / sd).toFixed(1).padStart(8));
}
