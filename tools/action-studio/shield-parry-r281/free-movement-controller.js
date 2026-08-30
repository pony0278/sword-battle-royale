import { createLockOnRuntime } from '../../../src/combat/lock-on.js';
import { LANE_LOCOMOTION_PROFILE } from '../../../src/combat/lane-locomotion.js';
import { THIRD_PERSON_CAMERA_PROFILE } from '../../../src/combat/third-person-camera.js';
import { planSprint } from '../../../src/combat/sprint-locomotion.js';

export const FREE_MOVEMENT_STAGE = 'R20S.3';
// The one opponent this lab has. A battle royale will hand a list; the selection rule does not
// change, and neither does anything below it.
const LAB_TARGET_ID = 'attacker';

// R20S.3 — moving in two dimensions, and choosing who you are fighting.
//
// Locked and free are the same movement in different frames. Locked, forward is the line to your
// target, so the strafe keys orbit them - the lane behaviour every coverage band was measured
// under, now expressed in world coordinates instead of two scalars. Free, forward is where you are
// looking, and you turn toward wherever you are going.
//
// Facing has exactly one owner at a time, decided here:
//   locked   -> the ledger derives it from the gap (owned facing cleared). Bit for bit what the
//               lane did before this file existed, which is what keeps the golden grid honest.
//   unlocked -> the ledger is told where you face, and the same base-facing integrator gives that
//               turn its inertia. Nobody gets a second, faster way to turn.
// The guard's own facing turn (R19Q.1) rides on top in both, unchanged - it is an offset, not a
// facing, and it was never in competition with this.
//
// Defence when unlocked is deliberately NOT special-cased. The guard keeps working; it simply
// covers what it covers, and the measured reliable cone (-20..+150 degrees, LEFT setting the tight
// edge) is what decides whether the shield is where the blade is. Turning your back on someone is
// already answered by geometry, and a rule saying so would be a second, weaker copy of it.
export function createFreeMovementController({
  laneController,
  lockOn = createLockOnRuntime(),
  profile = THIRD_PERSON_CAMERA_PROFILE,
  // What the sprint has to ask about before it is allowed to run. Defaults say no, so a caller
  // that forgets to wire the state gets a fighter who cannot sprint rather than one who sprints
  // through their own guard.
  readGuardActive = () => true,
  readAttacking = () => true,
} = {}) {
  if (!laneController?.report) throw new Error(`${FREE_MOVEMENT_STAGE} needs the lane controller`);
  // Where the camera looks when nothing is locked. It has to be state of its own, and finding that
  // out cost a bug worth recording: the first version used the fighter's own facing as the movement
  // frame while movement set the facing, so "right" turned as you walked and a strafe curved into a
  // circle - 1.2cm of travel in a second of holding a key. The frame you move in cannot be the
  // thing your movement steers.
  let freeYawRadians = Math.PI;
  let sprintRequested = false;
  let guardWasActive = false;
  let sprintReport = planSprint({});
  const lookSensitivity = Number(profile?.free?.mouseSensitivityRadiansPerPixel) || 0.0032;

  function candidates() {
    const ground = laneController.report;
    return [{ id: LAB_TARGET_ID, position: ground.attackerPosition }];
  }

  function selfPosition() { return laneController.report.defenderPosition; }

  // Which way "forward" points. Locked it is the line to your target - the bearing the ledger
  // reports as a geometric fact - and free it is your own facing.
  function forwardRadians() {
    const ground = laneController.report;
    return lockOn.report.locked
      ? (ground.defenderBearingRadians ?? ground.defenderFacingRadians ?? Math.PI)
      : freeYawRadians;
  }

  return Object.freeze({
    get lockReport() { return lockOn.report; },
    get freeYawRadians() { return freeYawRadians; },
    setSprintRequested(requested) { sprintRequested = requested === true; return sprintRequested; },
    get sprintReport() { return sprintReport; },
    // Mouse look, in free mode only - locked, the camera is following the person you chose and
    // taking it off them by hand is the thing locking exists to stop.
    look(deltaPixels) {
      if (lockOn.report.locked) return freeYawRadians;
      freeYawRadians -= (Number(deltaPixels) || 0) * lookSensitivity;
      return freeYawRadians;
    },
    get locked() { return lockOn.report.locked; },
    get targetPosition() { return lockOn.report.locked ? laneController.report.attackerPosition : null; },
    forwardRadians,

    // Tab. Manual, and a second press only ever releases - a toggle that sometimes re-aims is a
    // toggle you cannot trust. The cone comes from the viewport being rendered, so what counts as
    // "in front of me" is what is on the player's screen.
    requestToggle(view) {
      const report = lockOn.requestToggle({
        self: selfPosition(), viewForwardRadians: forwardRadians(), candidates: candidates(), view,
      });
      // Letting go hands the view back to the player pointed where they were already looking, so
      // releasing a lock is not also a camera cut.
      if (!report.locked) {
        const ground = laneController.report;
        freeYawRadians = ground.defenderBearingRadians ?? freeYawRadians;
        laneController.setDefenderFacing(freeYawRadians);
      }
      return report;
    },

    // Per frame, before movement: a lock breaks on distance or on the target disappearing, never on
    // where anybody is looking.
    update() {
      // R20V.2: the guard-raise edge pins the body where it is pointed, explicitly. Leaving it
      // alone is not the same thing - a fighter who has not moved since the lock dropped still has
      // NO owned facing, so their body would quietly keep tracking the opponent and they would get
      // the lock's aim for free. Whether your shield auto-aims must not depend on whether you
      // happened to walk somewhere first.
      const guardActive = readGuardActive() === true;
      if (guardActive && !guardWasActive && !lockOn.report.locked) {
        const ground = laneController.report;
        laneController.setDefenderFacing(laneController.defenderBaseFacingRadians
          ?? ground.defenderFacingRadians ?? ground.defenderBearingRadians ?? 0);
      }
      guardWasActive = guardActive;
      return lockOn.update({
        self: selfPosition(), viewForwardRadians: forwardRadians(), candidates: candidates(),
      });
    },

    // Per frame, after update. Intent is {forward, lateral} in -1..1; the frame it is spent in is
    // decided by the lock, and the metres come from the same measured locomotion profile the lane
    // has always used.
    move(deltaSeconds, intent = {}) {
      const forwardInput = Math.sign(Number(intent.forward) || 0);
      const lateralInput = Math.sign(Number(intent.lateral) || 0);
      const axis = forwardRadians();
      if (forwardInput === 0 && lateralInput === 0) {
        sprintReport = planSprint({ requested: sprintRequested, forwardInput: 0, lateralInput: 0 });
        // Standing still still owns your facing: locked hands it back to the geometry, free keeps
        // whatever you last turned to.
        if (lockOn.report.locked) laneController.setDefenderFacing(null);
        return null;
      }
      // R20U.1: running. Refused while locked, guarding, swinging or dodging, and forward only -
      // in free mode you face where you are going, so fleeing is turning round and running.
      sprintReport = planSprint({
        requested: sprintRequested,
        locked: lockOn.report.locked,
        guardActive: readGuardActive() === true,
        attacking: readAttacking() === true,
        dodging: laneController.dodgeReport?.dodging === true,
        forwardInput,
        lateralInput,
      });
      // Diagonals are not faster. Scaling the intent to unit length first is the fix for a
      // straight-line-versus-diagonal gap that measured 1.46x - two axes added at full speed each.
      const magnitude = Math.hypot(forwardInput, lateralInput) || 1;
      const forwardShare = forwardInput / magnitude;
      const lateralShare = lateralInput / magnitude;
      // Which speeds apply is decided by who owns the facing, which is the honest version of the
      // rule and the reason all three of these were wrong together. LOCKED: the gap owns facing, so
      // a backpedal is a real backpedal and the walk profile's three speeds mean what they say.
      // FREE: the body turns to face wherever it is going, so there is only one speed - every
      // direction is forward once the turn finishes, and the turn is visible at 180 deg/s.
      const forwardSpeed = sprintReport.sprinting
        ? sprintReport.speedMps
        : LANE_LOCOMOTION_PROFILE.forwardSpeedMps;
      const forwardMeters = forwardShare * (lockOn.report.locked
        ? (forwardInput >= 0 ? LANE_LOCOMOTION_PROFILE.forwardSpeedMps : LANE_LOCOMOTION_PROFILE.backwardSpeedMps)
        : forwardSpeed) * deltaSeconds;
      const lateralMeters = lateralShare * (lockOn.report.locked
        ? LANE_LOCOMOTION_PROFILE.lateralSpeedMps
        : forwardSpeed) * deltaSeconds;
      const dx = Math.sin(axis) * forwardMeters - Math.cos(axis) * lateralMeters;
      const dz = Math.cos(axis) * forwardMeters + Math.sin(axis) * lateralMeters;
      // Free: you face where you are going. Locked: the gap decides, as it always has.
      //
      // R20V.2 (option D): unless the guard is up. A raised shield pins the body - you are braced,
      // not running - so the feet stop steering the facing and a defender can strafe, back off or
      // circle without turning their own shield away from the fight. Aim first, then guard. It
      // needs nothing re-measured because facing simply stops changing, and it is the same shape
      // as the rule sprint already has: a raised guard refuses to run, and now it refuses to turn.
      if (lockOn.report.locked) laneController.setDefenderFacing(null);
      else if ((dx !== 0 || dz !== 0) && readGuardActive() !== true) laneController.setDefenderFacing(Math.atan2(dx, dz));
      return laneController.moveDefenderWorld(dx, dz);
    },

    release() { return lockOn.release(); },
  });
}
