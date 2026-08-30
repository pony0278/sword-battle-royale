// R20Q.1 — the camera lab. A separate page whose only product is a set of numbers.
//
// Why it exists: where the camera stands is not a thing anyone can measure. Every other value in
// this project was taken off a clip or a probe and carries a note saying how; framing is judged by
// eye, on a real swing, by the person whose game it is. So this page is the tuning surface, and
// what it prints is meant to replace the seeds in src/combat/third-person-camera.js.
//
// What it is NOT is a second camera. The pose comes from the shared solver, the smoothing from the
// shared runtime, and the profile edited here is the same shape the combat lab imports - otherwise
// we end up with two cameras that drift apart and an argument about which one is the game.
//
// The combat lab is not touched by anything in this file. Its goldens and probes stay at zero risk
// while the tuning happens.
import { createShieldParryLabScene } from './shield-parry-r281/lab-scene.js';
import { bootstrapShieldParryLabAssets, NEUTRAL_IDLE_CLIP_ID } from './shield-parry-r281/lab-bootstrap.js';
import { createLongswordDirectionalAttackRuntime } from '../../src/combat/longsword-directional-attack-runtime.js';
import { createEngagementGround } from '../../src/combat/engagement-ground.js';
import { LANE_LOCOMOTION_PROFILE } from '../../src/combat/lane-locomotion.js';
import { lockOnAcquireHalfAngleRadians } from '../../src/combat/lock-on.js';
import {
  THIRD_PERSON_CAMERA_PROFILE,
  THIRD_PERSON_CAMERA_STAGE,
  createThirdPersonCameraRuntime,
  evaluateFraming,
  evaluateLockedFraming,
  fighterSilhouettePoints,
  PLAYER_READABLE_FLOOR_METERS,
  sampleCameraKeys,
  solveFreeCameraPose,
  solveLockedCameraPose,
} from '../../src/combat/third-person-camera.js';

const THREE = window.THREE;
const LAB_STAGE = 'R20Q.1';
// The lock band: the contact floor at one end, the lock's break range at the other. A framing is
// only finished when it survives this whole sweep, which is what the out-of-frame check is for.
const SWEEP_MIN_METERS = 1.1;
const SWEEP_MAX_METERS = 5;
// Every window the game has to survive, checked together. A framing tuned in one window is a
// framing verified in one window: the vertical field does not change with the aspect but the
// horizontal one does, so an over-the-shoulder offset that reads fine at 16:9 can push you out the
// SIDE of a 4:3 one. The lab's own canvas is added at run time, because it is neither of these.
const VERIFIED_ASPECT_RATIOS = Object.freeze([4 / 3, 16 / 9, 19.5 / 9]);
// The body, not the blade: whether a LEFT sweep reads at the bottom of the frame is a thing to
// watch during playback, because a blade leaving frame for three frames is sometimes fine and a
// body leaving frame never is. The shape itself comes from the shared module, so the page and the
// tests are checking the same thing.

// Named starting points, so a comparison is one line in the console rather than twenty-one
// sliders. "yours" is what came back from the first tuning pass; the two after it are that same
// character made consistent across the three keys, which is the only thing measurement had to say
// about it - the character itself is not mine to have an opinion about.
const PRESET_MIDDLE = { fovDegrees: 59, angleDegrees: 12, lookHeightMeters: 0.69, azimuthDegrees: 40, panX: 0.05 };
const PRESET_SOFT_ENDS = { fovDegrees: 57, angleDegrees: 13, lookHeightMeters: 0.8, azimuthDegrees: 30, panX: 0.1 };
const SEED_END = { fovDegrees: 50, azimuthDegrees: 0 };
// The half-body character: a wide lens, low and close. Distance, panZ and azimuth are what the
// two presets below argue about; these four are the look itself.
const PRESET_HALF_BODY = { fovDegrees: 74, angleDegrees: 19, lookHeightMeters: 0.69, panX: 0.01 };
const PRESETS = Object.freeze({
  // What the module ships today.
  seed: () => cloneProfile(THIRD_PERSON_CAMERA_PROFILE).locked.distanceKeys,
  // The first tuning pass: one key given a character, two left as seeds. Walking through 2.4m
  // swings the camera 30 deg/s on its own, which is faster than the opponent crosses the screen.
  yours: () => [
    { separationMeters: 1.4, ...SEED_END, angleDegrees: 16, distanceMeters: 3.4, lookHeightMeters: 1.25, panX: 0.35, panZ: 0.55 },
    { separationMeters: 2.4, ...PRESET_MIDDLE, distanceMeters: 4.35, panZ: 1.32 },
    { separationMeters: 4, ...SEED_END, angleDegrees: 20, distanceMeters: 5.35, lookHeightMeters: 1.35, panX: 0.3, panZ: 1.6 },
  ],
  // The same character on all three keys; only how far back and how much frame the opponent gets
  // answer to the gap. No self-rotation from walking at all.
  propagated: () => [
    { separationMeters: 1.4, ...PRESET_MIDDLE, distanceMeters: 3.85, panZ: 0.77 },
    { separationMeters: 2.4, ...PRESET_MIDDLE, distanceMeters: 4.35, panZ: 1.32 },
    { separationMeters: 4, ...PRESET_MIDDLE, distanceMeters: 5.4, panZ: 2.2 },
  ],
  // The half-body idea: crop your own legs to see the opponent better. The first attempt spent its
  // budget in the wrong place - a wide lens (74deg) cancelled the camera coming 1.4m closer, so the
  // opponent grew 3 points while the frame gained a 15 deg/s zoom pulse centred on 2.4m.
  halfBody: () => [
    { separationMeters: 1.4, ...PRESET_MIDDLE, distanceMeters: 3.85, panZ: 0.77 },
    { separationMeters: 2.4, fovDegrees: 74, angleDegrees: 19, lookHeightMeters: 0.69, azimuthDegrees: 30, panX: 0.01, distanceMeters: 2.95, panZ: 1.67 },
    { separationMeters: 4, ...PRESET_MIDDLE, distanceMeters: 5.4, panZ: 2.2 },
  ],
  // The half-body look, made to survive a narrow window. The submitted version works at 16:9 and
  // only there: azimuth 30 spends horizontal room, panZ spends it again, and a 4:3 frame does not
  // have that much - your own guard leaves the SIDE of the screen at 2.3-2.6m, which is where a
  // fight lives. Measured, over-the-shoulder and a leg crop compete for the same budget: at azimuth
  // 30 or 40 there is no distance/panZ pair that crops legs and keeps the guard at 4:3. This eases
  // the shoulder to 20 and keeps everything else - crop depth -16% against the original's -20%,
  // and the guard's margin goes from 15% to 26%.
  halfBodyShoulder: () => [1.4, 2.4, 4].map((separationMeters) => ({
    separationMeters, ...PRESET_HALF_BODY, azimuthDegrees: 20, distanceMeters: 2.85, panZ: 1.45,
  })),
  // The deep crop, bought by giving up the shoulder entirely. Half the body gone (-71%) and the
  // guard at 27%, but at azimuth 0 the two fighters sit on the same vertical line - screen gap
  // 0.01 against 0.57 - so the fight reads in depth again, which is what the shoulder was for.
  halfBodyBehind: () => [1.4, 2.4, 4].map((separationMeters) => ({
    separationMeters, ...PRESET_HALF_BODY, azimuthDegrees: 0, distanceMeters: 3.05, panZ: 2,
  })),
  // The same intent, spent on the opponent instead: one lens for the whole band, the camera in
  // close, and the look point pushed most of the way to them. The opponent goes from 30% of the
  // frame's height to 40-52% while your own guard keeps a 15% margin.
  opponentFirst: () => [
    { separationMeters: 1.4, ...PRESET_MIDDLE, distanceMeters: 3.25, panZ: 1.25 },
    { separationMeters: 2.4, ...PRESET_MIDDLE, distanceMeters: 3.25, panZ: 1.25 },
    { separationMeters: 4, ...PRESET_MIDDLE, distanceMeters: 3.25, panZ: 1.25 },
  ],
  // The middle keeps more character than the ends, but the ends lean toward it rather than
  // snapping back to square-on: the swing survives at about a quarter of its speed.
  softened: () => [
    { separationMeters: 1.4, ...PRESET_SOFT_ENDS, distanceMeters: 3.75, panZ: 0.77 },
    { separationMeters: 2.4, ...PRESET_MIDDLE, distanceMeters: 4.35, panZ: 1.32 },
    { separationMeters: 4, ...PRESET_SOFT_ENDS, distanceMeters: 5.8, panZ: 2.2 },
  ],
});

const FIELD_SPECS = Object.freeze({
  fovDegrees: { label: 'FOV 視野', min: 20, max: 90, step: 1, unit: '°' },
  angleDegrees: { label: 'Angle 俯角', min: -10, max: 60, step: 0.5, unit: '°' },
  distanceMeters: { label: 'Distance 距離', min: 1, max: 9, step: 0.05, unit: 'm' },
  lookHeightMeters: { label: 'Look 看向高度', min: 0.2, max: 2.6, step: 0.01, unit: 'm' },
  azimuthDegrees: { label: 'Azimuth 方位角', min: -60, max: 60, step: 1, unit: '°' },
  panX: { label: 'PanX 取景偏移X', min: -1.5, max: 1.5, step: 0.01, unit: 'm' },
  panZ: { label: 'PanZ 取景偏移Z', min: -1, max: 3, step: 0.01, unit: 'm' },
  mouseSensitivityRadiansPerPixel: { label: '滑鼠靈敏度', min: 0.0005, max: 0.012, step: 0.0001, unit: 'rad/px' },
  pitchMinDegrees: { label: '俯角下限', min: -40, max: 20, step: 1, unit: '°' },
  pitchMaxDegrees: { label: '俯角上限', min: 0, max: 70, step: 1, unit: '°' },
  positionLagSeconds: { label: '位置延遲', min: 0, max: 0.5, step: 0.005, unit: 's' },
  rotationLagSeconds: { label: '朝向延遲', min: 0, max: 0.5, step: 0.005, unit: 's' },
  transitionSeconds: { label: '鎖定切換', min: 0, max: 1, step: 0.01, unit: 's' },
});
const POSE_FIELDS = ['fovDegrees', 'angleDegrees', 'distanceMeters', 'lookHeightMeters', 'azimuthDegrees', 'panX', 'panZ'];

// A mutable working copy, because the shared profile is frozen on purpose - this page is the one
// place its numbers are allowed to move, and only in memory until somebody pastes the output back.
function cloneProfile(profile) { return JSON.parse(JSON.stringify(profile)); }
let working = cloneProfile(THIRD_PERSON_CAMERA_PROFILE);

const state = {
  mode: 'locked',
  separationMeters: 2.4,
  editingKey: 1,
  followSeparation: true,
  yawRadians: Math.PI,
  pitchDegrees: 14,
  loop: false,
  playbackDirection: 'TOP',
  move: { forward: 0, lateral: 0 },
};

const $ = (id) => document.getElementById(id);
const round = (value, places = 3) => Number(Number(value).toFixed(places));

async function main() {
  const scene = createShieldParryLabScene({ THREE, separationMeters: state.separationMeters });
  scene.resize();
  window.addEventListener('resize', scene.resize);

  const assets = await bootstrapShieldParryLabAssets({
    THREE, attacker: scene.attacker, defender: scene.defender, labStage: LAB_STAGE,
  });
  const attackRuntime = createLongswordDirectionalAttackRuntime();
  const cameraRuntime = createThirdPersonCameraRuntime({ profile: working });
  let ground = createEngagementGround({ startSeparationMeters: state.separationMeters });
  // The defender guards; if the Skyrim block idle is present that is the pose worth framing, since
  // it is the silhouette a player looks at for most of a fight.
  const defenderIdleClip = scene.defender.getAnimationDuration('SKYRIM_GUARD/shd_blockidle')
    ? 'SKYRIM_GUARD/shd_blockidle'
    : NEUTRAL_IDLE_CLIP_ID;
  const defenderIdleDuration = scene.defender.getAnimationDuration(defenderIdleClip) || 1;

  function rebuildGround() {
    ground = createEngagementGround({ startSeparationMeters: state.separationMeters });
    if (state.mode === 'free') ground.setDefenderFacing(state.yawRadians);
    return ground.report;
  }
  rebuildGround();

  // --- the two actors, as points the camera has to hold -------------------------------------

  function desiredPose(report) {
    if (state.mode === 'locked') {
      return solveLockedCameraPose({
        player: report.defenderPosition,
        target: report.attackerPosition,
        profile: working,
        fallbackAxisRadians: report.defenderBearingRadians ?? Math.PI,
      });
    }
    return solveFreeCameraPose({
      player: report.defenderPosition,
      yawRadians: state.yawRadians,
      pitchDegrees: state.pitchDegrees,
      profile: working,
    });
  }

  // --- input ---------------------------------------------------------------------------------
  const keys = new Set();
  const MOVE_KEYS = { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right' };
  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code]) { keys.add(event.code); event.preventDefault(); }
    if (event.code === 'KeyL') setMode(state.mode === 'locked' ? 'free' : 'locked');
    if (event.code === 'Space') { play(state.playbackDirection); event.preventDefault(); }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));

  let dragging = false;
  let lastPointer = null;
  scene.canvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'free') return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    scene.canvas.setPointerCapture(event.pointerId);
  });
  scene.canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !lastPointer) return;
    const sensitivity = working.free.mouseSensitivityRadiansPerPixel;
    state.yawRadians -= (event.clientX - lastPointer.x) * sensitivity;
    state.pitchDegrees += (event.clientY - lastPointer.y) * sensitivity * (180 / Math.PI) * 0.5;
    lastPointer = { x: event.clientX, y: event.clientY };
  });
  const endDrag = () => { dragging = false; lastPointer = null; };
  scene.canvas.addEventListener('pointerup', endDrag);
  scene.canvas.addEventListener('pointercancel', endDrag);

  function applyMovement(deltaSeconds, report) {
    const forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const lateralInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (forwardInput === 0 && lateralInput === 0) return report;
    // Locked, forward is the line to the opponent - which makes A/D an orbit, the lane behaviour
    // this whole set was measured under. Free, forward is wherever the camera looks.
    const axis = state.mode === 'locked'
      ? (report.defenderBearingRadians ?? Math.PI)
      : state.yawRadians;
    const speed = forwardInput >= 0 ? LANE_LOCOMOTION_PROFILE.forwardSpeedMps : LANE_LOCOMOTION_PROFILE.backwardSpeedMps;
    const forwardMeters = forwardInput * speed * deltaSeconds;
    const lateralMeters = lateralInput * LANE_LOCOMOTION_PROFILE.lateralSpeedMps * deltaSeconds;
    const dx = Math.sin(axis) * forwardMeters + Math.cos(axis) * lateralMeters;
    const dz = Math.cos(axis) * forwardMeters - Math.sin(axis) * lateralMeters;
    return ground.moveDefenderWorld(dx, dz);
  }

  // --- playback ------------------------------------------------------------------------------
  function play(direction) {
    state.playbackDirection = direction;
    if (attackRuntime.active) return;
    attackRuntime.start(direction);
    syncButtons();
  }

  let idleClockSeconds = 0;
  function poseActors(deltaMs, report) {
    const snapshot = attackRuntime.update(deltaMs);
    if (snapshot.action) {
      const profile = snapshot.action.runtime;
      scene.attacker.sampleAnimation(
        profile.clipId,
        Math.min(profile.sourceDurationSeconds ?? profile.durationSeconds, snapshot.sourceTimeSeconds ?? snapshot.elapsedSeconds),
        { loop: false, inPlace: true, rootRotationPolicy: 'lock' },
      );
    } else {
      idleClockSeconds += deltaMs / 1000;
      scene.attacker.sampleAnimation('UAL1/Sword_Idle', idleClockSeconds % Math.max(0.001, assets.attackerIdleDuration), {
        loop: true, inPlace: true, rootRotationPolicy: 'lock',
      });
      if (state.loop) attackRuntime.start(state.playbackDirection);
    }
    scene.attacker.update(0, scene.camera);
    scene.defender.sampleAnimation(defenderIdleClip, idleClockSeconds % Math.max(0.001, defenderIdleDuration), {
      loop: true, inPlace: true, rootRotationPolicy: 'lock',
    });
    scene.defender.update(0, scene.camera);
    scene.setLanePositions(report);
    return snapshot;
  }

  // --- the sweep, which is the verification rather than a parameter ---------------------------
  //
  // Three readings of a profile, none of them a matter of taste: whether anybody leaves the frame
  // anywhere in the lock band; how much the camera moves on its own when a fighter merely walks;
  // and where on the screen the two of them actually sit. The second one is the reason this exists
  // at all - keys that disagree with each other turn walking into camera work nobody asked for.
  function measureProfile(profile = working, aspectRatio = scene.camera.aspect) {
    const outOfFrame = [];
    let worst = null;
    let legCrops = 0;
    let samples = 0;
    const aspects = [...new Set([round(aspectRatio, 3), ...VERIFIED_ASPECT_RATIOS.map((value) => round(value, 3))])];
    for (const aspect of aspects)
    for (let separation = SWEEP_MIN_METERS; separation <= SWEEP_MAX_METERS + 1e-9; separation += 0.1) {
      // Every separation, and at each one every bearing: a lock follows the pair round, so the
      // framing has to hold with the opponent to your side as much as in front of you. Walking the
      // pair down one axis is what let a wrongly oriented body box go unnoticed.
      for (let bearing = 0; bearing < Math.PI * 2 - 1e-9; bearing += Math.PI / 6) {
        const player = { x: 0, z: 0 };
        const target = { x: Math.sin(bearing) * separation, z: Math.cos(bearing) * separation };
        const pose = solveLockedCameraPose({ player, target, profile });
        // Two readings, because the two fighters are read differently: the opponent head to feet
        // (their windup starts outside the contact height), you from the lowest measured contact
        // floor up (below that you are legs, and where your feet are is the gap, not your knees).
        const framing = evaluateLockedFraming({ pose, aspectRatio: aspect, player, target });
        if (!worst || framing.marginNdc < worst.marginNdc) worst = { ...framing, separationMeters: separation, aspectRatio: aspect };
        if (framing.croppingPlayerLegs) legCrops += 1;
        samples += 1;
        if (framing.marginNdc < 0 && outOfFrame.at(-1)?.separationMeters !== round(separation, 1)) {
          outOfFrame.push({
            separationMeters: round(separation, 1),
            marginNdc: round(framing.marginNdc),
            aspectRatio: aspect,
            who: framing.opponentMarginNdc < framing.playerMarginNdc ? 'opponent' : 'player',
          });
        }
      }
    }
    // Walking at the measured sidestep speed, between each pair of keys.
    const keys = [...profile.locked.distanceKeys].sort((a, b) => a.separationMeters - b.separationMeters);
    const walk = [];
    for (let index = 0; index < keys.length - 1; index += 1) {
      const span = keys[index + 1].separationMeters - keys[index].separationMeters;
      const rate = (field) => round(Math.abs(keys[index + 1][field] - keys[index][field]) / span * LANE_LOCOMOTION_PROFILE.lateralSpeedMps, 2);
      walk.push({
        from: keys[index].separationMeters,
        to: keys[index + 1].separationMeters,
        azimuthDegreesPerSecond: rate('azimuthDegrees'),
        fovDegreesPerSecond: rate('fovDegrees'),
        lookHeightMetersPerSecond: rate('lookHeightMeters'),
        dollyMetersPerSecond: rate('distanceMeters'),
      });
    }
    // And what the frame looks like at each key: heads on screen, in NDC.
    const screen = keys.map((key) => {
      const separation = key.separationMeters;
      const probe = createEngagementGround({ startSeparationMeters: separation }).report;
      const pose = solveLockedCameraPose({ player: probe.defenderPosition, target: probe.attackerPosition, profile });
      const head = (position) => evaluateFraming({ pose, aspectRatio, points: [{ x: position.x, y: 1.6, z: position.z }] });
      const me = head(probe.defenderPosition);
      const them = head(probe.attackerPosition);
      // How big the thing you have to read actually is, as a fraction of the frame's height. This
      // is what a closer camera is FOR, and it is the number a wider lens quietly gives back.
      const at = (height) => evaluateFraming({ pose, aspectRatio, points: [{ x: probe.attackerPosition.x, y: height, z: probe.attackerPosition.z }] });
      const opponentHeight = (at(1.78).ndcY - at(0.02).ndcY) / 2;
      return {
        separationMeters: separation,
        player: { x: round(me.ndcX, 2), y: round(me.ndcY, 2) },
        opponent: { x: round(them.ndcX, 2), y: round(them.ndcY, 2) },
        screenGap: round(Math.abs(me.ndcX - them.ndcX), 2),
        opponentScreenHeight: round(opponentHeight, 2),
      };
    });
    return {
      aspectRatio: round(aspectRatio, 2),
      aspectRatiosChecked: aspects,
      worstAspectRatio: worst.aspectRatio,
      worstMarginNdc: round(worst.marginNdc),
      worstOpponentMarginNdc: round(worst.opponentMarginNdc),
      worstPlayerMarginNdc: round(worst.playerMarginNdc),
      worstSeparationMeters: round(worst.separationMeters, 1),
      playerReadableFloorMeters: PLAYER_READABLE_FLOOR_METERS,
      legCropFraction: samples ? round(legCrops / samples, 2) : 0,
      outOfFrame, walk, screen,
    };
  }

  function sweepFraming() {
    const measured = measureProfile();
    const swing = Math.max(0, ...measured.walk.map((leg) => leg.azimuthDegreesPerSecond));
    const lines = [`${SWEEP_MIN_METERS}\u2013${SWEEP_MAX_METERS}m \u00d7 12 \u65b9\u4f4d \u00d7 \u756b\u9762 ${measured.aspectRatiosChecked.join(' / ')}:1`];
    lines.push(measured.outOfFrame.length === 0
      ? `\u5168\u7a0b\u5728\u6846\u5167 \u00b7 \u6700\u7a84\u9918\u88d5 ${(measured.worstMarginNdc * 100).toFixed(0)}% @ ${measured.worstSeparationMeters}m / ${measured.worstAspectRatio}:1`
      : `${measured.outOfFrame.length} \u500b\u8ddd\u96e2\u51fa\u6846: ${measured.outOfFrame.map((row) => `${row.separationMeters}m ${(row.marginNdc * 100).toFixed(0)}% (${row.who === 'opponent' ? '\u5c0d\u624b' : '\u81ea\u5df1'}@${row.aspectRatio}:1)`).join(', ')}`);
    lines.push(`\u5c0d\u624b\u5168\u8eab ${(measured.worstOpponentMarginNdc * 100).toFixed(0)}% \u00b7 \u81ea\u5df1 ${measured.playerReadableFloorMeters}m \u4ee5\u4e0a ${(measured.worstPlayerMarginNdc * 100).toFixed(0)}% \u00b7 \u5207\u817f ${(measured.legCropFraction * 100).toFixed(0)}%`);
    lines.push(`\u5c0d\u624b\u4f54\u756b\u9762\u9ad8\u5ea6 ${measured.screen.map((row) => `${row.separationMeters}m ${(row.opponentScreenHeight * 100).toFixed(0)}%`).join(' \u00b7 ')}`);
    // The one number a slider cannot show you: how fast the camera turns when you only walked.
    lines.push(`\u8d70\u4f4d\u9020\u6210\u7684\u81ea\u8f49 ${swing.toFixed(1)}\u00b0/s${swing > 18 ? ' \u00b7 \u6bd4\u5c0d\u624b\u904e\u756b\u9762\u9084\u5feb' : ''}`);
    $('sweep').textContent = lines.join('\n');
    $('sweep').className = measured.outOfFrame.length ? 'bad' : swing > 18 ? 'warn' : 'good';
    return measured;
  }

  // --- controls ------------------------------------------------------------------------------
  function control(container, field, read, write) {
    const spec = FIELD_SPECS[field];
    const row = document.createElement('label');
    row.className = 'debug-range';
    row.innerHTML = `<span>${spec.label}</span><output></output><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}">`;
    const input = row.querySelector('input');
    const output = row.querySelector('output');
    const refresh = () => {
      const value = read();
      input.value = String(value);
      output.textContent = `${value}${spec.unit}`;
    };
    input.addEventListener('input', () => { write(Number(input.value)); refresh(); onProfileChanged(); });
    container.appendChild(row);
    refresh();
    return refresh;
  }

  const refreshers = [];
  function buildControls() {
    refreshers.length = 0;
    const locked = $('lockedControls');
    locked.innerHTML = '';
    const key = () => working.locked.distanceKeys[state.editingKey];
    for (const field of POSE_FIELDS) {
      refreshers.push(control(locked, field, () => key()[field], (value) => { key()[field] = value; }));
    }
    const free = $('freeControls');
    free.innerHTML = '';
    for (const field of [...POSE_FIELDS, 'mouseSensitivityRadiansPerPixel', 'pitchMinDegrees', 'pitchMaxDegrees']) {
      refreshers.push(control(free, field, () => working.free[field], (value) => { working.free[field] = value; }));
    }
    const dynamics = $('dynamicsControls');
    dynamics.innerHTML = '';
    for (const field of ['positionLagSeconds', 'rotationLagSeconds', 'transitionSeconds']) {
      refreshers.push(control(dynamics, field, () => working.dynamics[field], (value) => { working.dynamics[field] = value; }));
    }
  }

  function onProfileChanged() {
    $('output').textContent = '';
    sweepFraming();
  }

  function syncButtons() {
    for (const button of document.querySelectorAll('[data-mode]')) {
      button.classList.toggle('active', button.dataset.mode === state.mode);
    }
    for (const button of document.querySelectorAll('[data-key]')) {
      button.classList.toggle('active', Number(button.dataset.key) === state.editingKey);
    }
    for (const button of document.querySelectorAll('[data-direction]')) {
      button.classList.toggle('active', button.dataset.direction === state.playbackDirection);
    }
    $('loop').classList.toggle('active', state.loop);
    $('follow').classList.toggle('active', state.followSeparation);
    $('freePanel').style.display = state.mode === 'free' ? '' : 'none';
    $('lockedPanel').style.display = state.mode === 'locked' ? '' : 'none';
  }

  function setMode(mode) {
    state.mode = mode;
    // Free mode looks where the camera looks; locked hands facing back to the geometry.
    ground.setDefenderFacing(mode === 'free' ? state.yawRadians : null);
    syncButtons();
  }

  function setSeparation(meters) {
    state.separationMeters = round(meters, 2);
    scene.setEngagementSeparation(state.separationMeters);
    rebuildGround();
    if (state.followSeparation) selectNearestKey();
    $('separationValue').textContent = `${state.separationMeters.toFixed(2)}m`;
  }

  function selectNearestKey() {
    const keys = working.locked.distanceKeys;
    let nearest = 0;
    for (let index = 1; index < keys.length; index += 1) {
      if (Math.abs(keys[index].separationMeters - state.separationMeters)
        < Math.abs(keys[nearest].separationMeters - state.separationMeters)) nearest = index;
    }
    if (nearest !== state.editingKey) {
      state.editingKey = nearest;
      for (const refresh of refreshers) refresh();
      syncButtons();
    }
  }

  // Typing numbers straight in. The sliders are for hunting, this is for comparing: a preset name,
  // a key array, a whole profile, or the text the output box prints - all of them land in the same
  // working profile the page is already rendering from.
  function loadProfile(next) {
    let parsed = next;
    if (typeof parsed === 'string') {
      const preset = PRESETS[parsed.trim()];
      parsed = preset ? preset() : new Function(`return ({${parsed}})`)();
    }
    if (typeof parsed === 'function') parsed = parsed();
    if (!parsed) throw new Error('load() needs a preset name, a key array, a profile, or the text from the output box');
    const incoming = Array.isArray(parsed) ? { locked: { distanceKeys: parsed } } : parsed;
    const seed = cloneProfile(THIRD_PERSON_CAMERA_PROFILE);
    if (incoming.locked?.distanceKeys) {
      // Fill from the seed key nearest in separation, so a partial key is a tweak rather than a
      // pose full of holes.
      working.locked.distanceKeys = incoming.locked.distanceKeys.map((key) => {
        const base = sampleCameraKeys(seed.locked.distanceKeys, key.separationMeters);
        return { ...base, ...key };
      }).sort((a, b) => a.separationMeters - b.separationMeters);
    }
    if (incoming.free) working.free = { ...working.free, ...incoming.free };
    if (incoming.dynamics) working.dynamics = { ...working.dynamics, ...incoming.dynamics };
    state.editingKey = Math.min(state.editingKey, working.locked.distanceKeys.length - 1);
    buildControls();
    syncButtons();
    return sweepFraming();
  }

  function setKey(index, patch) {
    const key = working.locked.distanceKeys[index];
    if (!key) throw new Error(`no key ${index}`);
    Object.assign(key, patch);
    for (const refresh of refreshers) refresh();
    return sweepFraming();
  }

  function serializeProfile() {
    const pose = (values, fields) => `{ ${fields.map((field) => `${field}: ${round(values[field], 4)}`).join(', ')} }`;
    const keys = working.locked.distanceKeys
      .map((key) => `      Object.freeze(${pose(key, ['separationMeters', ...POSE_FIELDS])}),`)
      .join('\n');
    const freeFields = [...POSE_FIELDS, 'mouseSensitivityRadiansPerPixel', 'pitchMinDegrees', 'pitchMaxDegrees'];
    const free = freeFields.map((field) => `    ${field}: ${round(working.free[field], 4)},`).join('\n');
    const dynamics = ['positionLagSeconds', 'rotationLagSeconds', 'transitionSeconds']
      .map((field) => `    ${field}: ${round(working.dynamics[field], 4)},`).join('\n');
    return `// tuned in camera-lab.html, ${new Date().toISOString().slice(0, 10)}\n`
      + `  locked: Object.freeze({\n    distanceKeys: Object.freeze([\n${keys}\n    ]),\n  }),\n`
      + `  free: Object.freeze({\n${free}\n  }),\n`
      + `  dynamics: Object.freeze({\n${dynamics}\n  }),`;
  }

  // --- wiring --------------------------------------------------------------------------------
  buildControls();
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
  for (const button of document.querySelectorAll('[data-key]')) {
    button.addEventListener('click', () => {
      state.editingKey = Number(button.dataset.key);
      state.followSeparation = false;
      for (const refresh of refreshers) refresh();
      syncButtons();
    });
  }
  for (const button of document.querySelectorAll('[data-direction]')) {
    button.addEventListener('click', () => play(button.dataset.direction));
  }
  $('loop').addEventListener('click', () => { state.loop = !state.loop; syncButtons(); });
  $('follow').addEventListener('click', () => {
    state.followSeparation = !state.followSeparation;
    if (state.followSeparation) selectNearestKey();
    syncButtons();
  });
  $('separation').addEventListener('input', (event) => setSeparation(Number(event.target.value)));
  $('sweepNow').addEventListener('click', sweepFraming);
  $('reset').addEventListener('click', () => {
    working = cloneProfile(THIRD_PERSON_CAMERA_PROFILE);
    cameraRuntime.reset();
    buildControls();
    onProfileChanged();
  });
  for (const button of document.querySelectorAll('[data-preset]')) {
    button.addEventListener('click', () => { loadProfile(button.dataset.preset); $('output').textContent = ''; });
  }
  $('emit').addEventListener('click', () => { $('output').textContent = serializeProfile(); });
  $('copy').addEventListener('click', async () => {
    const text = $('output').textContent || serializeProfile();
    $('output').textContent = text;
    try { await navigator.clipboard.writeText(text); $('copy').textContent = '已複製'; } catch { $('copy').textContent = '請手動複製'; }
    setTimeout(() => { $('copy').textContent = '複製'; }, 1200);
  });
  setSeparation(state.separationMeters);
  setMode('locked');
  onProfileChanged();

  let lastTimestamp = null;
  function frame(timestamp) {
    const deltaMs = lastTimestamp == null ? 16.67 : Math.min(50, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    const deltaSeconds = deltaMs / 1000;

    let report = ground.report;
    report = applyMovement(deltaSeconds, report) || report;
    if (state.mode === 'free') ground.setDefenderFacing(state.yawRadians);
    report = ground.report;
    const attack = poseActors(deltaMs, report);

    const desired = desiredPose(report);
    const smoothed = cameraRuntime.update(desired, deltaSeconds);
    scene.camera.position.set(smoothed.position.x, smoothed.position.y, smoothed.position.z);
    scene.camera.lookAt(smoothed.lookAt.x, smoothed.lookAt.y, smoothed.lookAt.z);
    if (Math.abs(scene.camera.fov - smoothed.fovDegrees) > 1e-4) {
      scene.camera.fov = smoothed.fovDegrees;
      scene.camera.updateProjectionMatrix();
    }
    scene.camera.updateMatrixWorld(true);

    const framing = evaluateLockedFraming({
      pose: smoothed,
      aspectRatio: scene.camera.aspect,
      player: report.defenderPosition,
      target: report.attackerPosition,
    });
    const sampled = sampleCameraKeys(working.locked.distanceKeys, report.separationMeters);
    const cone = lockOnAcquireHalfAngleRadians({
      fovDegrees: smoothed.fovDegrees, aspectRatio: scene.camera.aspect,
    }) * 180 / Math.PI;
    $('hud').innerHTML = [
      `<b>${LAB_STAGE} · ${THIRD_PERSON_CAMERA_STAGE} · ${state.mode === 'locked' ? '鎖定 LOCKED' : '自由 FREE'}</b>`,
      `距離 ${report.separationMeters.toFixed(2)}m · 畫面 ${scene.camera.aspect.toFixed(2)}:1 · 鎖定錐 ±${cone.toFixed(1)}°`,
      state.mode === 'locked'
        ? `取樣 距離${sampled.distanceMeters.toFixed(2)} 俯角${sampled.angleDegrees.toFixed(1)}° 高度${sampled.lookHeightMeters.toFixed(2)} panX${sampled.panX.toFixed(2)} panZ${sampled.panZ.toFixed(2)}`
        : `偏航 ${(state.yawRadians * 180 / Math.PI).toFixed(0)}° · 俯角 ${state.pitchDegrees.toFixed(1)}°`,
      framing
        ? `<span class="${framing.marginNdc >= 0.05 ? 'good' : framing.marginNdc >= 0 ? 'warn' : 'bad'}">對手全身 ${(framing.opponentMarginNdc * 100).toFixed(0)}% · 自己護欄 ${(framing.playerMarginNdc * 100).toFixed(0)}%${framing.croppingPlayerLegs ? ' · 切腿(刻意)' : ''}${framing.marginNdc < 0 ? ' · 出框' : ''}</span>`
        : '',
      attack.action
        ? `揮砍 ${attack.direction} ${attack.elapsedSeconds.toFixed(2)}s / 接觸 ${attack.contactSeconds.toFixed(2)}s · ${attack.phase}`
        : '揮砍 —',
    ].join('<br>');

    scene.renderer.render(scene.scene, scene.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // A probe's way in. The page is a tuning surface, so what a headless check needs is the state a
  // person would read off the screen plus the two buttons they would press.
  window.cameraLab = Object.freeze({
    stage: LAB_STAGE,
    state,
    presets: PRESETS,
    load: loadProfile,
    setKey,
    measure: (profile) => measureProfile(profile),
    help() {
      const lines = [
        'cameraLab.load(\'propagated\')        preset: seed / yours / propagated / softened',
        'cameraLab.load([{ separationMeters: 2.4, azimuthDegrees: 30 }, ...])   keys, partial is fine',
        'cameraLab.load(`locked: {...}, free: {...}`)   the text the output box prints',
        'cameraLab.setKey(1, { lookHeightMeters: 0.9 })  one field, one key',
        'cameraLab.measure()                   out-of-frame sweep, walk-induced camera motion, where the pair sits',
        'cameraLab.setSeparation(2.4) / setMode(\'free\') / play(\'LEFT\') / serialize()',
      ];
      return lines.join('\n');
    },
    profile: () => cloneProfile(working),
    serialize: serializeProfile,
    setSeparation,
    setMode,
    play,
    sweep: sweepFraming,
    framing: () => evaluateLockedFraming({
      pose: desiredPose(ground.report),
      aspectRatio: scene.camera.aspect,
      player: ground.report.defenderPosition,
      target: ground.report.attackerPosition,
    }),
    attack: () => attackRuntime.snapshot,
    camera: () => ({
      position: { ...scene.camera.position }, fov: scene.camera.fov, aspect: scene.camera.aspect,
    }),
  });
}

main().catch((error) => {
  const hud = $('hud');
  if (hud) hud.textContent = `啟動失敗: ${error?.message || error}`;
  throw error;
});
