import { CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS } from './close-range-guard-hold.js';

export const THIRD_PERSON_CAMERA_STAGE = 'R20Q.1';

// R20Q.1 - where the camera stands, as a pose solved from numbers rather than a camera written
// twice. The combat lab and the camera lab import this same file, so a value tuned in one is the
// value the other uses; the alternative is two cameras that drift apart and an argument about
// which one is the game.
//
// THESE NUMBERS ARE SEEDS, NOT MEASUREMENTS. Everything else in this project carries a value
// somebody measured and a note saying how. Camera framing is not that kind of question - it is
// judged by eye, on a real swing, by the person whose game it is - so the honest thing is to say
// so and hand them a tuning surface. camera-lab.html is that surface, and what it prints is meant
// to replace what is written here.
//
// The seven that describe a pose, and what each one means here:
//   fovDegrees   vertical field of view. The lock-on's frontal cone is derived from it, because
//                "in front of me" should mean "on the screen" rather than a constant that happens
//                to disagree with what is being rendered.
//   angleDegrees how far above the look point the camera sits, measured down from the horizon.
//   distanceMeters  how far back, along the ground.
//   lookHeightMeters  the height of the point being looked at.
//   azimuthDegrees  swing around the look point; 0 is directly behind the player, on the line to
//                their target. Non-zero puts the camera off that axis on purpose.
//   panX / panZ  where the look point sits relative to the player: panZ slides it toward the
//                target (which is how both fighters get into frame at all), panX to the side
//                (the over-the-shoulder offset).
//
// Why three distance keys rather than one pose: the lock band runs from the 1.1m contact floor to
// the 5.0m break, and a framing that reads well nose-to-nose has the pair as two dots at 4m. The
// solver interpolates between whichever keys the current separation falls between and holds the
// end keys outside the range.
export const THIRD_PERSON_CAMERA_PROFILE = Object.freeze({
  stage: THIRD_PERSON_CAMERA_STAGE,
  provenance: 'seed-values-awaiting-camera-lab-tuning',
  locked: Object.freeze({
    distanceKeys: Object.freeze([
      // Distance and panZ here are not taste: they are the nearest camera that still holds both
      // full silhouettes inside a 16:9 frame with a tenth of a half-frame to spare, found by
      // sweeping evaluateFraming below with the look point 40% of the way to the opponent. The
      // angle, height, fov and panX ARE taste, and are the first things worth arguing with.
      Object.freeze({ separationMeters: 1.4, fovDegrees: 50, angleDegrees: 16, distanceMeters: 3.9, lookHeightMeters: 1.25, azimuthDegrees: 0, panX: 0.35, panZ: 0.55 }),
      Object.freeze({ separationMeters: 2.4, fovDegrees: 50, angleDegrees: 18, distanceMeters: 4.65, lookHeightMeters: 1.3, azimuthDegrees: 0, panX: 0.35, panZ: 0.95 }),
      Object.freeze({ separationMeters: 4, fovDegrees: 50, angleDegrees: 20, distanceMeters: 5.9, lookHeightMeters: 1.35, azimuthDegrees: 0, panX: 0.3, panZ: 1.6 }),
    ]),
  }),
  free: Object.freeze({
    fovDegrees: 55,
    angleDegrees: 14,
    distanceMeters: 3.2,
    lookHeightMeters: 1.35,
    azimuthDegrees: 0,
    panX: 0.3,
    panZ: 0,
    mouseSensitivityRadiansPerPixel: 0.0032,
    pitchMinDegrees: -8,
    pitchMaxDegrees: 42,
  }),
  // Motion, which a pose cannot express. Lag is the time constant of an exponential approach, so
  // it reads as "how long the camera takes to mostly catch up" rather than a per-frame fraction
  // that would mean different things at different frame rates.
  dynamics: Object.freeze({
    positionLagSeconds: 0.12,
    rotationLagSeconds: 0.09,
    // Free to locked and back. A hard cut on a lock press is the single most jarring thing a
    // camera like this can do, so it gets its own number rather than borrowing the lag.
    transitionSeconds: 0.25,
  }),
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const toRadians = (degrees) => (finite(degrees) * Math.PI) / 180;

// The lock-on's frontal cone, derived from what is actually being rendered: a candidate is "in
// front of you" when they are on the screen. Vertical fov plus the viewport's aspect is the whole
// story - a portrait phone sees a much narrower slice of the world than a desktop, and a constant
// cone would lie on one of them.
export function horizontalHalfFovRadians(fovDegrees, aspectRatio) {
  const vertical = toRadians(fovDegrees);
  const aspect = Math.max(1e-6, finite(aspectRatio, 16 / 9));
  return Math.atan(Math.tan(vertical / 2) * aspect);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Between the keys that bracket this separation; clamped to the end keys outside the range, since
// a fight at 6m is framed like a fight at the furthest thing anybody tuned.
export function sampleCameraKeys(distanceKeys, separationMeters) {
  const keys = Array.isArray(distanceKeys) ? [...distanceKeys].sort((a, b) => a.separationMeters - b.separationMeters) : [];
  if (keys.length === 0) return null;
  const separation = finite(separationMeters, keys[0].separationMeters);
  if (separation <= keys[0].separationMeters) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (separation >= last.separationMeters) return { ...last };
  let lower = keys[0];
  let upper = last;
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (separation >= keys[index].separationMeters && separation <= keys[index + 1].separationMeters) {
      lower = keys[index];
      upper = keys[index + 1];
      break;
    }
  }
  const span = upper.separationMeters - lower.separationMeters;
  const t = span > 1e-9 ? (separation - lower.separationMeters) / span : 0;
  const blended = { separationMeters: separation };
  for (const field of ['fovDegrees', 'angleDegrees', 'distanceMeters', 'lookHeightMeters', 'azimuthDegrees', 'panX', 'panZ']) {
    blended[field] = lerp(finite(lower[field]), finite(upper[field]), t);
  }
  return blended;
}

// One pose, from a look point and the seven numbers. Both modes end up here; what differs is which
// direction counts as "the way the player is facing" - the line to their target, or their camera.
function poseFromAxis(playerPosition, axisRadians, pose) {
  const player = { x: finite(playerPosition?.x), z: finite(playerPosition?.z) };
  const forwardX = Math.sin(axisRadians);
  const forwardZ = Math.cos(axisRadians);
  // Right-hand perpendicular, so a positive panX is the player's right.
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const lookAt = {
    x: player.x + forwardX * finite(pose.panZ) + rightX * finite(pose.panX),
    y: finite(pose.lookHeightMeters),
    z: player.z + forwardZ * finite(pose.panZ) + rightZ * finite(pose.panX),
  };
  const backRadians = axisRadians + Math.PI + toRadians(pose.azimuthDegrees);
  const pitch = toRadians(pose.angleDegrees);
  const ground = finite(pose.distanceMeters) * Math.cos(pitch);
  return {
    stage: THIRD_PERSON_CAMERA_STAGE,
    position: {
      x: lookAt.x + Math.sin(backRadians) * ground,
      y: lookAt.y + finite(pose.distanceMeters) * Math.sin(pitch),
      z: lookAt.z + Math.cos(backRadians) * ground,
    },
    lookAt,
    fovDegrees: finite(pose.fovDegrees, 50),
    axisRadians,
  };
}

// Locked: the axis is the line from the player to whoever they chose to fight, so the pair stays
// on the screen's centre line and panZ decides how much of the frame belongs to the opponent.
export function solveLockedCameraPose(input = {}) {
  const player = input.player || { x: 0, z: 0 };
  const target = input.target || { x: 0, z: 1 };
  const profile = input.profile || THIRD_PERSON_CAMERA_PROFILE;
  const dx = finite(target.x) - finite(player.x);
  const dz = finite(target.z) - finite(player.z);
  const separationMeters = Math.hypot(dx, dz);
  const pose = sampleCameraKeys(profile.locked?.distanceKeys, separationMeters);
  if (!pose) return null;
  // Nose to nose there is no line to stand behind; the last honest axis is the caller's facing.
  const axis = separationMeters > 1e-6 ? Math.atan2(dx, dz) : finite(input.fallbackAxisRadians);
  return Object.freeze({ ...poseFromAxis(player, axis, pose), mode: 'locked', separationMeters });
}

// Free: the axis is the camera's own yaw, and pitch is the player's to push around within limits.
export function solveFreeCameraPose(input = {}) {
  const player = input.player || { x: 0, z: 0 };
  const profile = input.profile || THIRD_PERSON_CAMERA_PROFILE;
  const free = profile.free || {};
  const pitchDegrees = Math.min(
    finite(free.pitchMaxDegrees, 42),
    Math.max(finite(free.pitchMinDegrees, -8), finite(input.pitchDegrees, finite(free.angleDegrees))),
  );
  return Object.freeze({
    ...poseFromAxis(player, finite(input.yawRadians), { ...free, angleDegrees: pitchDegrees }),
    mode: 'free',
    pitchDegrees,
  });
}

// What has to stay on screen. A fighter is a cylinder, not a plank: 0.45m of shoulder in every
// horizontal direction, from the floor to the top of the head. The square inscribed here has its
// corners exactly on that radius, so the widest point is 0.45 whichever way the pair happens to be
// standing - which is the whole point, and the reason this is a function rather than four numbers
// typed at each call site.
//
// It earned that status by being wrong. The first version measured 0.45m along world x only. That
// is the correct lateral half-width while the two of them face each other down the z axis - which
// is every straight-line sweep - and it silently becomes body DEPTH the moment the opponent
// circles to your side. A profile that framed a duel perfectly cropped somebody the instant they
// strafed, and nothing caught it, because nothing ever tested a sideways fight.
export const FIGHTER_SILHOUETTE = Object.freeze({
  radiusMeters: 0.45,
  headMeters: 1.78,
  footMeters: 0.02,
});

// The two fighters are not read the same way, so they must not be framed the same way.
//
// You read an ATTACK off the opponent's whole body - the windup lives outside the contact height,
// and LEFT's low sweep starts near the floor - so the opponent is framed head to feet.
//
// You read YOUR OWN state off your guard, and every exchange this project has measured is decided
// between the lowest contact floor and the top of your head: TOP lands at 1.138m, LEFT at 1.15m,
// RIGHT between 1.24m and 1.44m. Below that line your own character is legs, and where your feet
// are is a question you answer from the GAP between the two of you, which is on screen regardless.
// So cropping your own knees costs nothing readable, and buys the frame back for the thing you
// actually have to time against. The floor is the guard-hold's own measured number rather than a
// number chosen here, so if the contact geometry ever moves, this moves with it.
export const PLAYER_READABLE_FLOOR_METERS = Math.min(...Object.values(CLOSE_RANGE_GUARD_HOLD_CONTACT_FLOOR_METERS));

export const PLAYER_READABLE_SILHOUETTE = Object.freeze({
  radiusMeters: FIGHTER_SILHOUETTE.radiusMeters,
  headMeters: FIGHTER_SILHOUETTE.headMeters,
  footMeters: PLAYER_READABLE_FLOOR_METERS,
});

export function fighterSilhouettePoints(position, silhouette = FIGHTER_SILHOUETTE) {
  const half = finite(silhouette.radiusMeters, FIGHTER_SILHOUETTE.radiusMeters) / Math.SQRT2;
  const x = finite(position?.x);
  const z = finite(position?.z);
  const points = [];
  for (const sideX of [1, -1]) {
    for (const sideZ of [1, -1]) {
      for (const y of [finite(silhouette.headMeters, FIGHTER_SILHOUETTE.headMeters), finite(silhouette.footMeters, FIGHTER_SILHOUETTE.footMeters)]) {
        points.push({ x: x + sideX * half, y, z: z + sideZ * half });
      }
    }
  }
  return points;
}

// Is it on screen? The camera lab's out-of-frame warning is this function swept across the whole
// lock band, which is the difference between "looks fine at the distance I happened to be standing"
// and a framing that holds everywhere the fight can go. Kept here, next to the solver, because it
// is the same projection the renderer performs - and kept free of Three.js so it can be tested.
//
// The return is in NDC margin: 1 is dead centre, 0 is exactly on the frame edge, negative is off
// screen by that fraction of a half-frame. Anything behind the camera fails outright rather than
// wrapping around, which is what a naive divide by depth would do.
export function evaluateFraming(input = {}) {
  const pose = input.pose;
  if (!pose?.position || !pose?.lookAt) return null;
  const aspectRatio = Math.max(1e-6, finite(input.aspectRatio, 16 / 9));
  const points = Array.isArray(input.points) ? input.points : [];
  const eye = pose.position;
  const forward = normalize({ x: pose.lookAt.x - eye.x, y: pose.lookAt.y - eye.y, z: pose.lookAt.z - eye.z });
  // World up, then orthogonalised - the same basis a lookAt builds, and it degenerates only for a
  // camera pointed straight down, which no pose here can reach.
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const tanVertical = Math.tan(toRadians(finite(pose.fovDegrees, 50)) / 2);
  const tanHorizontal = tanVertical * aspectRatio;
  let worst = null;
  for (const point of points) {
    const offset = { x: finite(point?.x) - eye.x, y: finite(point?.y) - eye.y, z: finite(point?.z) - eye.z };
    const depth = dot(offset, forward);
    if (depth <= 1e-6) return Object.freeze({ marginNdc: -Infinity, worstPoint: point, behindCamera: true, aspectRatio });
    const ndcX = dot(offset, right) / (depth * tanHorizontal);
    const ndcY = dot(offset, up) / (depth * tanVertical);
    const margin = 1 - Math.max(Math.abs(ndcX), Math.abs(ndcY));
    if (!worst || margin < worst.marginNdc) worst = { marginNdc: margin, worstPoint: point, ndcX, ndcY };
  }
  if (!worst) return null;
  return Object.freeze({ ...worst, behindCamera: false, aspectRatio, inFrame: worst.marginNdc >= 0 });
}

// The locked pair, judged by what each of them is for. Two margins rather than one, because a
// framing that crops the player's legs on purpose is a decision, and a framing that crops the
// opponent's feet is a bug - and a single number cannot tell those apart.
export function evaluateLockedFraming(input = {}) {
  const pose = input.pose;
  const aspectRatio = input.aspectRatio;
  const opponent = evaluateFraming({
    pose, aspectRatio, points: fighterSilhouettePoints(input.target, input.opponentSilhouette),
  });
  const player = evaluateFraming({
    pose, aspectRatio, points: fighterSilhouettePoints(input.player, input.playerSilhouette || PLAYER_READABLE_SILHOUETTE),
  });
  if (!opponent || !player) return null;
  // How much of your own body actually made it in, reported rather than judged: it is the number
  // a person tuning a half-body shot wants to see, and no value of it is wrong on its own.
  const playerFull = evaluateFraming({ pose, aspectRatio, points: fighterSilhouettePoints(input.player) });
  return Object.freeze({
    opponentMarginNdc: opponent.marginNdc,
    playerMarginNdc: player.marginNdc,
    playerFullBodyMarginNdc: playerFull ? playerFull.marginNdc : null,
    marginNdc: Math.min(opponent.marginNdc, player.marginNdc),
    inFrame: opponent.marginNdc >= 0 && player.marginNdc >= 0,
    croppingPlayerLegs: Boolean(playerFull && playerFull.marginNdc < 0 && player.marginNdc >= 0),
    aspectRatio: opponent.aspectRatio,
  });
}

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

// Lag as an exponential approach: alpha = 1 - exp(-dt / tau). Frame-rate independent by
// construction, which matters here for the same reason it mattered to the frame clock - a camera
// that smooths by a fixed fraction per frame is a different camera on every machine.
function approach(current, target, lagSeconds, deltaSeconds) {
  const tau = Math.max(0, finite(lagSeconds));
  if (tau <= 1e-6) return target;
  const alpha = 1 - Math.exp(-Math.max(0, finite(deltaSeconds)) / tau);
  return current + (target - current) * alpha;
}

export function createThirdPersonCameraRuntime(options = {}) {
  const profile = options.profile || THIRD_PERSON_CAMERA_PROFILE;
  let current = null;

  return Object.freeze({
    // Snap on the first frame: easing in from wherever the camera happened to be left is a
    // swoop nobody asked for.
    update(desiredPose, deltaSeconds = 1 / 60) {
      if (!desiredPose) return current;
      if (!current) {
        current = {
          position: { ...desiredPose.position },
          lookAt: { ...desiredPose.lookAt },
          fovDegrees: desiredPose.fovDegrees,
        };
        return Object.freeze({ ...desiredPose, ...current, settled: true });
      }
      const dynamics = profile.dynamics || {};
      const positionLag = finite(dynamics.positionLagSeconds, 0.12);
      const rotationLag = finite(dynamics.rotationLagSeconds, 0.09);
      for (const axis of ['x', 'y', 'z']) {
        current.position[axis] = approach(current.position[axis], desiredPose.position[axis], positionLag, deltaSeconds);
        // The look point is what the camera is aimed at, so it answers to the rotation lag.
        current.lookAt[axis] = approach(current.lookAt[axis], desiredPose.lookAt[axis], rotationLag, deltaSeconds);
      }
      current.fovDegrees = approach(current.fovDegrees, desiredPose.fovDegrees, rotationLag, deltaSeconds);
      return Object.freeze({
        ...desiredPose,
        position: { ...current.position },
        lookAt: { ...current.lookAt },
        fovDegrees: current.fovDegrees,
        settled: false,
      });
    },
    reset() { current = null; },
    get profile() { return profile; },
  });
}
