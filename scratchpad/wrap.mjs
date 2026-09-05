// Independent reconstruction of the claim's evidence: does a LoopRepeat mixer asked for exactly
// `duration` wrap to time 0? Raw source pelvis Z, no normalization, no target rig.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveSkyrimSourceNodes, SKYRIM_BONE_RETARGETS } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const rel = process.argv[2] || 'assets/skyrim/guard/converted/shd_blockhit.source.glb';

const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
const scene = gltf.scene;
const res = resolveSkyrimSourceNodes(scene, SKYRIM_BONE_RETARGETS.filter(b => ['root','pelvis','head'].includes(b.id)));
if (!res.valid) throw new Error('missing ' + res.missing.join(','));
const pelvis = res.nodes.pelvis;
const rootNode = res.nodes.root;
console.log(`file ${rel}`);
console.log(`resolved pelvis node = "${pelvis.name}"   root node = "${rootNode.name}"`);
// how many candidates named like NPC_Root_Root exist?
const roots = []; scene.traverse(o => { if (/NPC_Root/.test(o.name)) roots.push(o.name); });
console.log(`nodes matching /NPC_Root/: ${JSON.stringify(roots)}`);

const clip = gltf.animations[0];
const d = clip.duration;
console.log(`clip "${clip.name}" duration ${d}`);

function probe(loopMode, clamp) {
  const mixer = new THREE.AnimationMixer(scene);
  const a = mixer.clipAction(clip);
  if (loopMode !== null) { a.setLoop(loopMode, 1); a.clampWhenFinished = clamp; }
  a.play();
  console.log(`\n--- action.loop = ${a.loop}  clampWhenFinished = ${a.clampWhenFinished} ---`);
  for (const t of [0, d/2, d - 1e-4, d - 1e-6, d, d + 1e-6]) {
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    const p = pelvis.getWorldPosition(new THREE.Vector3());
    console.log(`  t=${t.toFixed(9).padStart(12)}  pelvis world  x=${p.x.toFixed(5)} y=${p.y.toFixed(5)} z=${p.z.toFixed(5)}   action.time=${a.time.toFixed(9)}`);
  }
}
probe(null, false);               // whatever the default is
probe(THREE.LoopOnce, true);      // the fix
console.log(`\nTHREE.LoopOnce=${THREE.LoopOnce} LoopRepeat=${THREE.LoopRepeat} LoopPingPong=${THREE.LoopPingPong}`);
