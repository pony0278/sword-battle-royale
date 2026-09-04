// The Skyrim-clip grip measurement, shared by the report and the test so they cannot disagree.
//
// build/grip-reach.mjs is the same idea for an authored pose. This one takes a converted source
// pack through the production bridge instead: retarget onto the procedural KayKit rig, mount the
// weapon on handslot.r exactly as the game does, sample, and measure HAND_L against the weapon's
// own SECONDARY_GRIP.
//
// It reports where the reach went as well as whether it arrived, because "FAIL" alone would send
// the next person to fix the clip, and on the greatsword the clip is the part that is right:
//
//   source        how far apart the hands are IN THE .glb, before any retarget, as a fraction of
//                 the source's own head-to-root height. Ground truth: what the animator authored.
//   retargeted    the same fraction after retargeting. Rotation-only retargeting does not preserve
//                 reach across different limb proportions, so this is where a hold gets lost.
//   offHandToWeapon
//                 where the source puts the off hand relative to its WEAPON node - which is where
//                 SECONDARY_GRIP ought to be, and is not.
//
// Everything is injected so this runs headless and so a caller can point it at any pack or weapon.

// GLTFLoader sanitizes names on the way in: "NPC L Hand [LHnd]" arrives as NPC_L_Hand_LHnd.
const SOURCE_NODES = Object.freeze({
  offHand: 'NPC_L_Hand_LHnd',
  mainHand: 'NPC_R_Hand_RHnd',
  head: 'NPC_Head_Head',
  root: 'NPC_Root_Root',
  weapon: 'Weapon',
});

export function parseSourceGlb(THREE, bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
}

// What the animator authored, read straight out of the source hierarchy at t=0.
export function measureSourceProportions(THREE, gltf) {
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  const at = (name) => {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`source hierarchy has no ${name}`);
    const position = new THREE.Vector3();
    node.getWorldPosition(position);
    return position;
  };
  const offHand = at(SOURCE_NODES.offHand);
  const mainHand = at(SOURCE_NODES.mainHand);
  const weapon = at(SOURCE_NODES.weapon);
  const stature = at(SOURCE_NODES.head).distanceTo(at(SOURCE_NODES.root));
  return {
    stature,
    handsApart: offHand.distanceTo(mainHand) / stature,
    offHandToWeapon: offHand.distanceTo(weapon) / stature,
    mainHandToWeapon: mainHand.distanceTo(weapon) / stature,
  };
}

export function measureSkyrimGripReach(THREE, {
  gltf, definition, mount, entry, samples = 30,
  createDefaultCharacter, createDebugSword, mountDebugSword, retargetConvertedSkyrimGltf,
}) {
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, entry, { fps: 30 });
  character.registerAnimations([clip]);

  // The character's own height, measured BEFORE the weapon is mounted. A greatsword is longer than
  // the fighter is tall, so a bounding box taken afterwards is the sword's box, and every gap read
  // as a percentage of it comes out flatteringly small.
  character.sampleAnimation(clip.name, 0);
  character.object3d.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(character.object3d);
  const height = box.max.y - box.min.y;

  const weapon = createDebugSword(THREE, { definition });
  mountDebugSword(character, weapon, mount);

  const hand = new THREE.Vector3();
  const mainHand = new THREE.Vector3();
  const grip = new THREE.Vector3();
  const head = new THREE.Vector3();
  const root = new THREE.Vector3();
  const sampleAt = (seconds) => {
    character.sampleAnimation(clip.name, seconds);
    character.object3d.updateMatrixWorld(true);
    weapon.update();
    character.sockets.HAND_L.getWorldPosition(hand);
    character.sockets.HAND_R.getWorldPosition(mainHand);
    weapon.sockets.SECONDARY_GRIP.getWorldPosition(grip);
  };

  sampleAt(0);
  character.sockets.HEAD.getWorldPosition(head);
  character.rig.bones.root.getWorldPosition(root);
  const stature = head.distanceTo(root);
  const secondaryGripFromMainHand = mainHand.distanceTo(grip);

  const duration = character.getAnimationDuration(clip.name);
  const gaps = [];
  for (let step = 0; step <= samples; step += 1) {
    const seconds = (duration * step) / samples;
    sampleAt(seconds);
    gaps.push({ seconds, gap: hand.distanceTo(grip), handsApart: hand.distanceTo(mainHand) / stature });
  }

  return {
    clipName: clip.name,
    duration,
    height,
    stature,
    secondaryGripFromMainHand,
    source: measureSourceProportions(THREE, gltf),
    gaps,
    best: Math.min(...gaps.map((entryGap) => entryGap.gap)),
    worst: Math.max(...gaps.map((entryGap) => entryGap.gap)),
    handsApart: gaps[0].handsApart,
  };
}
