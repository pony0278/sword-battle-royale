import { evaluateClip } from '../../src/animation/animation-clip.js';
import { normalizePose } from '../../src/animation/pose-utils.js';
import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { applyMountCalibration } from '../../src/character/character-sockets.js';

const GHOST_STYLES = Object.freeze({
  previous: Object.freeze({ color: 0x648dff, opacity: 0.28 }),
  next: Object.freeze({ color: 0xffad5b, opacity: 0.24 }),
});

const TRAJECTORY_STYLES = Object.freeze({
  handL: Object.freeze({ color: 0xcaa8ff, label: 'left palm' }),
  handR: Object.freeze({ color: 0xff3b81, label: 'weapon palm' }),
  swordTip: Object.freeze({ color: 0x55e6c1, label: 'sword tip' }),
});

function boundedFrameStep(value) {
  const number = Math.round(Number(value) || 4);
  return Math.max(1, Math.min(60, number));
}

function uniqueBlockingName(clip, selectedKeyIndex, frame) {
  const root = `block_${String(selectedKeyIndex + 1).padStart(2, '0')}_${frame}f`;
  let name = root;
  let suffix = 2;
  while (clip.poses[name] || clip.timeline.some((key) => key.name === name)) name = `${root}_${suffix++}`;
  return name;
}

export function captureNextBlockingKey(clip, selectedKeyIndex, pose, options = {}) {
  if (!clip?.timeline?.length || !clip?.poses) throw new Error('Capture requires an Action Studio clip');
  const index = Math.max(0, Math.min(Math.round(Number(selectedKeyIndex) || 0), clip.timeline.length - 1));
  const current = clip.timeline[index];
  const frameStep = boundedFrameStep(options.frameStep);
  const frame = current.frame + frameStep;
  const next = clip.timeline[index + 1];
  if (next && next.frame <= frame) {
    clip.timeline.forEach((key) => {
      if (key.frame > current.frame) key.frame += frameStep;
    });
  }
  const name = uniqueBlockingName(clip, index, frame);
  clip.timeline.splice(index + 1, 0, {
    name,
    frame,
    frames: frameStep,
    ease: options.ease || 'out',
    tag: options.tag || 'blocking',
    impact: false,
    cancel: false,
  });
  clip.poses[name] = normalizePose(pose || clip.poses[current.name]);
  return { name, frame, frameStep };
}

function ghostLineStyle(style) {
  return {
    lineColor: style.color,
    glowColor: style.color,
    contourColor: style.color,
    headColor: style.color,
    jointColor: style.color,
    lineOpacity: style.opacity,
    headOpacity: style.opacity,
    glowOpacity: 0,
    contourOpacity: style.opacity * 0.82,
    jointOpacity: style.opacity * 0.72,
  };
}

function ghostSwordStyle(style) {
  return {
    outlineColor: style.color,
    skeletonColor: style.color,
    glowColor: style.color,
    jointColor: style.color,
    outlineOpacity: style.opacity,
    skeletonOpacity: style.opacity * 0.8,
    glowOpacity: 0,
    jointOpacity: style.opacity * 0.6,
  };
}

function createGhostRig(THREE, scene, kind, mountCalibration) {
  const style = GHOST_STYLES[kind];
  const character = createDefaultCharacter(THREE, { lineStyle: ghostLineStyle(style) });
  const sword = createDebugSword(THREE, { style: ghostSwordStyle(style) });
  mountDebugSword(character, sword, mountCalibration);
  character.object3d.name = `BLOCKING_${kind.toUpperCase()}_GHOST`;
  character.setRigNodesVisible(false);
  character.setRigGlowVisible(false);
  sword.setNodesVisible(false);
  sword.setGlowVisible(false);
  character.object3d.visible = false;
  scene.add(character.object3d);
  return { character, sword, keyName: null };
}

function createTrajectory(THREE, scene, id, style) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    }),
  );
  line.name = `BLOCKING_TRAJECTORY_${id.toUpperCase()}`;
  line.frustumCulled = false;
  line.renderOrder = 8;
  const keys = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.92,
      size: id === 'swordTip' ? 0.07 : 0.055,
      sizeAttenuation: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  keys.name = `BLOCKING_TRAJECTORY_KEYS_${id.toUpperCase()}`;
  keys.frustumCulled = false;
  keys.renderOrder = 9;
  scene.add(line, keys);
  return { line, keys, sampleCount: 0, keyCount: 0 };
}

function replacePoints(object, THREE, points) {
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

function sampleFrames(clip, maximumSamples = 121) {
  const first = clip.timeline[0].frame;
  const duration = Math.max(first, clip.durationFrames);
  const step = Math.max(1, Math.ceil(Math.max(1, duration - first) / maximumSamples));
  const frames = new Set(clip.timeline.map((key) => key.frame));
  for (let frame = first; frame <= duration; frame += step) frames.add(frame);
  frames.add(duration);
  return [...frames].sort((a, b) => a - b);
}

export function createStudioBlockingWorkflow(THREE, options) {
  const {
    scene,
    camera,
    getClip,
    getSelectedKeyIndex,
    getMountCalibration,
    onCapture,
  } = options;
  const mount = getMountCalibration();
  const ghosts = {
    previous: createGhostRig(THREE, scene, 'previous', mount),
    next: createGhostRig(THREE, scene, 'next', mount),
  };
  const probe = {
    character: createDefaultCharacter(THREE, {
      lineStyle: { lineOpacity: 0, headOpacity: 0, glowOpacity: 0, contourOpacity: 0, jointOpacity: 0 },
    }),
    sword: createDebugSword(THREE, {
      style: { outlineOpacity: 0, skeletonOpacity: 0, glowOpacity: 0, jointOpacity: 0 },
    }),
  };
  mountDebugSword(probe.character, probe.sword, mount);
  const trajectories = Object.fromEntries(Object.entries(TRAJECTORY_STYLES).map(([id, style]) => [
    id,
    createTrajectory(THREE, scene, id, style),
  ]));
  const scratch = {
    handL: new THREE.Vector3(),
    handR: new THREE.Vector3(),
    swordTip: new THREE.Vector3(),
  };
  let trajectorySampleCount = 0;
  let refreshQueued = false;

  function enabled(id, fallback = true) {
    const control = document.getElementById(id);
    return control ? control.checked : fallback;
  }

  function showGhost(kind, key) {
    const ghost = ghosts[kind];
    const clip = getClip();
    const visible = Boolean(key) && enabled(`blockingGhost${kind === 'previous' ? 'Previous' : 'Next'}`);
    ghost.character.object3d.visible = visible;
    ghost.keyName = visible ? key.name : null;
    if (!visible) return;
    applyMountCalibration(ghost.sword.object3d, getMountCalibration());
    ghost.character.applyPose(clip.poses[key.name]);
    ghost.character.object3d.updateMatrixWorld(true);
    ghost.character.update(0, camera);
    ghost.sword.update();
  }

  function setTrajectoryVisible(visible) {
    Object.values(trajectories).forEach((track) => {
      track.line.visible = visible && track.sampleCount > 1;
      track.keys.visible = visible && track.keyCount > 0;
    });
  }

  function rebuildTrajectories() {
    const clip = getClip();
    const visible = enabled('blockingTrajectories');
    if (!clip?.timeline?.length) {
      setTrajectoryVisible(false);
      return;
    }
    applyMountCalibration(probe.sword.object3d, getMountCalibration());
    const sampled = { handL: [], handR: [], swordTip: [] };
    const keyPoints = { handL: [], handR: [], swordTip: [] };
    const keyFrames = new Set(clip.timeline.map((key) => key.frame));
    const frames = sampleFrames(clip);
    frames.forEach((frame) => {
      const evaluation = evaluateClip(clip, frame);
      probe.character.applyPose(evaluation.pose);
      probe.character.object3d.updateMatrixWorld(true);
      probe.sword.update();
      probe.character.rig.bones['hand.l'].getWorldPosition(scratch.handL);
      probe.character.rig.bones['hand.r'].getWorldPosition(scratch.handR);
      probe.sword.trailTip.getWorldPosition(scratch.swordTip);
      Object.keys(sampled).forEach((id) => {
        const point = scratch[id].clone();
        sampled[id].push(point);
        if (keyFrames.has(frame)) keyPoints[id].push(point.clone());
      });
    });
    Object.keys(trajectories).forEach((id) => {
      const track = trajectories[id];
      replacePoints(track.line, THREE, sampled[id]);
      replacePoints(track.keys, THREE, keyPoints[id]);
      track.sampleCount = sampled[id].length;
      track.keyCount = keyPoints[id].length;
    });
    trajectorySampleCount = frames.length;
    setTrajectoryVisible(visible);
  }

  function refresh() {
    const clip = getClip();
    if (!clip?.timeline?.length) return;
    const index = Math.max(0, Math.min(getSelectedKeyIndex(), clip.timeline.length - 1));
    showGhost('previous', clip.timeline[index - 1]);
    showGhost('next', clip.timeline[index + 1]);
    rebuildTrajectories();
    const status = document.getElementById('blockingStatus');
    if (status) {
      const previous = clip.timeline[index - 1]?.name || '—';
      const next = clip.timeline[index + 1]?.name || '—';
      status.textContent = `Selected ${clip.timeline[index].name} · ghost ${previous} ← / → ${next} · ${trajectorySampleCount} path samples`;
    }
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function update() {
    Object.values(ghosts).forEach((ghost) => {
      if (!ghost.character.object3d.visible) return;
      ghost.character.update(0, camera);
      ghost.sword.update();
    });
  }

  ['blockingGhostPrevious', 'blockingGhostNext', 'blockingTrajectories'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', refresh);
  });
  document.getElementById('captureNextKey')?.addEventListener('click', () => {
    const step = boundedFrameStep(document.getElementById('blockingFrameStep')?.value);
    onCapture?.(step);
  });

  return {
    refresh,
    scheduleRefresh,
    update,
    setStatus(message, error = false) {
      const status = document.getElementById('blockingStatus');
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('error', error);
    },
    get diagnostics() {
      return {
        previousKey: ghosts.previous.keyName,
        nextKey: ghosts.next.keyName,
        trajectorySampleCount,
        trajectories: Object.fromEntries(Object.entries(trajectories).map(([id, track]) => [id, {
          label: TRAJECTORY_STYLES[id].label,
          samples: track.sampleCount,
          keys: track.keyCount,
          visible: track.line.visible,
        }])),
      };
    },
  };
}
