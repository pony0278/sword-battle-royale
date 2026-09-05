// Port of the SHIPPED G2.4.4 pose-equivalence gate (tools/action-studio/skyrim-pose-equivalence-review.js
// + src/combat/skyrim-guard-adoption-review.js) to node, run on all six committed clips.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { retargetConvertedSkyrimGltf } from '../src/animation/skyrim-converted-animation-library.js';
import { resolveSkyrimSourceNodes } from '../src/animation/skyrim-animation-retarget.js';
import { classifySkyrimPoseEquivalence } from '../src/combat/skyrim-guard-adoption-review.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };

// verbatim from the review harness
const EQUIVALENCE_SEGMENTS = [
  { id:'torso.pelvis-chest', source:['pelvis','chest'], target:['hips','chest'], core:true },
  { id:'torso.pelvis-head', source:['pelvis','head'], target:['hips','head'], core:true },
  { id:'torso.chest-head', source:['chest','head'], target:['chest','head'], core:true },
  { id:'arm.l.upper', source:['upperarm.l','lowerarm.l'], target:['upperarm.l','lowerarm.l'], core:true },
  { id:'arm.l.lower', source:['lowerarm.l','wrist.l'], target:['lowerarm.l','wrist.l'], core:true },
  { id:'arm.r.upper', source:['upperarm.r','lowerarm.r'], target:['upperarm.r','lowerarm.r'], core:true },
  { id:'arm.r.lower', source:['lowerarm.r','wrist.r'], target:['lowerarm.r','wrist.r'], core:true },
  { id:'leg.l.upper', source:['upperleg.l','lowerleg.l'], target:['upperleg.l','lowerleg.l'], core:true },
  { id:'leg.l.lower', source:['lowerleg.l','foot.l'], target:['lowerleg.l','foot.l'], core:true },
  { id:'leg.l.foot', source:['foot.l','toes.l'], target:['foot.l','toes.l'], core:true },
  { id:'leg.r.upper', source:['upperleg.r','lowerleg.r'], target:['upperleg.r','lowerleg.r'], core:true },
  { id:'leg.r.lower', source:['lowerleg.r','foot.r'], target:['lowerleg.r','foot.r'], core:true },
  { id:'leg.r.foot', source:['foot.r','toes.r'], target:['foot.r','toes.r'], core:true },
];
const CLIPS = [
  'assets/skyrim/greatsword/converted/2hm_idle.source.glb',
  'assets/skyrim/greatsword/converted/2hm_idle_alt.source.glb',
  'assets/skyrim/guard/converted/shd_blockidle.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];
const CANON = [0, 0.25, 0.5, 0.75, 0.998];
const rounded = (v, d = 5) => Number((Number(v) || 0).toFixed(d));
const percentile = (values, ratio) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * ratio) - 1))];
};

async function measure(SOURCE, fractions) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, SOURCE)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, ch.rig,
    { id: 'g', file: path.basename(SOURCE), clipId: 'SKYRIM_SOURCE/g', role: 'm' }, { fps: 30 });
  ch.registerAnimations([clip]);
  const scene = gltf.scene;
  const rep = resolveSkyrimSourceNodes(scene);
  if (!rep.valid) throw new Error(`${SOURCE}: ${rep.missing.join(', ')}`);
  const mixer = new THREE.AnimationMixer(scene);
  const act = mixer.clipAction(gltf.animations[0]).reset();
  act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
  const basis = new THREE.Quaternion().fromArray(clip.userData.basisCalibration.quaternion).normalize();

  const perSegment = new Map(EQUIVALENCE_SEGMENTS.map((s) => [s.id, []]));
  const coreAngles = [];
  for (const f of fractions) {
    const time = clip.duration * f;
    mixer.setTime(time);
    scene.updateMatrixWorld(true);
    ch.sampleAnimation(clip.name, time, { loop: false, inPlace: true });
    ch.object3d.updateMatrixWorld(true);
    for (const seg of EQUIVALENCE_SEGMENTS) {
      const a = rep.nodes[seg.source[0]].getWorldPosition(new THREE.Vector3());
      const b = rep.nodes[seg.source[1]].getWorldPosition(new THREE.Vector3());
      const c = ch.rig.bones[seg.target[0]].getWorldPosition(new THREE.Vector3());
      const d = ch.rig.bones[seg.target[1]].getWorldPosition(new THREE.Vector3());
      const sd = b.clone().sub(a).applyQuaternion(basis).normalize();
      const td = d.clone().sub(c).normalize();
      const ang = rounded(THREE.MathUtils.radToDeg(sd.angleTo(td)));
      perSegment.get(seg.id).push(ang);
      if (seg.core) coreAngles.push(ang);
    }
  }
  const metrics = {
    sampleCount: coreAngles.length,
    meanDegrees: rounded(coreAngles.reduce((s, v) => s + v, 0) / Math.max(1, coreAngles.length)),
    p95Degrees: rounded(percentile(coreAngles, 0.95)),
    maxDegrees: rounded(Math.max(0, ...coreAngles)),
  };
  return { metrics, verdict: classifySkyrimPoseEquivalence(metrics), perSegment };
}

console.log('=== The SHIPPED G2.4.4 gate, at its own five canonical timestamps');
console.log('    thresholds  GOOD mean<=8 p95<=15 max<=25 | WARNING mean<=15 p95<=28 max<=45 | else BAD');
console.log('clip'.padEnd(20), 'mean'.padStart(8), 'p95'.padStart(8), 'max'.padStart(8), '  status', '  worst segment');
for (const c of CLIPS) {
  const { metrics, verdict, perSegment } = await measure(c, CANON);
  let worst = ['', 0];
  for (const [id, arr] of perSegment) { const m = Math.max(...arr); if (m > worst[1]) worst = [id, m]; }
  console.log(path.basename(c, '.source.glb').padEnd(20),
    metrics.meanDegrees.toFixed(2).padStart(8), metrics.p95Degrees.toFixed(2).padStart(8),
    metrics.maxDegrees.toFixed(2).padStart(8), `  ${verdict.status.toUpperCase().padEnd(8)}`,
    `${worst[0]} ${worst[1].toFixed(2)}deg`);
}

console.log('\n=== The same gate, sampled across the WHOLE clip (201 samples) instead of five instants');
console.log('clip'.padEnd(20), 'mean'.padStart(8), 'p95'.padStart(8), 'max'.padStart(8), '  status', '  worst segment');
const dense = [];
for (let i = 0; i <= 200; i += 1) dense.push(i / 200 * 0.998);
for (const c of CLIPS) {
  const { metrics, verdict, perSegment } = await measure(c, dense);
  let worst = ['', 0];
  for (const [id, arr] of perSegment) { const m = Math.max(...arr); if (m > worst[1]) worst = [id, m]; }
  console.log(path.basename(c, '.source.glb').padEnd(20),
    metrics.meanDegrees.toFixed(2).padStart(8), metrics.p95Degrees.toFixed(2).padStart(8),
    metrics.maxDegrees.toFixed(2).padStart(8), `  ${verdict.status.toUpperCase().padEnd(8)}`,
    `${worst[0]} ${worst[1].toFixed(2)}deg`);
}

console.log('\n=== Per-segment worst angle across the whole clip, all six clips (degrees)');
const ids = EQUIVALENCE_SEGMENTS.map((s) => s.id);
const table = [];
for (const c of CLIPS) {
  const { perSegment } = await measure(c, dense);
  table.push([path.basename(c, '.source.glb'), ids.map((id) => Math.max(...perSegment.get(id)))]);
}
console.log('segment'.padEnd(20), ...table.map(([n]) => n.slice(0, 9).padStart(10)));
ids.forEach((id, i) => {
  console.log(id.padEnd(20), ...table.map(([, v]) => v[i].toFixed(2).padStart(10)));
});
