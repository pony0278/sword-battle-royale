import { createShieldParryCameraController } from './camera-controller.js';
import { createFreeMovementController } from './free-movement-controller.js';

export const PLAYER_CONTROLLER_STAGE = 'R20S.3';

// R20S.3 — everything the person holding the controller drives: where they move, who they have
// decided to fight, and where the camera stands to show it. One composition rather than three
// entries in the frame loop, because the three are ordered with respect to each other and that
// ordering is the only interesting thing about them:
//
//   1. the lock is re-checked (it breaks on distance, never on where anyone is looking),
//   2. the feet spend the frame in whichever frame the lock decided,
//   3. the camera is solved from where that left everybody.
//
// Nothing here has combat authority. Movement goes through the ledger's own verbs, so every clamp
// that holds for a lane step holds for a world one; the camera is presentation, measured inert.
export function createShieldParryPlayerController({ camera, laneController, freeCamera, inspectionCamera = false }) {
  const cameraController = createShieldParryCameraController({ camera, aspectRatio: camera.aspect });
  const movement = createFreeMovementController({ laneController });
  let intent = Object.freeze({ forward: 0, lateral: 0 });

  return Object.freeze({
    setMoveIntent(next = {}) {
      intent = Object.freeze({ forward: Math.sign(Number(next.forward) || 0), lateral: Math.sign(Number(next.lateral) || 0) });
      return intent;
    },
    get moveIntent() { return intent; },
    // Tab. The cone is derived from the viewport actually being rendered, so "in front of me" is
    // what is on this player's screen rather than a constant that disagrees with it.
    toggleLock() {
      const report = movement.requestToggle({ fovDegrees: camera.fov, aspectRatio: camera.aspect });
      // A taken or dropped lock swings the axis; easing across that is a swoop nobody asked for.
      cameraController.snap();
      return report;
    },
    // One pixel of drag, in free mode. Locked it is refused, which is the point of locking.
    look(deltaPixels) { return movement.look(deltaPixels); },
    get lockReport() { return movement.lockReport; },
    get locked() { return movement.locked; },
    frame(deltaSeconds) {
      movement.update();
      movement.move(deltaSeconds, intent);
      if (inspectionCamera) { freeCamera?.update?.(deltaSeconds); return null; }
      const ground = laneController.report;
      return cameraController.update({
        player: ground.defenderPosition,
        target: movement.targetPosition ?? ground.attackerPosition,
        locked: movement.locked,
        yawRadians: movement.forwardRadians(),
        deltaSeconds,
        aspectRatio: camera.aspect,
      });
    },
    snapCamera() { cameraController.snap(); },
    get cameraFit() { return cameraController.fit; },
  });
}
