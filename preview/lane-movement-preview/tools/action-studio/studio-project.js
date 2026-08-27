import { createAnimationClip } from '../../src/animation/animation-clip.js';
import {
  ACTION_WINDOW_TYPES,
  createActionDefinition,
} from '../../src/combat/action-definition.js';

export const ACTION_STUDIO_PROJECT_FORMAT = 'action-studio-project';

export function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createStudioProject({ clip, action, weaponMount }) {
  return {
    format: ACTION_STUDIO_PROJECT_FORMAT,
    version: 1,
    clip: cloneSerializable(clip),
    action: cloneSerializable(action),
    weaponMount: cloneSerializable(weaponMount),
  };
}

export function serializeStudioProject(project) {
  return JSON.stringify(project, null, 2);
}

export function studioProjectFilename(project, date = new Date()) {
  const source = project?.clip?.id || project?.clip?.name || project?.action?.id || 'action-studio-project';
  const safeName = String(source)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'action-studio-project';
  const stamp = date instanceof Date && Number.isFinite(date.getTime())
    ? date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    : 'snapshot';
  return `${safeName}_${stamp}.json`;
}

export function createStudioAutosave(project, reason = 'edit', savedAt = new Date().toISOString()) {
  return {
    format: 'action-studio-autosave',
    version: 1,
    savedAt,
    reason: String(reason || 'edit'),
    project: cloneSerializable(project),
  };
}

export function readStoredJson(storage, key, fallback) {
  try {
    const stored = JSON.parse(storage.getItem(key) || 'null');
    return stored == null ? fallback : stored;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
  return value;
}

export function buildComboProjectData(queue, weaponMount) {
  const timeline = [];
  const poses = {};
  const windows = Object.fromEntries(ACTION_WINDOW_TYPES.map((type) => [type, []]));
  let endFrame = 0;

  queue.forEach((entry, clipIndex) => {
    const sourceClip = createAnimationClip(entry.project.clip);
    const sourceAction = createActionDefinition(entry.project.action, sourceClip.durationFrames);
    const firstFrame = sourceClip.timeline[0].frame;
    const offset = clipIndex === 0 ? -firstFrame : endFrame + 4 - firstFrame;
    sourceClip.timeline.forEach((key) => {
      const name = `combo_${clipIndex + 1}_${key.name}`;
      timeline.push({ ...key, name, frame: key.frame + offset });
      poses[name] = sourceClip.poses[key.name];
    });
    ACTION_WINDOW_TYPES.forEach((type) => {
      sourceAction.windows[type].forEach((window) => windows[type].push({
        ...window,
        startFrame: window.startFrame + offset,
        endFrame: window.endFrame + offset,
      }));
    });
    endFrame = sourceClip.durationFrames + offset;
  });

  const comboClip = createAnimationClip({ id: 'combo_preview', name: 'Combo Preview', timeline, poses });
  return {
    clip: comboClip,
    action: createActionDefinition({
      id: comboClip.id,
      clipId: comboClip.id,
      category: 'combo-preview',
      windows,
    }, comboClip.durationFrames),
    weaponMount: cloneSerializable(weaponMount),
  };
}
