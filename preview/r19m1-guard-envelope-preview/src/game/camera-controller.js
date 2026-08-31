import {
  createThirdPersonCameraRuntime,
  fitLockedProfileToAspect,
  solveFreeCameraPose,
  solveLockedCameraPose,
  THIRD_PERSON_CAMERA_PROFILE,
} from '../combat/third-person-camera.js';

// R20S.2 — the game's camera, in the combat lab, from the same solver and the same profile the
// camera lab tuned. Not a second camera: this file decides WHEN to solve, never WHERE to stand.
//
// It is safe to swap in because the camera is combat-inert, and that was measured rather than
// assumed: with the camera parked at the locked pose, three golden cells reproduced identically to
// six decimals (top@1.4, right@1.8, left@1.6 - blocked, clang, body, posture, relevance, startSep,
// settledSep, settledYaw all unchanged). The only thing reading the camera in the whole rig is the
// head billboard in kaykit-v3-line-appearance.
//
// The fit runs on construction and on resize, never per frame: how much the framing must give up is
// a function of the window's aspect alone, so a fight cannot change it and a moving camera cannot
// come from it.
export function createShieldParryCameraController({
  camera,
  profile = THIRD_PERSON_CAMERA_PROFILE,
  prefer = 'crop',
  aspectRatio = 16 / 9,
}) {
  if (!camera) throw new Error('R20S.2 camera controller needs the scene camera');
  const runtime = createThirdPersonCameraRuntime({ profile });
  let fitted = null;
  let lastAspect = null;
  // The last pose actually written to the camera. Kept because "which way is right" is a question
  // about the screen, and the screen is this pose - a probe that answers it from world axes is
  // answering a different question.
  let lastPose = null;

  function refit(nextAspect) {
    const aspect = Number.isFinite(Number(nextAspect)) && Number(nextAspect) > 0 ? Number(nextAspect) : aspectRatio;
    if (lastAspect != null && Math.abs(aspect - lastAspect) < 1e-6) return fitted;
    lastAspect = aspect;
    fitted = fitLockedProfileToAspect(profile, aspect, { prefer });
    return fitted;
  }
  refit(aspectRatio);

  return Object.freeze({
    refit,
    get fit() { return fitted; },
    // One frame. Locked, the axis is the line to whoever the player chose; free, it is their own
    // yaw. Either way the pose is solved elsewhere and smoothed by the shared runtime, and only the
    // last two lines here touch Three.js.
    update({ player, target, locked, yawRadians = 0, pitchDegrees, deltaSeconds = 1 / 60, aspectRatio: liveAspect }) {
      if (liveAspect != null) refit(liveAspect);
      const active = fitted?.profile || profile;
      const desired = locked && target
        ? solveLockedCameraPose({ player, target, profile: active, fallbackAxisRadians: yawRadians })
        : solveFreeCameraPose({ player, yawRadians, pitchDegrees, profile: active });
      if (!desired) return null;
      const pose = runtime.update(desired, deltaSeconds);
      lastPose = pose;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
      if (Math.abs(camera.fov - pose.fovDegrees) > 1e-4) {
        camera.fov = pose.fovDegrees;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(true);
      return pose;
    },
    // A cut rather than a swoop: used when the fight is reset, or the player takes a lock and the
    // axis jumps. Easing in from wherever the camera was left is a move nobody asked for.
    snap() { runtime.reset(); },
    get pose() { return lastPose; },
  });
}
