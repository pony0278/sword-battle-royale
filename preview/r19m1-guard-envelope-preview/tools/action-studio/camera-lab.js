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
// The body box, not the blade. Half a metre of shoulder either side and a head at 1.78m is what
// must stay on screen; whether a LEFT sweep reads at the bottom of the frame is a thing to watch
// during playback, because a blade leaving frame for three frames is sometimes fine and a body
// leaving frame never is.
const SILHOUETTE_HALF_WIDTH_METERS = 0.45;
const SILHOUETTE_HEAD_METERS = 1.78;
const SILHOUETTE_FOOT_METERS = 0.02;

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
  function silhouettePoints(report) {
    const points = [];
    for (const position of [report.attackerPosition, report.defenderPosition]) {
      for (const side of [1, -1]) {
        for (const height of [SILHOUETTE_HEAD_METERS, SILHOUETTE_FOOT_METERS]) {
          points.push({ x: position.x + side * SILHOUETTE_HALF_WIDTH_METERS, y: height, z: position.z });
        }
      }
    }
    return points;
  }

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
  function sweepFraming() {
    const aspectRatio = scene.camera.aspect;
    const rows = [];
    let worst = null;
    for (let separation = SWEEP_MIN_METERS; separation <= SWEEP_MAX_METERS + 1e-9; separation += 0.1) {
      const probe = createEngagementGround({ startSeparationMeters: round(separation, 2) }).report;
      const pose = solveLockedCameraPose({
        player: probe.defenderPosition, target: probe.attackerPosition, profile: working,
      });
      const framing = evaluateFraming({ pose, aspectRatio, points: silhouettePoints(probe) });
      if (!worst || framing.marginNdc < worst.marginNdc) worst = { ...framing, separationMeters: separation };
      if (framing.marginNdc < 0) rows.push(`${separation.toFixed(1)}m  出框 ${(framing.marginNdc * 100).toFixed(0)}%`);
    }
    const verdict = rows.length === 0
      ? `全程在框內 · 最窄餘裕 ${(worst.marginNdc * 100).toFixed(0)}% @ ${worst.separationMeters.toFixed(1)}m`
      : `${rows.length} 個距離出框:\n${rows.join('\n')}`;
    $('sweep').textContent = `${SWEEP_MIN_METERS}–${SWEEP_MAX_METERS}m @ ${aspectRatio.toFixed(2)}:1\n${verdict}`;
    $('sweep').className = rows.length === 0 ? 'good' : 'bad';
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

    const framing = evaluateFraming({
      pose: smoothed, aspectRatio: scene.camera.aspect, points: silhouettePoints(report),
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
        ? `<span class="${framing.marginNdc >= 0.05 ? 'good' : framing.marginNdc >= 0 ? 'warn' : 'bad'}">框內餘裕 ${(framing.marginNdc * 100).toFixed(0)}%${framing.marginNdc < 0 ? ' · 有人出框' : ''}</span>`
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
    profile: () => cloneProfile(working),
    serialize: serializeProfile,
    setSeparation,
    setMode,
    play,
    sweep: sweepFraming,
    framing: () => evaluateFraming({
      pose: desiredPose(ground.report), aspectRatio: scene.camera.aspect, points: silhouettePoints(ground.report),
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
