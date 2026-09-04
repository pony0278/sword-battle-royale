import { createDefaultCharacter } from '../../src/character/default-character.js';
import { createDebugSword, mountDebugSword } from '../../src/character/debug-sword.js';
import { DEFAULT_KAYKIT_SWORD_MOUNT } from '../../src/character/default-character-mount.js';
import { applyMountCalibration, normalizeMountCalibration } from '../../src/character/character-sockets.js';
import { POSE_KEYS } from '../../src/animation/pose-schema.js';
import { normalizePose } from '../../src/animation/pose-utils.js';
import { createAnimationClip } from '../../src/animation/animation-clip.js';
import { ActionMotionPlayer } from '../../src/animation/action-motion-player.js';
import { ACTION_TEMPLATE_FACTORIES } from '../../src/animation/action-templates.js';
import { createActionDefinition, isFrameInWindow } from '../../src/combat/action-definition.js';
import { createStudioPreviewRuntime } from './studio-preview-runtime.js';
import { createStudioCombatFeelController } from './studio-combat-feel-controller.js';
import { createWholeBodyMotionGuideOverlay } from './studio-motion-guide-overlay.js';
import { createStudioMotionGuideEditor } from './studio-motion-guide-editor.js';
import { bakeStudioMotionConstraints } from './studio-motion-constraint-baker.js';
import { createStudioPoseDragController } from './studio-pose-drag-controller.js';
import { captureNextBlockingKey, createStudioBlockingWorkflow } from './studio-blocking-workflow.js';
import { createStudioProjectIoController } from './studio-project-io-controller.js';
import { createStudioExternalAnimationController } from './studio-external-animation-controller.js';
import {
  renderComboQueueView,
  renderAnimationBindingView,
  renderKeyEditorView,
  renderLibraryView,
  renderMountEditorView,
  renderPoseControlsView,
  renderTimelineView,
  renderWindowEditorView,
  updateTimelineReadoutView,
} from './studio-editor-view.js';
import {
  buildComboProjectData,
  cloneSerializable,
  createStudioProject,
  readStoredJson,
  writeStoredJson,
} from './studio-project.js';

const THREE = window.THREE;
if (!THREE) throw new Error('Action Studio requires Three.js r128');

const LIBRARY_KEY = 'ACTION_STUDIO_CLIP_LIBRARY_V1';
const MOUNT_KEY = 'ACTION_STUDIO_KAYKIT_SWORD_MOUNT_V2';
const DEG_TO_RAD = Math.PI / 180;

const canvas = document.getElementById('stageCanvas');
const character = createDefaultCharacter(THREE);
const sword = createDebugSword(THREE);
let mountCalibration = loadMountCalibration();
mountDebugSword(character, sword, mountCalibration);
const preview = createStudioPreviewRuntime(THREE, {
  canvas,
  character,
  sword,
  impactFlash: document.getElementById('impactFlash'),
  isDummyEnabled: () => document.getElementById('dummyToggle').checked,
});
const combatFeelController = createStudioCombatFeelController(preview);

const player = new ActionMotionPlayer({
  adapter: {
    applyPose: (pose) => character.applyPose(pose),
    stopAnimation: () => character.stopAnimation(),
    hasAnimation: (name) => character.hasAnimation(name),
    getAnimationDuration: (name) => character.getAnimationDuration(name),
    sampleAnimation: (name, timeSeconds, options) => character.sampleAnimation(name, timeSeconds, options),
  },
});
let animationSource = 'authored';
let externalAnimations = null;
let clip = null;
let action = null;
let selectedKeyIndex = 0;
let loopEnabled = false;
let slowEnabled = false;
let comboQueue = [];
let lastTick = performance.now();
let previousPlaybackFrame = 0;
let blockingWorkflow = null, projectIo = null;
const motionGuideOverlay = createWholeBodyMotionGuideOverlay(THREE, { scene: preview.scene, camera: preview.camera, canvas, character, sword });
const motionGuideEditor = createStudioMotionGuideEditor({
  overlay: motionGuideOverlay, applyProject: (project, options) => { setProject(project, options); projectIo?.saveAutosave('motion guide bake'); },
  bakeProject: (project, guide) => bakeStudioMotionConstraints(project, { character, sword, guide }),
  getFrame: () => player.frame, onStatus: (message, error) => setIoStatus(message, error),
});

const poseDragController = createStudioPoseDragController(THREE, {
  scene: preview.scene,
  camera: preview.camera,
  canvas,
  character,
  prepareDrag: () => {
    const keyframe = clip.timeline[selectedKeyIndex];
    player.pause();
    if (action.animationBinding.source !== 'authored') {
      action = createActionDefinition({
        ...action,
        animationBinding: { source: 'authored', clipId: clip.id },
      }, clip.durationFrames);
      player.setAction(action);
      renderAnimationBinding();
    }
    player.seek(keyframe.frame);
    previousPlaybackFrame = player.frame;
    applyEvaluation(player.evaluate());
    updatePlaybackButtons();
    return { pose: clip.poses[keyframe.name], keyName: keyframe.name, frame: keyframe.frame };
  },
  applyPose: (pose, context) => {
    clip.poses[context.keyName] = normalizePose(pose);
    player.pause();
    player.seek(context.frame);
    previousPlaybackFrame = player.frame;
    applyEvaluation(player.evaluate());
  },
  finishDrag: (_pose, context) => {
    renderPoseControls();
    updatePlaybackButtons();
    setIoStatus(`Direct Pose baked into ${context.keyName}.`);
    projectIo?.saveAutosave(`Direct Pose · ${context.keyName}`);
    blockingWorkflow?.refresh();
  },
});

blockingWorkflow = createStudioBlockingWorkflow(THREE, {
  scene: preview.scene,
  camera: preview.camera,
  getClip: () => clip,
  getSelectedKeyIndex: () => selectedKeyIndex,
  getMountCalibration: () => mountCalibration,
  onCapture: (frameStep) => {
    const current = clip.timeline[selectedKeyIndex];
    const captured = captureNextBlockingKey(clip, selectedKeyIndex, clip.poses[current.name], { frameStep });
    rebuildClip(captured.name, captured.frame);
    projectIo?.saveAutosave(`Capture Next Key · ${captured.name}`);
    projectIo?.syncText();
    blockingWorkflow.setStatus(`Captured ${captured.name} at ${captured.frame}f · ready to drag the next pose.`);
  },
});
function loadMountCalibration() {
  return normalizeMountCalibration(readStoredJson(localStorage, MOUNT_KEY, DEFAULT_KAYKIT_SWORD_MOUNT));
}

function currentProject() {
  return createStudioProject({ clip, action, weaponMount: mountCalibration });
}

function setProject(project, options = {}) {
  character.stopAnimation();
  clip = createAnimationClip(project.clip || project);
  action = createActionDefinition(project.action || {
    id: clip.id,
    clipId: clip.id,
    category: 'custom',
  }, clip.durationFrames);
  if (project.weaponMount) {
    mountCalibration = normalizeMountCalibration(project.weaponMount);
    applyMountCalibration(sword.object3d, mountCalibration);
  }
  player.setProject(clip, action);
  player.loop = loopEnabled;
  player.speed = slowEnabled ? 0.25 : 1;
  const requestedFrame = Number(options.seekFrame);
  const initialFrame = Number.isFinite(requestedFrame) ? Math.max(0, Math.min(requestedFrame, clip.durationFrames)) : 0;
  player.seek(initialFrame);
  selectedKeyIndex = clip.timeline.reduce((closest, key, index) => (
    Math.abs(key.frame - initialFrame) < Math.abs(clip.timeline[closest].frame - initialFrame) ? index : closest
  ), 0);
  previousPlaybackFrame = initialFrame;
  clearWeaponTrail();
  motionGuideEditor.setClip(clip);
  renderEditor();
  applyEvaluation(player.evaluate());
  if (action.animationBinding.source !== 'authored' && !externalAnimations.hasLoaded(action.animationBinding.source)) {
    externalAnimations.ensureBinding(action.animationBinding)
      .then(() => { renderAnimationBinding(); applyEvaluation(player.evaluate()); })
      .catch((error) => externalAnimations.setStatus(error.message, true));
  }
  if (options.autoplay) {
    player.play({ restart: true });
    updatePlaybackButtons();
  }
}

function loadTemplate(id, autoplay = false) {
  const factory = ACTION_TEMPLATE_FACTORIES[id];
  if (!factory) return;
  setProject(factory(), { autoplay });
}

function renderAnimationBinding() {
  if (!action) return;
  const binding = action.animationBinding;
  renderAnimationBindingView({
    action,
    clip,
    available: externalAnimations?.isAvailable(binding) || false,
  });
}

function setAnimationBinding(binding) {
  action = createActionDefinition({ ...action, animationBinding: binding }, clip.durationFrames);
  player.setAction(action);
  player.pause();
  applyEvaluation(player.evaluate());
  renderAnimationBinding();
  updatePlaybackButtons();
}

externalAnimations = createStudioExternalAnimationController({
  THREE, character,
  getAction: () => action, getClip: () => clip,
  setBinding: setAnimationBinding,
  pausePlayer: () => player.pause(),
  applyCurrentEvaluation: () => applyEvaluation(player.evaluate()),
  clearWeaponTrail,
  updatePlaybackButtons,
  setAnimationSource: (source) => { animationSource = source; },
  renderBinding: renderAnimationBinding,
});

function rebuildClip(selectedName, seekFrame) {
  clip = createAnimationClip({
    ...clip,
    timeline: clip.timeline,
    poses: clip.poses,
  });
  action = createActionDefinition(action, clip.durationFrames);
  player.setProject(clip, action);
  player.loop = loopEnabled;
  player.speed = slowEnabled ? 0.25 : 1;
  selectedKeyIndex = Math.max(0, clip.timeline.findIndex((key) => key.name === selectedName));
  const targetFrame = Number.isFinite(Number(seekFrame)) ? Number(seekFrame) : clip.timeline[selectedKeyIndex].frame;
  player.seek(targetFrame);
  previousPlaybackFrame = player.frame;
  clearWeaponTrail();
  renderEditor();
  applyEvaluation(player.evaluate());
}

function renderEditor() {
  renderTimeline();
  renderKeyEditor();
  renderPoseControls();
  renderWindowEditor();
  renderMountEditor();
  renderLibrary();
  renderComboQueue();
  renderAnimationBinding();
  document.getElementById('clipNow').textContent = clip.name.toUpperCase();
  document.getElementById('libraryName').value = clip.id;
  document.getElementById('poseAxisSummary').textContent = `${POSE_KEYS.length} axes from POSE_KEYS`;
  blockingWorkflow?.refresh();
}

function renderTimeline() {
  renderTimelineView({ clip, frame: player.frame, selectedKeyIndex, onSelect: selectKey });
}

function selectKey(index) {
  selectedKeyIndex = Math.max(0, Math.min(index, clip.timeline.length - 1));
  const key = clip.timeline[selectedKeyIndex];
  player.pause();
  player.seek(key.frame);
  previousPlaybackFrame = player.frame;
  renderTimeline();
  renderKeyEditor();
  renderPoseControls();
  applyEvaluation(player.evaluate());
  updatePlaybackButtons();
  blockingWorkflow.refresh();
}

function renderKeyEditor() {
  renderKeyEditorView(clip, selectedKeyIndex);
}

function renderPoseControls() {
  renderPoseControlsView({
    clip,
    selectedKeyIndex,
    onInput: ({ keyframe, poseKey, value }) => {
      clip.poses[keyframe.name][poseKey] = value;
      player.pause();
      player.seek(keyframe.frame);
      applyEvaluation(player.evaluate());
      previousPlaybackFrame = player.frame;
      updatePlaybackButtons();
      blockingWorkflow.scheduleRefresh();
      projectIo.scheduleAutosave(`Pose slider · ${keyframe.name}`);
    },
  });
}

function renderWindowEditor() {
  renderWindowEditorView({
    action,
    clip,
    onChange: ({ type, enabled, startFrame, endFrame, label }) => {
      const windows = cloneSerializable(action.windows);
      windows[type] = enabled ? [{ startFrame, endFrame, label }] : [];
      action = createActionDefinition({ ...action, windows }, clip.durationFrames);
      player.setAction(action);
      projectIo.scheduleAutosave(`Action window · ${type}`);
    },
  });
}

function renderMountEditor() {
  renderMountEditorView({
    mountCalibration,
    onChange: ({ label, axis, raw }) => {
      if (label === 'position') mountCalibration.position[axis] = raw;
      else if (label === 'rotation °') mountCalibration.rotation[axis] = raw * DEG_TO_RAD;
      else mountCalibration.scale[axis] = Math.max(0.01, raw);
      mountCalibration = normalizeMountCalibration(mountCalibration);
      applyMountCalibration(sword.object3d, mountCalibration);
      document.getElementById('socketStatus').textContent = 'attached · unsaved';
      blockingWorkflow.scheduleRefresh();
      projectIo.scheduleAutosave('Weapon mount');
    },
  });
}

function updateTimelineReadout() {
  updateTimelineReadoutView(clip, player.frame);
}

function applyEvaluation(evaluation) {
  if (!evaluation) return;
  const applied = player.apply(evaluation);
  animationSource = applied.motion.pending ? 'authored-fallback' : applied.motion.appliedSource;
  const motionLabel = applied.motion.appliedSource === 'authored'
    ? ''
    : ` · ${applied.motion.appliedSource.toUpperCase()} BOUND`;
  document.getElementById('phaseNow').textContent = `${evaluation.to.toUpperCase()} · ${evaluation.frame.toFixed(1)}F${motionLabel}`;
  updateTimelineReadout();
  return applied;
}

function clearWeaponTrail() {
  preview.clearWeaponTrail();
}

function recordWeaponTrail(frame) {
  preview.recordWeaponTrail(isFrameInWindow(action, 'weaponTrail', frame));
}

function triggerImpactPreview() {
  preview.triggerImpact();
}

function crossedImpact(previousFrame, currentFrame) {
  if (currentFrame < previousFrame) return false;
  return clip.timeline.some((key) => key.impact && key.frame > previousFrame && key.frame <= currentFrame);
}

function updatePlaybackButtons() {
  document.getElementById('playToggle').textContent = player.playing ? '❚❚ Pause' : '▶ Play';
  document.getElementById('slowToggle').classList.toggle('on', slowEnabled);
  document.getElementById('loopToggle').classList.toggle('on', loopEnabled);
}

function readLibrary() {
  return readStoredJson(localStorage, LIBRARY_KEY, {});
}

function writeLibrary(library) {
  writeStoredJson(localStorage, LIBRARY_KEY, library);
}

function renderLibrary() {
  const library = readLibrary();
  renderLibraryView({
    library,
    onLoad: (_name, project) => setProject(project),
    onQueue: (name, project) => {
      comboQueue.push({ name, project: cloneSerializable(project) });
      renderComboQueue();
    },
    onDelete: (name) => {
      const latest = readLibrary();
      delete latest[name];
      writeLibrary(latest);
      renderLibrary();
    },
  });
}

function renderComboQueue() {
  renderComboQueueView(comboQueue);
}

function buildComboProject(queue) {
  return buildComboProjectData(queue, mountCalibration);
}

function setIoStatus(message, error = false) {
  const status = document.getElementById('ioStatus');
  status.textContent = message;
  status.style.color = error ? 'var(--impact)' : 'var(--cyan)';
}

projectIo = createStudioProjectIoController({
  getProject: currentProject,
  applyProject: setProject,
  onStatus: setIoStatus,
});

function bindV3AppearanceToggle(buttonId, setter) {
  const button = document.getElementById(buttonId);
  button.addEventListener('click', () => {
    const visible = !button.classList.contains('on');
    button.classList.toggle('on', visible);
    setter(visible);
  });
}

bindV3AppearanceToggle('toggleRigNodes', (visible) => {
  character.setRigNodesVisible(visible);
  sword.setNodesVisible(visible);
});
bindV3AppearanceToggle('toggleRigGlow', (visible) => {
  character.setRigGlowVisible(visible);
  sword.setGlowVisible(visible);
});

document.getElementById('showTPose').addEventListener('click', () => loadTemplate('t_pose'));
document.getElementById('showIdle').addEventListener('click', () => loadTemplate('idle'));
document.getElementById('playSlash').addEventListener('click', () => loadTemplate('slash_test', true));
document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => loadTemplate(button.dataset.template));
});
document.getElementById('playToggle').addEventListener('click', () => {
  if (player.playing) player.pause();
  else {
    if (player.frame >= clip.durationFrames) player.seek(0);
    previousPlaybackFrame = player.frame;
    if (player.frame === 0) clearWeaponTrail();
    player.play();
  }
  updatePlaybackButtons();
});
document.getElementById('slowToggle').addEventListener('click', () => {
  slowEnabled = !slowEnabled;
  player.speed = slowEnabled ? 0.25 : 1;
  updatePlaybackButtons();
});
document.getElementById('loopToggle').addEventListener('click', () => {
  loopEnabled = !loopEnabled;
  player.loop = loopEnabled;
  updatePlaybackButtons();
});
document.getElementById('gameCamera').addEventListener('click', () => {
  const gameCameraOn = preview.toggleGameCamera();
  document.getElementById('gameCamera').classList.toggle('on', gameCameraOn);
});
document.getElementById('timelineScrub').addEventListener('input', (event) => {
  player.pause();
  player.seek(Number(event.target.value));
  previousPlaybackFrame = player.frame;
  clearWeaponTrail();
  applyEvaluation(player.evaluate());
  updatePlaybackButtons();
});
document.getElementById('applyKey').addEventListener('click', () => {
  const key = clip.timeline[selectedKeyIndex];
  const oldName = key.name;
  const desiredName = document.getElementById('keyName').value.trim() || oldName;
  if (desiredName !== oldName && clip.timeline.some((entry) => entry.name === desiredName)) {
    setIoStatus(`Key name already exists: ${desiredName}`, true);
    return;
  }
  if (desiredName !== oldName) {
    clip.poses[desiredName] = clip.poses[oldName];
    delete clip.poses[oldName];
    key.name = desiredName;
  }
  key.frame = Math.max(0, Math.round(Number(document.getElementById('keyFrame').value) || 0));
  key.ease = document.getElementById('keyEase').value;
  key.tag = document.getElementById('keyTag').value;
  key.impact = document.getElementById('keyImpact').checked;
  key.cancel = document.getElementById('keyCancel').checked;
  rebuildClip(desiredName);
  projectIo.saveAutosave(`Key data · ${desiredName}`);
});
document.getElementById('addKey').addEventListener('click', () => {
  const current = clip.timeline[selectedKeyIndex];
  let frame = current.frame + 4;
  const next = clip.timeline[selectedKeyIndex + 1];
  if (next && next.frame - current.frame > 1) frame = Math.floor((next.frame + current.frame) / 2);
  else clip.timeline.forEach((key) => { if (key.frame >= frame) key.frame += 4; });
  const name = `key_${frame}`;
  clip.timeline.push({ name, frame, ease: 'out', tag: 'custom' });
  clip.poses[name] = normalizePose(clip.poses[current.name]);
  rebuildClip(name, frame);
  projectIo.saveAutosave(`Add Key · ${name}`);
});
document.getElementById('duplicateKey').addEventListener('click', () => {
  const current = clip.timeline[selectedKeyIndex];
  const nameRoot = `${current.name}_copy`;
  let name = nameRoot;
  let index = 2;
  while (clip.poses[name]) name = `${nameRoot}_${index++}`;
  const frame = current.frame + 3;
  clip.timeline.forEach((key) => { if (key.frame >= frame) key.frame += 3; });
  clip.timeline.push({ ...current, name, frame, impact: false, cancel: false });
  clip.poses[name] = normalizePose(clip.poses[current.name]);
  rebuildClip(name, frame);
  projectIo.saveAutosave(`Duplicate Key · ${name}`);
});
document.getElementById('deleteKey').addEventListener('click', () => {
  if (clip.timeline.length <= 1) return;
  const [removed] = clip.timeline.splice(selectedKeyIndex, 1);
  delete clip.poses[removed.name];
  const next = clip.timeline[Math.max(0, selectedKeyIndex - 1)];
  rebuildClip(next.name, next.frame);
  projectIo.saveAutosave(`Delete Key · ${removed.name}`);
});
document.getElementById('saveMount').addEventListener('click', () => {
  localStorage.setItem(MOUNT_KEY, JSON.stringify(mountCalibration));
  document.getElementById('socketStatus').textContent = 'attached · saved';
});
document.getElementById('resetMount').addEventListener('click', () => {
  mountCalibration = normalizeMountCalibration(DEFAULT_KAYKIT_SWORD_MOUNT);
  applyMountCalibration(sword.object3d, mountCalibration);
  localStorage.removeItem(MOUNT_KEY);
  renderMountEditor();
  document.getElementById('socketStatus').textContent = 'attached · reset';
});

[['hitstop', 'hitstopValue', 'hitstop', (value) => `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}s`],
 ['shake', 'shakeValue', 'shake', (value) => value.toFixed(2)],
 ['knockback', 'knockbackValue', 'knockback', (value) => value.toFixed(2)]].forEach(([id, outputId, key, format]) => {
  document.getElementById(id).addEventListener('input', (event) => {
    const value = preview.setFeel(key, event.target.value);
    document.getElementById(outputId).textContent = format(value);
  });
});
document.getElementById('saveClip').addEventListener('click', () => {
  const name = document.getElementById('libraryName').value.trim() || clip.id;
  const library = readLibrary();
  library[name] = currentProject();
  writeLibrary(library);
  renderLibrary();
  setIoStatus(`Saved ${name} to the local clip library.`);
  projectIo.saveAutosave(`Save library clip · ${name}`);
});
document.getElementById('playCombo').addEventListener('click', () => {
  if (!comboQueue.length) {
    setIoStatus('Add one or more library clips to the combo queue first.', true);
    return;
  }
  setProject(buildComboProject(comboQueue), { autoplay: true });
});
document.getElementById('clearCombo').addEventListener('click', () => {
  comboQueue = [];
  renderComboQueue();
});

function tick(now) {
  const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastTick) / 1000));
  lastTick = now;
  let evaluation = player.evaluate();
  if (player.playing) {
    if (!preview.consumeHitstop(deltaSeconds)) {
      const before = player.frame;
      evaluation = player.update(deltaSeconds);
      const after = player.frame;
      if (after < before) {
        previousPlaybackFrame = 0;
        clearWeaponTrail();
      }
      if (crossedImpact(previousPlaybackFrame, after)) triggerImpactPreview();
      previousPlaybackFrame = after;
    }
    applyEvaluation(evaluation);
    character.object3d.updateMatrixWorld(true);
    recordWeaponTrail(player.frame);
    if (!player.playing) updatePlaybackButtons();
  }
  character.update(deltaSeconds, preview.camera);
  poseDragController.update();
  motionGuideOverlay.update();
  sword.update();
  blockingWorkflow.update();
  preview.update(deltaSeconds);
  preview.advanceShake(deltaSeconds);
  preview.render();
  requestAnimationFrame(tick);
}

window.addEventListener('resize', preview.resize);
window.__actionStudio = {
  get clip() { return clip; },
  get action() { return action; },
  get project() { return currentProject(); },
  get sockets() { return Object.keys(character.sockets); },
  get handRWeaponAttached() { return sword.object3d.parent === character.sockets.HAND_R; },
  get characterRigId() { return character.rig.definition.id; },
  get proceduralBoneCount() { return Object.keys(character.rig.bones).length; },
  get weaponRigId() { return sword.definition.id; },
  get weaponBoneCount() { return Object.keys(sword.bones).length; },
  get weaponSockets() { return Object.keys(sword.sockets); },
  get weaponSweepSegment() {
    const { start, end } = sword.getSweepSegment();
    return { start: start.toArray(), end: end.toArray() };
  },
  get animationSource() { return animationSource; },
  get combatFeelProfile() { return preview.activeFeelProfile; },
  applyCombatFeelProfile: (slot) => combatFeelController.applyProfile(slot),
  get motionGuide() { return motionGuideEditor.guide; },
  get motionGuideDirty() { return motionGuideEditor.dirty; },
  get motionGuideDiagnostics() { return motionGuideOverlay.diagnostics; },
  get motionConstraintReport() { return motionGuideEditor.constraintReport; },
  get poseDragEffector() { return poseDragController.dragging; },
  get poseDragDiagnostics() { return poseDragController.diagnostics; },
  get blockingDiagnostics() { return blockingWorkflow.diagnostics; },
  get renderStyle() { return 'v3-rig-line'; },
  loadKayKitRuntime: () => externalAnimations.load('kaykit'),
  loadUal1Runtime: () => externalAnimations.load('ual1'),
  loadUal2Runtime: () => externalAnimations.load('ual2'),
  playKayKitClip: (name, options = {}) => externalAnimations.playClip('kaykit', name, options),
  playUal1Clip: (name, options = {}) => externalAnimations.playClip('ual1', name, options),
  playUal2Clip: (name, options = {}) => externalAnimations.playClip('ual2', name, options),
  get loadedAnimationSources() { return [...externalAnimations.libraries.keys()]; },
  get legacyScriptsLoaded() {
    return [...document.scripts].map((script) => script.src).filter((src) => /\/ps\//.test(src));
  },
  seek(frame) { player.seek(frame); applyEvaluation(player.evaluate()); return player.evaluate(); },
  loadTemplate,
};

preview.resize();
loadTemplate('slash_test');
updatePlaybackButtons();
requestAnimationFrame(tick);
