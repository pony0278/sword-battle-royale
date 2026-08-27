import { createAnimationClip } from './animation-clip.js';
import { createAdvancingVerticalChopGuide } from './motion-guide-schema.js';
import { normalizePose } from './pose-utils.js';
import {
  advancingVerticalChopFrames,
  bakeAdvancingVerticalChopClip,
} from './whole-body-motion-solver.js';
import { createActionDefinition } from '../combat/action-definition.js';

export const T_POSE = Object.freeze(normalizePose({ aL_sz: 90, aR_sz: 90 }));

export const IDLE_POSE = Object.freeze(normalizePose({
  squat: 18,
  spine_x: 4,
  head_y: 7,
  head_x: 2,
  aL_sx: -18,
  aL_sy: -8,
  aL_sz: 14,
  aL_ex: 54,
  aR_sx: -28,
  aR_sy: 18,
  aR_sz: 10,
  aR_ex: 62,
  aR_wy: 12,
  lL_hx: -10,
  lL_hz: 8,
  lL_kx: 15,
  lR_hx: -10,
  lR_hz: 8,
  lR_kx: 15,
}));

function makeTemplate(input, actionInput) {
  const clip = createAnimationClip(input);
  const action = createActionDefinition({ ...actionInput, id: clip.id, clipId: clip.id }, clip.durationFrames);
  return { clip, action };
}

export function createTPoseTemplate() {
  return makeTemplate({
    id: 't_pose',
    name: 'T-Pose',
    timeline: [{ name: 't_pose', frame: 0, tag: 'reference' }],
    poses: { t_pose: T_POSE },
  }, { category: 'reference' });
}

export function createIdleTemplate() {
  return makeTemplate({
    id: 'idle',
    name: 'Idle',
    timeline: [{ name: 'idle', frame: 0, tag: 'idle' }],
    poses: { idle: IDLE_POSE },
  }, { category: 'idle' });
}

export function createSlashTestTemplate() {
  const ready = normalizePose({ ...IDLE_POSE, aR_sx: -72, aR_sy: -18, aR_sz: 18, aR_ex: 72, aR_wy: 24 });
  return makeTemplate({
    id: 'slash_test',
    name: 'Slash Test',
    timeline: [
      { name: 'ready', frame: 0, ease: 'lin', tag: 'idle' },
      { name: 'windup', frame: 6, ease: 'out', tag: 'windup' },
      { name: 'slash_start', frame: 10, ease: 'in', tag: 'slash_start' },
      { name: 'slash_active', frame: 14, ease: 'in', tag: 'slash_active', impact: true },
      { name: 'follow_through', frame: 19, ease: 'out', tag: 'follow_through' },
      { name: 'recover', frame: 26, ease: 'out', tag: 'recover', cancel: true },
    ],
    poses: {
      ready,
      windup: { ...ready, root_y: -30, root_x: -4, spine_y: -18, aR_sx: -58, aR_sy: -82, aR_ex: 96, aR_wx: -22, aL_ex: 78 },
      slash_start: { ...ready, root_y: -12, root_x: 3, root_pz: 0.08, spine_y: -8, aR_sx: -90, aR_sy: -52, aR_ex: 42, aR_wy: 34 },
      slash_active: { ...ready, root_y: 26, root_x: 6, root_pz: 0.22, spine_y: 22, aR_sx: -102, aR_sy: 38, aR_ex: 7, aR_wy: -18, aR_wz: 12, lR_hx: 8, lR_kx: 5 },
      follow_through: { ...ready, root_y: 42, root_x: 3, root_pz: 0.18, spine_y: 30, aR_sx: -86, aR_sy: 104, aR_ex: 24, aR_wy: -38 },
      recover: ready,
    },
  }, {
    category: 'attack',
    windows: {
      active: [{ startFrame: 12, endFrame: 15, label: 'suggested hit window' }],
      cancel: [{ startFrame: 22, endFrame: 26, label: 'combo cancel' }],
      movement: [{ startFrame: 8, endFrame: 17, label: 'forward lunge' }],
      weaponTrail: [{ startFrame: 9, endFrame: 19, label: 'sword trail' }],
    },
  });
}

export function createGuardTemplate() {
  const hold = normalizePose({ ...IDLE_POSE, root_y: -5, aR_sx: -104, aR_sy: -12, aR_ex: 92, aR_wx: -25, aL_sx: -88, aL_ex: 96 });
  return makeTemplate({
    id: 'guard',
    name: 'Guard',
    timeline: [
      { name: 'guard_enter', frame: 0, tag: 'guard_enter' },
      { name: 'guard_hold', frame: 7, tag: 'guard_hold' },
      { name: 'guard_exit', frame: 18, tag: 'guard_exit', cancel: true },
    ],
    poses: { guard_enter: IDLE_POSE, guard_hold: hold, guard_exit: IDLE_POSE },
  }, { category: 'guard', windows: { cancel: [{ startFrame: 15, endFrame: 18 }] } });
}

export function createParryTemplate() {
  const contact = normalizePose({ ...IDLE_POSE, root_y: -12, aR_sx: -112, aR_sy: -38, aR_ex: 58, aR_wx: 20, aL_sx: -82, aL_ex: 86 });
  return makeTemplate({
    id: 'parry',
    name: 'Parry',
    timeline: [
      { name: 'parry_start', frame: 0, tag: 'parry_start' },
      { name: 'parry_contact', frame: 5, tag: 'parry_contact', impact: true },
      { name: 'parry_recover', frame: 13, tag: 'parry_recover', cancel: true },
    ],
    poses: { parry_start: IDLE_POSE, parry_contact: contact, parry_recover: IDLE_POSE },
  }, {
    category: 'parry',
    windows: {
      parry: [{ startFrame: 3, endFrame: 6, label: 'suggested perfect-parry window' }],
      cancel: [{ startFrame: 10, endFrame: 13, label: 'counter transition' }],
      weaponTrail: [{ startFrame: 2, endFrame: 7 }],
    },
  });
}

export function createCounterTemplate() {
  const strike = normalizePose({ ...IDLE_POSE, root_y: 22, root_pz: 0.24, aR_sx: -106, aR_sy: 32, aR_ex: 4, aR_wy: -20 });
  return makeTemplate({
    id: 'counter',
    name: 'Counter',
    timeline: [
      { name: 'counter_start', frame: 0, tag: 'counter_start' },
      { name: 'counter_strike', frame: 6, tag: 'counter_strike' },
      { name: 'counter_impact', frame: 10, tag: 'counter_impact', impact: true },
      { name: 'counter_recover', frame: 18, tag: 'counter_recover', cancel: true },
    ],
    poses: { counter_start: IDLE_POSE, counter_strike: { ...strike, root_y: -8, aR_sy: -42 }, counter_impact: strike, counter_recover: IDLE_POSE },
  }, {
    category: 'counter',
    windows: {
      active: [{ startFrame: 8, endFrame: 11 }],
      cancel: [{ startFrame: 15, endFrame: 18 }],
      weaponTrail: [{ startFrame: 5, endFrame: 12 }],
    },
  });
}

export function createAdvancingVerticalChopTemplate(guideInput = {}) {
  const guide = createAdvancingVerticalChopGuide(guideInput);
  const clip = bakeAdvancingVerticalChopClip(guide);
  const frame = advancingVerticalChopFrames(guide);
  const action = createActionDefinition({
    id: clip.id,
    clipId: clip.id,
    category: 'heavy-attack',
    windows: {
      active: [{ startFrame: frame.impact - 1, endFrame: frame.impact + 2, label: 'vertical chop impact' }],
      cancel: [{ startFrame: frame.follow + 3, endFrame: frame.recover, label: 'recover cancel' }],
      movement: [{ startFrame: frame.commit, endFrame: frame.impact + 1, label: 'advancing step' }],
      weaponTrail: [{ startFrame: frame.commit, endFrame: frame.follow, label: 'vertical sword trail' }],
    },
  }, clip.durationFrames);
  return { clip, action };
}

export const ACTION_TEMPLATE_FACTORIES = Object.freeze({
  t_pose: createTPoseTemplate,
  idle: createIdleTemplate,
  slash_test: createSlashTestTemplate,
  guard: createGuardTemplate,
  parry: createParryTemplate,
  counter: createCounterTemplate,
  advancing_vertical_chop: createAdvancingVerticalChopTemplate,
});

