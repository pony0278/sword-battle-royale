import { normalizeAnimationBinding } from '../animation/animation-binding.js';

export const ACTION_WINDOW_TYPES = Object.freeze([
  'active',
  'cancel',
  'movement',
  'weaponTrail',
  'parry',
]);

export const ACTION_AUTHORITY_NOTE =
  'Authoring hints only. Authoritative combat simulation resolves hit, block, parry and counter outcomes.';

export function normalizeFrameWindow(input = {}, maxFrame = Number.POSITIVE_INFINITY) {
  const rawStart = Number(input.startFrame ?? input.start ?? 0);
  const rawEnd = Number(input.endFrame ?? input.end ?? rawStart);
  const startFrame = Math.max(0, Math.min(Number.isFinite(rawStart) ? rawStart : 0, maxFrame));
  const endFrame = Math.max(startFrame, Math.min(Number.isFinite(rawEnd) ? rawEnd : startFrame, maxFrame));
  return {
    startFrame,
    endFrame,
    label: input.label == null ? '' : String(input.label),
  };
}

export function createActionDefinition(input = {}, maxFrame = Number.POSITIVE_INFINITY) {
  const sourceWindows = input.windows && typeof input.windows === 'object' ? input.windows : {};
  const windows = {};
  for (const type of ACTION_WINDOW_TYPES) {
    const list = Array.isArray(sourceWindows[type]) ? sourceWindows[type] : [];
    windows[type] = list.map((window) => normalizeFrameWindow(window, maxFrame));
  }
  const clipId = String(input.clipId || input.id || 'untitled_action');
  return {
    format: 'action-definition',
    version: 2,
    id: String(input.id || 'untitled_action'),
    clipId,
    category: String(input.category || 'attack'),
    animationBinding: normalizeAnimationBinding(input.animationBinding, clipId),
    windows,
    authority: ACTION_AUTHORITY_NOTE,
  };
}

export function isFrameInWindow(action, type, frame) {
  if (!ACTION_WINDOW_TYPES.includes(type)) return false;
  const value = Number(frame) || 0;
  return action.windows[type].some((window) => value >= window.startFrame && value <= window.endFrame);
}

