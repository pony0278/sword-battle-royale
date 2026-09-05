// A1: is the SOURCE scene at rest when probe.mjs reads sp0 (i.e. AFTER retarget)?
// A2: which node does the resolver return for 'root', and is it animated?
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
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
];
const V = () => new THREE.Vector3();

for (const rel of CLIPS) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, rel)));
  const sroot = gltf.scene;
  // snapshot as-loaded local transforms of EVERY node
  const before = [];
  sroot.traverse(o => { if (o.position?.toArray) before.push([o, o.position.toArray(), o.quaternion.toArray()]); });

  // name census: how many nodes match /Root/ ?
  const rootish = [];
  sroot.traverse(o => { if (/root/i.test(o.name)) rootish.push(o.name); });

  const R = resolveSkyrimSourceNodes(sroot, SKYRIM_BONE_RETARGETS.filter(r=>['root','pelvis','head'].includes(r.id)));
  const rootNode = R.nodes.root;
  // which nodes does animations[0] actually drive?
  const tracked = new Set(gltf.animations[0].tracks.map(t => t.name.split('.')[0]));

  // AS-LOADED world positions
  sroot.updateMatrixWorld(true);
  const wBefore = { root: rootNode.getWorldPosition(V()), pelvis: R.nodes.pelvis.getWorldPosition(V()), head: R.nodes.head.getWorldPosition(V()) };

  // now do exactly what probe.mjs does: retarget FIRST
  const character = createDefaultCharacter(THREE);
  retargetConvertedSkyrimGltf(THREE, gltf, character.rig,
    { id:'p', file:path.basename(rel), clipId:'SKYRIM_SOURCE/p', role:'measurement' }, { fps: 30 });

  sroot.updateMatrixWorld(true);
  const wAfter = { root: rootNode.getWorldPosition(V()), pelvis: R.nodes.pelvis.getWorldPosition(V()), head: R.nodes.head.getWorldPosition(V()) };

  let maxPos = 0, maxRot = 0, worstName = '';
  for (const [o, p, q] of before) {
    const dp = o.position.distanceTo(new THREE.Vector3().fromArray(p));
    const dq = new THREE.Quaternion().fromArray(q).angleTo(o.quaternion) * 180/Math.PI;
    if (dp > maxPos) { maxPos = dp; }
    if (dq > maxRot) { maxRot = dq; worstName = o.name; }
  }
  console.log(`\n=== ${path.basename(rel)}`);
  console.log(`  root-ish node names: ${JSON.stringify(rootish)}`);
  console.log(`  resolver picked root = "${rootNode.name}"  uuid ${rootNode.uuid.slice(0,8)}  parent "${rootNode.parent?.name}"`);
  console.log(`  animation tracks drive ${tracked.size} nodes; root driven? ${tracked.has(rootNode.name)}  pelvis driven? ${tracked.has(R.nodes.pelvis.name)}`);
  console.log(`  animations in file: ${gltf.animations.length}  names ${JSON.stringify(gltf.animations.map(a=>a.name))}`);
  console.log(`  post-retarget local drift: max |dpos| ${maxPos.toExponential(3)}  max |drot| ${maxRot.toFixed(6)} deg (worst "${worstName}")`);
  console.log(`  world root  before ${wBefore.root.toArray().map(v=>v.toFixed(4))}  after ${wAfter.root.toArray().map(v=>v.toFixed(4))}`);
  console.log(`  world pelvis before ${wBefore.pelvis.toArray().map(v=>v.toFixed(4))}  after ${wAfter.pelvis.toArray().map(v=>v.toFixed(4))}`);
  console.log(`  world head   before ${wBefore.head.toArray().map(v=>v.toFixed(4))}  after ${wAfter.head.toArray().map(v=>v.toFixed(4))}`);
}
