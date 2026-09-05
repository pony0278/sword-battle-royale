// Experiment: the direction constraint that G2.4.3 built for the arms, wired to the legs.
// Does it (a) remove the constant leg angular error, (b) fix the foot's height divergence?
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { SKYRIM_BONE_RETARGETS, resolveSkyrimSourceNodes, retargetSkyrimClip } from '../src/animation/skyrim-animation-retarget.js';
import { parseSourceGlb } from '../build/skyrim-grip-reach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = { ...ThreeModule, GLTFLoader };
const GROUND = ['foot.l', 'toes.l', 'foot.r', 'toes.r'];
const JR = 0.045;

// Same table, but the leg chain gets the direction constraint the arm chain already has.
const LEGS_CONSTRAINED = SKYRIM_BONE_RETARGETS.map((e) => {
  if (e.id === 'upperleg.l') return { ...e, directionEndId: 'lowerleg.l', directionTargetChild: 'lowerleg.l' };
  if (e.id === 'lowerleg.l') return { ...e, directionEndId: 'foot.l', directionTargetChild: 'foot.l' };
  if (e.id === 'foot.l') return { ...e, directionEndId: 'toes.l', directionTargetChild: 'toes.l' };
  if (e.id === 'upperleg.r') return { ...e, directionEndId: 'lowerleg.r', directionTargetChild: 'lowerleg.r' };
  if (e.id === 'lowerleg.r') return { ...e, directionEndId: 'foot.r', directionTargetChild: 'foot.r' };
  if (e.id === 'foot.r') return { ...e, directionEndId: 'toes.r', directionTargetChild: 'toes.r' };
  return e;
});

const CLIPS = [
  'assets/skyrim/guard/converted/shd_blockidle.source.glb',
  'assets/skyrim/guard/converted/shd_blockhit.source.glb',
  'assets/skyrim/guard/converted/shd_blockbash.source.glb',
  'assets/skyrim/guard/converted/shd_blockbashpower.source.glb',
  'assets/skyrim/greatsword/converted/2hm_idle.source.glb',
];
const SEGS = [
  ['leg.l.upper', ['upperleg.l', 'lowerleg.l'], ['upperleg.l', 'lowerleg.l']],
  ['leg.l.lower', ['lowerleg.l', 'foot.l'], ['lowerleg.l', 'foot.l']],
  ['leg.l.foot', ['foot.l', 'toes.l'], ['foot.l', 'toes.l']],
];

async function run(SOURCE, table) {
  const gltf = await parseSourceGlb(THREE, await readFile(path.join(ROOT, SOURCE)));
  const ch = createDefaultCharacter(THREE);
  const clip = retargetSkyrimClip(THREE, { root: gltf.scene, clip: gltf.animations[0] }, ch.rig,
    { fps: 30, clipId: 'X/x', boneRetargets: table });
  ch.registerAnimations([clip]);
  const rep = resolveSkyrimSourceNodes(gltf.scene, table);
  const basis = new THREE.Quaternion().fromArray(clip.userData.basisCalibration.quaternion).normalize();
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const act = mixer.clipAction(gltf.animations[0]).reset();
  act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();

  // rest reference
  ch.object3d.updateMatrixWorld(true);
  const rootY0 = ch.rig.bones.root.getWorldPosition(new THREE.Vector3()).y;
  const headY0 = ch.rig.bones.head.getWorldPosition(new THREE.Vector3()).y;
  const stat = headY0 - rootY0;
  const restGround = Math.min(...GROUND.map((g) => ch.rig.bones[g].getWorldPosition(new THREE.Vector3()).y)) - JR;

  let worstAng = Object.fromEntries(SEGS.map(([id]) => [id, 0]));
  let minGround = Infinity;
  for (let i = 0; i <= 200; i += 1) {
    const t = clip.duration * (i / 200) * 0.998;
    mixer.setTime(t); gltf.scene.updateMatrixWorld(true);
    ch.sampleAnimation(clip.name, t, { loop: false, inPlace: true });
    ch.object3d.updateMatrixWorld(true);
    for (const [id, s, tg] of SEGS) {
      const a = rep.nodes[s[0]].getWorldPosition(new THREE.Vector3());
      const b = rep.nodes[s[1]].getWorldPosition(new THREE.Vector3());
      const c = ch.rig.bones[tg[0]].getWorldPosition(new THREE.Vector3());
      const d = ch.rig.bones[tg[1]].getWorldPosition(new THREE.Vector3());
      const ang = THREE.MathUtils.radToDeg(b.clone().sub(a).applyQuaternion(basis).normalize()
        .angleTo(d.clone().sub(c).normalize()));
      if (ang > worstAng[id]) worstAng[id] = ang;
    }
    minGround = Math.min(minGround, Math.min(...GROUND.map((g) => ch.rig.bones[g].getWorldPosition(new THREE.Vector3()).y)) - JR);
  }
  return { worstAng, below: minGround - restGround, stat };
}

console.log('clip'.padEnd(20), 'variant'.padEnd(18), 'leg.upper'.padStart(10), 'leg.lower'.padStart(10), 'leg.foot'.padStart(9), 'foot under floor'.padStart(17));
for (const c of CLIPS) {
  for (const [label, table] of [['SHIPPED', SKYRIM_BONE_RETARGETS], ['legs constrained', LEGS_CONSTRAINED]]) {
    const r = await run(c, table);
    console.log(path.basename(c, '.source.glb').padEnd(20), label.padEnd(18),
      r.worstAng['leg.l.upper'].toFixed(2).padStart(10),
      r.worstAng['leg.l.lower'].toFixed(2).padStart(10),
      r.worstAng['leg.l.foot'].toFixed(2).padStart(9),
      `${r.below.toFixed(4)} (${(r.below / r.stat * 100).toFixed(2)}%)`.padStart(17));
  }
}
