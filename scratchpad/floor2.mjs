// Part 2: the project's OWN ground definition, and whether "expected by construction" predicts
// the observed magnitude.
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
const SRC_ALIAS = {
  'upperleg.l': ['NPC L Thigh [LThg]'], 'lowerleg.l': ['NPC L Calf [LClf]'],
  'foot.l': ['NPC L Foot [Lft ]'], 'toes.l': ['NPC L Toe0 [LToe]'],
  'upperleg.r': ['NPC R Thigh [RThg]'], 'lowerleg.r': ['NPC R Calf [RClf]'],
  'foot.r': ['NPC R Foot [Rft ]'], 'toes.r': ['NPC R Toe0 [RToe]'],
};
const STANCE = [
  ...SKYRIM_BONE_RETARGETS.filter(({ id }) => ['root', 'pelvis', 'head'].includes(id)),
  ...Object.entries(SRC_ALIAS).map(([id, sourceAliases]) => ({ id, sourceAliases, target: id })),
];
const KEYS = ['root', 'pelvis', 'head', ...Object.keys(SRC_ALIAS)];
const TGT = { root: 'root', pelvis: 'hips', head: 'head', ...Object.fromEntries(Object.keys(SRC_ALIAS).map((k) => [k, k])) };
const GROUND = ['foot.l', 'toes.l', 'foot.r', 'toes.r'];
const JOINT_RADIUS = 0.045;   // src/character/kaykit-v3-line-appearance.js DEFAULT jointRadius
const N = 200;

const results = [];
for (const SOURCE of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, SOURCE)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig,
    { id: 's', file: path.basename(SOURCE), clipId: 'SKYRIM_SOURCE/s', role: 'm' }, { fps: 30 });
  ch.registerAnimations([clip]);
  const sr = gltf.scene;
  const res = resolveSkyrimSourceNodes(sr, STANCE);
  if (!res.valid) throw new Error(`${SOURCE} missing ${res.missing}`);
  const sN = Object.fromEntries(KEYS.map((k) => [k, res.nodes[k]]));
  const sPos = () => { sr.updateMatrixWorld(true);
    return Object.fromEntries(KEYS.map((k) => [k, sN[k].getWorldPosition(new THREE.Vector3())])); };
  const tPos = () => { ch.object3d.updateMatrixWorld(true);
    return Object.fromEntries(KEYS.map((k) => [k, ch.rig.bones[TGT[k]].getWorldPosition(new THREE.Vector3())])); };

  const s0 = sPos();
  const d = s0.head.clone().sub(s0.root);
  const ax = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(d[b]) > Math.abs(d[a]) ? b : a), 'x');
  const up = Math.sign(d[ax]) || 1; const sStat = Math.abs(d[ax]);
  const sH = (p) => (up * (p[ax] - s0.root[ax])) / sStat;
  const t0 = tPos(); const tStat = t0.head.y - t0.root.y;
  const tH = (p) => (p.y - t0.root.y) / tStat;
  const tAbsY = (p) => p.y - t0.root.y;

  const sRest = Object.fromEntries(KEYS.map((k) => [k, sH(s0[k])]));
  const tRest = Object.fromEntries(KEYS.map((k) => [k, tH(t0[k])]));
  const tRestGroundAbs = Math.min(...GROUND.map((g) => tAbsY(t0[g]))) - JOINT_RADIUS;

  const dur = ch.getAnimationDuration(clip.name);
  const mx = new THREE.AnimationMixer(sr);
  const act = mx.clipAction(gltf.animations[0]);
  act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
  const sDur = gltf.animations[0].duration;

  const rows = [];
  for (let i = 0; i <= N; i += 1) {
    const f = i / N;
    mx.setTime(sDur * f);
    const sp = sPos();
    ch.sampleAnimation(clip.name, dur * f);
    const tp = tPos();
    rows.push({
      f,
      s: Object.fromEntries(KEYS.map((k) => [k, sH(sp[k])])),
      t: Object.fromEntries(KEYS.map((k) => [k, tH(tp[k])])),
      tGroundAbs: Math.min(...GROUND.map((g) => tAbsY(tp[g]))) - JOINT_RADIUS,
      sGroundNorm: Math.min(...GROUND.map((g) => sH(sp[g]))),
    });
  }
  results.push({ name: path.basename(SOURCE, '.source.glb'), sRest, tRest, rows, tStat, tRestGroundAbs, sStat });
}

const f2 = (v) => v.toFixed(4);
const pc = (v) => `${(v * 100).toFixed(2)}`;

console.log("=== A. The project's OWN ground test: min(foot.l,toes.l,foot.r,toes.r) - jointRadius");
console.log('   (kaykit-pose-adapter.js grounds the procedural pose on exactly these four bones;');
console.log('    the Skyrim retarget playback path applies NO such grounding.)');
console.log('clip'.padEnd(20), 'rest contact'.padStart(13), 'min over clip'.padStart(14), 'BELOW FLOOR'.padStart(12), 'as % stature'.padStart(13));
for (const r of results) {
  const min = Math.min(...r.rows.map((x) => x.tGroundAbs));
  const below = min - r.tRestGroundAbs;
  console.log(r.name.padEnd(20), f2(r.tRestGroundAbs).padStart(13), f2(min).padStart(14),
    (below < 0 ? f2(below) : '   -').padStart(12), (below < 0 ? pc(below / r.tStat) : '-').padStart(13));
}

console.log('\n=== B. What is the SOURCE doing at the frame where the target is deepest?');
console.log('clip'.padEnd(20), 't/dur'.padStart(6), 'src lowest foot pt'.padStart(19), 'src rest'.padStart(9), 'src vs its rest'.padStart(16));
for (const r of results) {
  let worst = r.rows[0];
  for (const x of r.rows) if (x.tGroundAbs < worst.tGroundAbs) worst = x;
  const sRestGround = Math.min(...GROUND.map((g) => r.sRest[g]));
  console.log(r.name.padEnd(20), worst.f.toFixed(3).padStart(6),
    `${pc(worst.sGroundNorm)}%`.padStart(19), `${pc(sRestGround)}%`.padStart(9),
    `${(worst.sGroundNorm - sRestGround) >= 0 ? '+' : ''}${pc(worst.sGroundNorm - sRestGround)} pts`.padStart(16));
}

console.log('\n=== C. Does "expected by construction" PREDICT the magnitude?');
console.log('  Model: target foot delta = target pelvis delta - legRatio * (source hip->ankle drop change)');
console.log('  legRatio = target leg / source leg, both as a fraction of own stature = 0.577');
console.log('  residual = observed target foot delta - predicted. Zero residual => pure rig proportion.');
console.log('clip'.padEnd(20), 'foot'.padStart(6), 'worst obs'.padStart(10), 'predicted'.padStart(10), 'residual'.padStart(9), 'resid/obs'.padStart(10));
for (const r of results) {
  for (const side of ['l', 'r']) {
    const foot = `foot.${side}`; const hip = `upperleg.${side}`;
    const legRatio = (r.tRest[hip] - r.tRest[foot]) / (r.sRest[hip] - r.sRest[foot]);
    let best = null;
    for (const x of r.rows) {
      const obs = (x.t[foot] - r.tRest[foot]) - (x.s[foot] - r.sRest[foot]);
      const dPelvisT = x.t.pelvis - r.tRest.pelvis;
      const dDropS = (x.s[hip] - x.s[foot]) - (r.sRest[hip] - r.sRest[foot]);
      const dHipOffPelvisT = (x.t[hip] - x.t.pelvis) - (r.tRest[hip] - r.tRest.pelvis);
      const predFootT = dPelvisT + dHipOffPelvisT - legRatio * dDropS;
      const predDis = predFootT - (x.s[foot] - r.sRest[foot]);
      const resid = obs - predDis;
      if (!best || Math.abs(obs) > Math.abs(best.obs)) best = { obs, predDis, resid };
    }
    console.log(r.name.padEnd(20), foot.padStart(6), pc(best.obs).padStart(10), pc(best.predDis).padStart(10),
      pc(best.resid).padStart(9), (best.resid / best.obs).toFixed(3).padStart(10));
  }
}
