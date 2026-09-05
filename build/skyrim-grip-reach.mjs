// The Skyrim-clip grip measurement, shared by the report and the test so they cannot disagree.
//
// build/grip-reach.mjs is the same idea for an authored pose. This one takes a converted source
// pack through the production bridge instead: retarget onto the procedural KayKit rig, mount the
// weapon the way the game mounts it, sample, and measure HAND_L against the weapon's SECONDARY_GRIP.
//
// TWO CORRECTIONS ARE BAKED IN HERE, because the first version of this file got both wrong and its
// numbers sent the work in the wrong direction.
//
// 1. THE MOUNT. src/game/bootstrap.js does not mount a Skyrim-driven fighter with the raw
//    DEFAULT_KAYKIT_SWORD_MOUNT; it composes that with the clip's own G2.4.5 weapon bind
//    correction. Measuring the raw mount describes a configuration that does not ship, and it also
//    turned the sword 112 degrees, which made the haft look 73 degrees wrong when it is 21.
//
// 2. THE REFERENCE POINTS. Skyrim's `Weapon` and `Shield` nodes are the two hands' EQUIPMENT
//    points - exactly what handslot.r and handslot.l are on this rig, and what PRIMARY_GRIP and
//    SECONDARY_GRIP must line up with. `NPC L Hand [LHnd]` is the WRIST, one palm short of the
//    grip. Comparing source wrists against target sockets is comparing two different things, and
//    it is what produced the "the retarget doubles the hand separation" claim. Measured like for
//    like, the wrist span survives the retarget almost exactly; it is the EQUIPMENT span that does
//    not, because this rig hangs its sockets more than twice as far off the wrist as Skyrim does.
//
// So both spans are reported, separately and named.
//
// Everything is injected so this runs headless and so a caller can point it at any pack or weapon.

// GLTFLoader sanitizes names on the way in: "NPC L Hand [LHnd]" arrives as NPC_L_Hand_LHnd.
const SOURCE_NODES = Object.freeze({
  offWrist: 'NPC_L_Hand_LHnd',
  mainWrist: 'NPC_R_Hand_RHnd',
  offEquipment: 'Shield',
  mainEquipment: 'Weapon',
  head: 'NPC_Head_Head',
  root: 'NPC_Root_Root',
});

export function parseSourceGlb(THREE, bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
}

// What the animator authored, read straight out of the source hierarchy at t=0. Every distance is
// divided by the source's own head-to-root height, which is the only way two skeletons at different
// scales can be compared at all.
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
  const offWrist = at(SOURCE_NODES.offWrist);
  const mainWrist = at(SOURCE_NODES.mainWrist);
  const offEquipment = at(SOURCE_NODES.offEquipment);
  const mainEquipment = at(SOURCE_NODES.mainEquipment);
  const stature = at(SOURCE_NODES.head).distanceTo(at(SOURCE_NODES.root));
  return {
    stature,
    // Wrist to wrist: a property of the POSE, and what a rotation retarget should preserve.
    wristSpan: offWrist.distanceTo(mainWrist) / stature,
    // Equipment point to equipment point: a property of the GRIP, and what the two sockets and the
    // weapon's two grip nodes have to reproduce between them.
    equipmentSpan: offEquipment.distanceTo(mainEquipment) / stature,
    // How far each equipment point sits off its own wrist. This rig's is 0.1445 on both sides.
    offHandSocketOffset: offEquipment.distanceTo(offWrist) / stature,
    mainHandSocketOffset: mainEquipment.distanceTo(mainWrist) / stature,
  };
}

export function measureSkyrimGripReach(THREE, {
  gltf, definition, mount, entry, samples = 30,
  createDefaultCharacter, createDebugSword, mountDebugSword, retargetConvertedSkyrimGltf,
  composeSkyrimWeaponMountCalibration,
}) {
  const character = createDefaultCharacter(THREE);
  const clip = retargetConvertedSkyrimGltf(THREE, gltf, character.rig, entry, { fps: 30 });
  character.registerAnimations([clip]);

  // The mount the game uses, not the one the rig ships as a default.
  const bind = clip.userData?.weaponBindCalibration;
  if (!bind?.correctionQuaternion) throw new Error(`${entry.clipId} carries no weapon bind calibration`);
  const calibratedMount = composeSkyrimWeaponMountCalibration(THREE, mount, bind);

  const weapon = createDebugSword(THREE, { definition });
  mountDebugSword(character, weapon, calibratedMount);

  const bones = character.rig.bones;
  const hand = new THREE.Vector3();
  const mainHand = new THREE.Vector3();
  const grip = new THREE.Vector3();
  const offWrist = new THREE.Vector3();
  const mainWrist = new THREE.Vector3();
  const head = new THREE.Vector3();
  const root = new THREE.Vector3();
  const sampleAt = (seconds) => {
    character.sampleAnimation(clip.name, seconds);
    character.object3d.updateMatrixWorld(true);
    weapon.update();
    character.sockets.HAND_L.getWorldPosition(hand);
    character.sockets.HAND_R.getWorldPosition(mainHand);
    weapon.sockets.SECONDARY_GRIP.getWorldPosition(grip);
    bones['wrist.l'].getWorldPosition(offWrist);
    bones['wrist.r'].getWorldPosition(mainWrist);
  };

  // The character's own height, measured BEFORE the weapon is mounted. A greatsword is longer than
  // the fighter is tall, so a bounding box taken afterwards is the sword's box, and every gap read
  // as a percentage of it comes out flatteringly small.
  character.sampleAnimation(clip.name, 0);
  character.object3d.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(character.object3d);
  const height = box.max.y - box.min.y;

  sampleAt(0);
  bones.head.getWorldPosition(head);
  bones.root.getWorldPosition(root);
  const stature = head.distanceTo(root);
  const secondaryGripFromMainHand = mainHand.distanceTo(grip);
  const socketOffset = offWrist.distanceTo(hand) / stature;

  const duration = character.getAnimationDuration(clip.name);
  const gaps = [];
  for (let step = 0; step <= samples; step += 1) {
    const seconds = (duration * step) / samples;
    sampleAt(seconds);
    gaps.push({
      seconds,
      gap: hand.distanceTo(grip),
      wristSpan: offWrist.distanceTo(mainWrist) / stature,
      equipmentSpan: hand.distanceTo(mainHand) / stature,
    });
  }

  return {
    clipName: clip.name,
    duration,
    height,
    stature,
    calibratedMount,
    bindCorrectionDegrees: bind.correctionAngleDegrees,
    secondaryGripFromMainHand,
    socketOffset,
    source: measureSourceProportions(THREE, gltf),
    gaps,
    best: Math.min(...gaps.map((entryGap) => entryGap.gap)),
    worst: Math.max(...gaps.map((entryGap) => entryGap.gap)),
    wristSpan: gaps[0].wristSpan,
    equipmentSpan: gaps[0].equipmentSpan,
  };
}
