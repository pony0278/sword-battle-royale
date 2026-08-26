import { createDefaultCharacter } from '../../src/character/default-character.js';
import { loadSkyrimConvertedAnimationLibrary } from '../../src/animation/skyrim-converted-animation-library.js';
import { LIVING_GUARD_IDLE_SOURCE_CLIP_ID, LIVING_GUARD_IDLE_STAGE } from '../../src/combat/living-guard-idle-probe.js';

const THREE = window.THREE;
const status = document.getElementById('status');
const reportNode = document.getElementById('report');
if (!THREE?.GLTFLoader || !THREE?.Quaternion) throw new Error(`${LIVING_GUARD_IDLE_STAGE} source scan requires Three.js + GLTFLoader`);

const character = createDefaultCharacter(THREE);
const WATCH = Object.freeze(['chest', 'upperarm.r', 'lowerarm.r', 'wrist.r']);
const WINDOW_SECONDS = 2;
const STRIDE_SECONDS = 0.5;
const FPS = 30;

function quat(id) {
  const bone = character.rig?.bones?.[id];
  if (!bone?.quaternion) throw new Error(`Missing source-scan bone ${id}`);
  return bone.quaternion.clone().normalize();
}

function angleDegrees(a, b) {
  const dot = Math.min(1, Math.max(-1, Math.abs(a.dot(b))));
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function sample(timeSeconds) {
  character.sampleAnimation(LIVING_GUARD_IDLE_SOURCE_CLIP_ID, timeSeconds, {
    inPlace: true,
    loop: false,
    rootRotationPolicy: 'lock',
  });
  return Object.fromEntries(WATCH.map((id) => [id, quat(id)]));
}

function measureWindow(startSeconds) {
  const steps = Math.max(2, Math.round(WINDOW_SECONDS * FPS));
  const dt = WINDOW_SECONDS / steps;
  const first = sample(startSeconds);
  const previous = Object.fromEntries(WATCH.map((id) => [id, first[id].clone()]));
  const path = Object.fromEntries(WATCH.map((id) => [id, 0]));
  const maxStep = Object.fromEntries(WATCH.map((id) => [id, 0]));
  const maxExcursion = Object.fromEntries(WATCH.map((id) => [id, 0]));

  let last = first;
  for (let step = 1; step <= steps; step += 1) {
    const now = sample(startSeconds + step * dt);
    for (const id of WATCH) {
      const delta = angleDegrees(previous[id], now[id]);
      path[id] += delta;
      maxStep[id] = Math.max(maxStep[id], delta);
      maxExcursion[id] = Math.max(maxExcursion[id], angleDegrees(first[id], now[id]));
      previous[id].copy(now[id]);
    }
    last = now;
  }

  const seam = Object.fromEntries(WATCH.map((id) => [id, angleDegrees(first[id], last[id])]));
  const activity = path.chest + path['upperarm.r'] * 0.5 + path['lowerarm.r'] * 0.35 + path['wrist.r'] * 0.25;
  const seamWeighted = seam.chest + seam['upperarm.r'] * 0.6 + seam['lowerarm.r'] * 0.4 + seam['wrist.r'] * 0.3;
  const stepWeighted = maxStep.chest + maxStep['upperarm.r'] * 0.6 + maxStep['lowerarm.r'] * 0.4 + maxStep['wrist.r'] * 0.3;
  const targetActivity = 8;
  const activityPenalty = Math.abs(activity - targetActivity) * 0.25;
  const score = seamWeighted * 4 + stepWeighted * 6 + activityPenalty;

  return {
    startSeconds: Number(startSeconds.toFixed(3)),
    endSeconds: Number((startSeconds + WINDOW_SECONDS).toFixed(3)),
    activity: Number(activity.toFixed(4)),
    seamWeighted: Number(seamWeighted.toFixed(4)),
    stepWeighted: Number(stepWeighted.toFixed(4)),
    score: Number(score.toFixed(4)),
    path: Object.fromEntries(WATCH.map((id) => [id, Number(path[id].toFixed(4))])),
    maxStep: Object.fromEntries(WATCH.map((id) => [id, Number(maxStep[id].toFixed(4))])),
    maxExcursion: Object.fromEntries(WATCH.map((id) => [id, Number(maxExcursion[id].toFixed(4))])),
    seam: Object.fromEntries(WATCH.map((id) => [id, Number(seam[id].toFixed(4))])),
  };
}

async function main() {
  status.textContent = 'Loading Skyrim blockidle…';
  const library = await loadSkyrimConvertedAnimationLibrary(new THREE.GLTFLoader(), {
    THREE,
    rig: character.rig,
    fps: 30,
  });
  character.registerAnimations(library);
  const clip = library.clips.get(LIVING_GUARD_IDLE_SOURCE_CLIP_ID);
  if (!clip) throw new Error(`Missing ${LIVING_GUARD_IDLE_SOURCE_CLIP_ID}`);

  const windows = [];
  for (let start = 0; start + WINDOW_SECONDS <= clip.duration + 1e-6; start += STRIDE_SECONDS) {
    windows.push(measureWindow(start));
  }
  const gentle = windows
    .filter((row) => row.activity >= 1.5 && row.stepWeighted <= 3 && row.seamWeighted <= 5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 15);
  const quietestNonStatic = windows
    .filter((row) => row.activity >= 1.5)
    .sort((a, b) => (a.seamWeighted + a.stepWeighted * 2) - (b.seamWeighted + b.stepWeighted * 2))
    .slice(0, 15);
  const report = {
    stage: LIVING_GUARD_IDLE_STAGE,
    sourceClipId: LIVING_GUARD_IDLE_SOURCE_CLIP_ID,
    sourceDurationSeconds: clip.duration,
    windowSeconds: WINDOW_SECONDS,
    strideSeconds: STRIDE_SECONDS,
    windowsScanned: windows.length,
    gentle,
    quietestNonStatic,
  };
  document.documentElement.dataset.g364SourceScan = gentle.length ? 'pass' : 'needs-review';
  reportNode.textContent = JSON.stringify(report, null, 2);
  window.__G364_SOURCE_SCAN__ = report;
  status.textContent = `${LIVING_GUARD_IDLE_STAGE} source scan · ${windows.length} windows · ${gentle.length} gentle candidates`;
}

main().catch((error) => {
  document.documentElement.dataset.g364SourceScan = 'fail';
  status.textContent = `${LIVING_GUARD_IDLE_STAGE} source scan FAIL · ${error?.message || error}`;
  reportNode.textContent = error?.stack || String(error);
});
