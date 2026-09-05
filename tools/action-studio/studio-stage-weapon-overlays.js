// Everything that writes the stage weapon or the arm holding it, in the one order that is correct.
//
// Two overlays run each frame after the weapon has followed the hand, and they are NOT independent:
//
//   1. the game mount   moves the blade to the angle src/game/bootstrap.js would hold it at
//   2. the off-hand IK  puts the off hand on the blade's SECONDARY_GRIP
//
// (2) aims at a socket that (1) moves. Run them the other way round and the off hand solves against
// a blade that is about to turn 112 degrees under it. That ordering lived implicitly in the entry's
// tick() until this module existed; here it is a single statement with a reason attached.
//
// They are composed rather than merged: each is separately testable, and each has its own refusals.
import { createStudioGameMountPreview } from './studio-game-mount-preview.js';
import { createStudioOffHandGripController } from './studio-off-hand-grip-controls.js';

export function createStudioStageWeaponOverlays(THREE, context) {
  const gameMount = createStudioGameMountPreview(THREE, context);
  const offHandGrip = createStudioOffHandGripController(THREE, context);
  return {
    get appliedMount() { return gameMount.applied; },
    get lastGripSolve() { return offHandGrip.lastSolve; },
    update() {
      gameMount.update();
      offHandGrip.update();
    },
    // The stage weapon selector builds a new sword: nothing that was on the old one is on this one,
    // and whether the off hand is free is a property of what is now held.
    syncToWeapon(weaponId) {
      gameMount.invalidate();
      offHandGrip.syncToWeapon(weaponId);
    },
    // For anything that reads the blade as geometry rather than as a picture - Bake Pose Keys
    // solves against its world grip and writes the answer into clip.poses.
    withBaseMount(run) {
      return gameMount.withBaseMount(run);
    },
  };
}
