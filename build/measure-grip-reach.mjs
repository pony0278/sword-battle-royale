// Does the off hand actually reach the hilt?
//
// A two-handed grip in this repository is an open-loop pose - seven authored left-arm angles blended
// over whatever the right arm is doing (src/animation/two-hand-grip.js). Nothing in that pose knows
// where a hilt is, so whether the hand lands on one is a question to MEASURE, not to assume, and
// this is the measurement: for each phase of a swing, the distance from the character's HAND_L
// socket to the weapon's own secondary_grip node.
//
// It runs headless - the rig is procedural bones and the weapon is a mount plus a node tree, so
// neither needs a canvas. Point it at a candidate two-handed animation pack when one arrives: the
// number below is what decides whether the clip is holding the sword or waving beside it.
import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDefaultCharacter } from '../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../src/character/default-character-mount.js';
import { V3_LONGSWORD_DEFINITION } from '../src/character/procedural-v3-weapon.js';
import { V3_GREATSWORD_DEFINITION } from '../src/character/v3-greatsword-weapon.js';
import { bakeAdvancingVerticalChopClip } from '../src/animation/whole-body-motion-solver.js';
import { TWO_HAND_GRIP_REACH_TOLERANCE, measureGripReach } from './grip-reach.mjs';

const THREE = { ...ThreeModule, GLTFLoader };
const twoHanded = bakeAdvancingVerticalChopClip({ twoHandGrip: true });
const oneHanded = bakeAdvancingVerticalChopClip({ twoHandGrip: false });
const PHASES = ['ready', 'windup', 'commit', 'plant', 'impact', 'follow_through', 'recover'];

// The scale everything below should be read against, measured rather than assumed.
const reference = createDefaultCharacter(THREE);
reference.applyPose(twoHanded.poses.ready);
reference.object3d.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(reference.object3d);
const height = box.max.y - box.min.y;
const handL = new THREE.Vector3();
const handR = new THREE.Vector3();
reference.sockets.HAND_L.getWorldPosition(handL);
reference.sockets.HAND_R.getWorldPosition(handR);

console.log(`character height ${height.toFixed(4)} · hands apart at rest ${handL.distanceTo(handR).toFixed(4)}`);
console.log(`a grip counts as reached at <= ${TWO_HAND_GRIP_REACH_TOLERANCE} (see build/grip-reach.mjs)\n`);

let worst = 0;
for (const [definition, label] of [[V3_LONGSWORD_DEFINITION, 'longsword'], [V3_GREATSWORD_DEFINITION, 'greatsword']]) {
  console.log(`${label}`);
  console.log('  phase            one-handed   two-handed   closed    reached');
  for (const phase of PHASES) {
    const off = measureGripReach(THREE, { definition, pose: oneHanded.poses[phase], createDefaultCharacter, createDebugSword, mountDebugSword, mount: DEFAULT_KAYKIT_SWORD_MOUNT });
    const on = measureGripReach(THREE, { definition, pose: twoHanded.poses[phase], createDefaultCharacter, createDebugSword, mountDebugSword, mount: DEFAULT_KAYKIT_SWORD_MOUNT });
    worst = Math.max(worst, on);
    const reached = on <= TWO_HAND_GRIP_REACH_TOLERANCE;
    console.log(`  ${phase.padEnd(16)} ${off.toFixed(4)}       ${on.toFixed(4)}      ${(off - on).toFixed(4).padStart(8)}   ${reached ? 'yes' : 'NO'}`);
  }
  console.log('');
}

if (worst > TWO_HAND_GRIP_REACH_TOLERANCE) {
  console.log(`FAIL · the off hand never reaches the hilt. Worst gap ${worst.toFixed(4)}, or ${(worst / height * 100).toFixed(0)}% of the character's height.`);
  console.log('The authored left arm leans toward the weapon and then diverges from it; it is not a grip.');
  process.exit(1);
}
console.log(`PASS · every phase puts the off hand on the hilt. Worst gap ${worst.toFixed(4)}.`);
