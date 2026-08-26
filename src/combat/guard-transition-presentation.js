import { LONGSWORD_GUARD_BASE, LONGSWORD_GUARD_AUTHORING_STATE } from './longsword-guard-metadata.js';

export const GUARD_TRANSITION_PROFILE_IDS = Object.freeze({
  ENTER: 'longsword_guard_enter_v1',
  RECOVER: 'longsword_guard_recover_v1',
  EXIT: 'longsword_guard_exit_v1',
});

export const LONGSWORD_GUARD_TRANSITION_PROFILES = Object.freeze({
  guard_enter: Object.freeze({
    id: GUARD_TRANSITION_PROFILE_IDS.ENTER,
    state: 'guard_enter',
    durationMs: 180,
    curve: 'ease-out-cubic',
    clipId: LONGSWORD_GUARD_BASE.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    inPlace: true,
    loop: true,
    from: Object.freeze({ holdWeight: 0, correctionWeight: 0, reactionOverlayWeight: 0 }),
    to: Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 0 }),
    completionEvent: 'enter_complete',
  }),
  guard_recover: Object.freeze({
    id: GUARD_TRANSITION_PROFILE_IDS.RECOVER,
    state: 'guard_recover',
    durationMs: 140,
    curve: 'ease-out-cubic',
    clipId: LONGSWORD_GUARD_BASE.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    inPlace: true,
    loop: true,
    from: Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 1 }),
    to: Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 0 }),
    completionEvent: 'recover_complete',
  }),
  guard_exit: Object.freeze({
    id: GUARD_TRANSITION_PROFILE_IDS.EXIT,
    state: 'guard_exit',
    durationMs: 160,
    curve: 'ease-in-cubic',
    clipId: LONGSWORD_GUARD_BASE.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    inPlace: true,
    loop: true,
    from: Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 0 }),
    to: Object.freeze({ holdWeight: 0, correctionWeight: 0, reactionOverlayWeight: 0 }),
    completionEvent: 'exit_complete',
  }),
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function sampleGuardTransitionCurve(curve, progress) {
  const t = clamp01(progress);
  if (curve === 'ease-out-cubic') return 1 - ((1 - t) ** 3);
  if (curve === 'ease-in-cubic') return t ** 3;
  if (curve === 'smoothstep') return t * t * (3 - 2 * t);
  return t;
}

function lerp(from, to, weight) {
  return from + (to - from) * weight;
}

export function getGuardTransitionProfile(state) {
  return LONGSWORD_GUARD_TRANSITION_PROFILES[String(state || '')] || null;
}

export function sampleGuardTransitionProfile(state, elapsedMs) {
  const profile = getGuardTransitionProfile(state);
  if (!profile) return null;
  const durationMs = Math.max(1, Number(profile.durationMs) || 1);
  const progress = clamp01((Number(elapsedMs) || 0) / durationMs);
  const eased = sampleGuardTransitionCurve(profile.curve, progress);
  const weights = Object.freeze({
    holdWeight: lerp(profile.from.holdWeight, profile.to.holdWeight, eased),
    correctionWeight: lerp(profile.from.correctionWeight, profile.to.correctionWeight, eased),
    reactionOverlayWeight: lerp(profile.from.reactionOverlayWeight, profile.to.reactionOverlayWeight, eased),
  });
  return Object.freeze({
    profile,
    progress,
    eased,
    complete: progress >= 1,
    weights,
    completionEvent: profile.completionEvent,
  });
}

export function getStableGuardPresentationWeights(state) {
  if (state === 'guard_hold') {
    return Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 0 });
  }
  if (state === 'guard_block_hit' || state === 'guard_parry' || state === 'guard_counter') {
    return Object.freeze({ holdWeight: 1, correctionWeight: 1, reactionOverlayWeight: 1 });
  }
  if (state === 'neutral') {
    return Object.freeze({ holdWeight: 0, correctionWeight: 0, reactionOverlayWeight: 0 });
  }
  return Object.freeze({ holdWeight: 0, correctionWeight: 0, reactionOverlayWeight: 0 });
}

export function sampleGuardPresentationWeights(state, elapsedMs = 0) {
  return sampleGuardTransitionProfile(state, elapsedMs)?.weights || getStableGuardPresentationWeights(state);
}
