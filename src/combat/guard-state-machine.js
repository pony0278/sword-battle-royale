// @ts-check
import {
  LONGSWORD_GUARD_BASE,
  LONGSWORD_GUARD_AUTHORING_STATE,
} from './longsword-guard-metadata.js';
import { GUARD_TRANSITION_PROFILE_IDS } from './guard-transition-presentation.js';
import {
  GUARD_REACTION_VARIANTS,
  LONGSWORD_GUARD_REACTION_PROFILES,
  getGuardReactionProfile,
} from './guard-reaction-presentation.js';
import {
  GUARD_WEAPON_MOUNT_PROFILE_IDS,
  LONGSWORD_GUARD_COUNTER_PROFILE,
} from './guard-counter-presentation.js';

import {
  GUARD_STATES,
  GUARD_EVENTS,
  GUARD_EVENT_AUTHORITY,
  GUARD_TRANSITION_GRAPH,
} from './guard-states.js';

// S1.C2 step 3: the vocabulary and the graph moved to guard-states.js so that step 4's table
// builder can key by GUARD_STATES without importing this module back. Re-exported here because
// thirty-one modules import these names from this path and none of them should have to care.
export { GUARD_STATES, GUARD_EVENTS, GUARD_EVENT_AUTHORITY, GUARD_TRANSITION_GRAPH };

export const GUARD_STATE_AUTHORITY_NOTE =
  'Presentation state only. Authoritative combat simulation confirms block, parry and counter outcomes.';

function authoredGuardTransition(role, transitionProfileId) {
  return Object.freeze({
    role,
    clipId: LONGSWORD_GUARD_BASE.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    transitionProfileId,
    weaponMountProfileId: GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD,
    authored: true,
    authoredStage: 'G3.2',
    inPlace: true,
    loop: true,
  });
}

function authoredGuardReaction(role, profile, extra = {}) {
  return Object.freeze({
    role,
    clipId: profile.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    reactionProfileId: profile.id,
    reactionVariant: profile.variant,
    sourceWindow: profile.sourceWindow,
    counterWindowSeconds: profile.counterWindowSeconds,
    completionEvent: profile.completionEvent,
    weaponMountProfileId: GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD,
    authored: true,
    authoredStage: 'G3.3.2',
    inPlace: true,
    loop: false,
    ...extra,
  });
}

function authoredGuardCounter() {
  const profile = LONGSWORD_GUARD_COUNTER_PROFILE;
  return Object.freeze({
    role: 'guard-counter',
    clipId: profile.clipId,
    counterProfileId: profile.id,
    sourceFamily: profile.sourceFamily,
    completionEvent: profile.completionEvent,
    correctionWeight: profile.correctionWeight,
    weaponMountProfileId: profile.weaponMountProfileId,
    authored: true,
    authoredStage: profile.authoredStage,
    inPlace: profile.inPlace,
    loop: profile.loop,
  });
}

const BLOCK_HIT_PROFILE = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.BLOCK_HIT];
const PARRY_PROFILE = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PARRY];
const PERFECT_PARRY_PROFILE = LONGSWORD_GUARD_REACTION_PROFILES[GUARD_REACTION_VARIANTS.PERFECT_PARRY];

export const LONGSWORD_GUARD_PRESENTATION = Object.freeze({
  [GUARD_STATES.NEUTRAL]: Object.freeze({
    role: 'neutral',
    clipId: null,
    authored: false,
    inPlace: true,
    loop: true,
  }),
  [GUARD_STATES.ENTER]: authoredGuardTransition('guard-enter', GUARD_TRANSITION_PROFILE_IDS.ENTER),
  [GUARD_STATES.HOLD]: Object.freeze({
    role: 'guard-hold',
    clipId: LONGSWORD_GUARD_BASE.clipId,
    correctionLayerId: LONGSWORD_GUARD_BASE.correctionLayerId,
    correctionAuthoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    weaponMountProfileId: GUARD_WEAPON_MOUNT_PROFILE_IDS.SKYRIM_GUARD,
    authored: LONGSWORD_GUARD_AUTHORING_STATE.authored === true,
    authoredStage: LONGSWORD_GUARD_AUTHORING_STATE.authoredStage,
    inPlace: true,
    loop: true,
  }),
  [GUARD_STATES.BLOCK_HIT]: authoredGuardReaction('block-hit', BLOCK_HIT_PROFILE),
  [GUARD_STATES.PARRY]: authoredGuardReaction('parry-reaction', PARRY_PROFILE, {
    variants: Object.freeze({
      [GUARD_REACTION_VARIANTS.PARRY]: Object.freeze({
        clipId: PARRY_PROFILE.clipId,
        reactionProfileId: PARRY_PROFILE.id,
      }),
      [GUARD_REACTION_VARIANTS.PERFECT_PARRY]: Object.freeze({
        clipId: PERFECT_PARRY_PROFILE.clipId,
        reactionProfileId: PERFECT_PARRY_PROFILE.id,
      }),
    }),
  }),
  [GUARD_STATES.COUNTER]: authoredGuardCounter(),
  [GUARD_STATES.RECOVER]: authoredGuardTransition('guard-recover', GUARD_TRANSITION_PROFILE_IDS.RECOVER),
  [GUARD_STATES.EXIT]: authoredGuardTransition('guard-exit', GUARD_TRANSITION_PROFILE_IDS.EXIT),
});

function frozenPayload(payload) {
  if (!payload || typeof payload !== 'object') return Object.freeze({});
  return Object.freeze({ ...payload });
}

function canRecoverIntoConfirmedCounter(lastOutcome) {
  return lastOutcome === 'block' || lastOutcome === 'parry';
}

function resolveDynamicTarget(state, event, guardHeld, lastOutcome) {
  if (state === GUARD_STATES.ENTER && event === GUARD_EVENTS.ENTER_COMPLETE) {
    return guardHeld ? GUARD_STATES.HOLD : GUARD_STATES.EXIT;
  }
  if (state === GUARD_STATES.RECOVER && event === GUARD_EVENTS.COUNTER_CONFIRMED) {
    return canRecoverIntoConfirmedCounter(lastOutcome) ? GUARD_STATES.COUNTER : null;
  }
  if (state === GUARD_STATES.RECOVER && event === GUARD_EVENTS.RECOVER_COMPLETE) {
    return guardHeld ? GUARD_STATES.HOLD : GUARD_STATES.EXIT;
  }
  if (state === GUARD_STATES.EXIT && event === GUARD_EVENTS.EXIT_COMPLETE) {
    return guardHeld ? GUARD_STATES.ENTER : GUARD_STATES.NEUTRAL;
  }
  return GUARD_TRANSITION_GRAPH[state]?.[event] || null;
}

function outcomeForEvent(event) {
  if (event === GUARD_EVENTS.BLOCK_CONFIRMED) return 'block';
  if (event === GUARD_EVENTS.PARRY_CONFIRMED) return 'parry';
  if (event === GUARD_EVENTS.COUNTER_CONFIRMED) return 'counter';
  return null;
}

export function getGuardPresentation(state, payload = {}) {
  const baseline = LONGSWORD_GUARD_PRESENTATION[state]
    || LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.NEUTRAL];
  const reaction = getGuardReactionProfile(state, payload);
  if (!reaction) return baseline;
  if (baseline.reactionProfileId === reaction.id && baseline.clipId === reaction.clipId) return baseline;
  return Object.freeze({
    ...baseline,
    clipId: reaction.clipId,
    reactionProfileId: reaction.id,
    reactionVariant: reaction.variant,
    sourceWindow: reaction.sourceWindow,
    counterWindowSeconds: reaction.counterWindowSeconds,
    completionEvent: reaction.completionEvent,
  });
}

export function createGuardStateMachine(options = {}) {
  let state = Object.values(GUARD_STATES).includes(options.initialState)
    ? options.initialState
    : GUARD_STATES.NEUTRAL;
  let guardHeld = Boolean(options.guardHeld);
  let elapsedMs = 0;
  let sequence = 0;
  let lastOutcome = null;
  let lastTransition = null;
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({
      state,
      guardHeld,
      elapsedMs,
      sequence,
      lastOutcome,
      lastTransition,
      presentation: getGuardPresentation(state, lastTransition?.payload || {}),
      authority: GUARD_STATE_AUTHORITY_NOTE,
    });
  }

  function emit() {
    const value = snapshot();
    for (const listener of listeners) listener(value);
    return value;
  }

  function transition(event, target, payload) {
    const from = state;
    state = target;
    elapsedMs = 0;
    sequence += 1;
    lastTransition = Object.freeze({
      sequence,
      event,
      authority: GUARD_EVENT_AUTHORITY[event] || 'unknown',
      from,
      to: target,
      payload: frozenPayload(payload),
    });
    return emit();
  }

  function send(event, payload = {}) {
    if (!Object.values(GUARD_EVENTS).includes(event)) {
      return Object.freeze({ accepted: false, transitioned: false, reason: 'unknown-event', snapshot: snapshot() });
    }

    if (event === GUARD_EVENTS.RESET) {
      guardHeld = false;
      lastOutcome = null;
      const value = transition(event, GUARD_STATES.NEUTRAL, payload);
      return Object.freeze({ accepted: true, transitioned: true, snapshot: value });
    }

    if (event === GUARD_EVENTS.GUARD_PRESS) guardHeld = true;
    if (event === GUARD_EVENTS.GUARD_RELEASE) guardHeld = false;

    const target = resolveDynamicTarget(state, event, guardHeld, lastOutcome);
    if (target) {
      const outcome = outcomeForEvent(event);
      if (outcome) lastOutcome = outcome;
      const value = transition(event, target, payload);
      return Object.freeze({ accepted: true, transitioned: true, snapshot: value });
    }

    const intentOnly = (event === GUARD_EVENTS.GUARD_PRESS || event === GUARD_EVENTS.GUARD_RELEASE)
      && [GUARD_STATES.BLOCK_HIT, GUARD_STATES.PARRY, GUARD_STATES.COUNTER, GUARD_STATES.RECOVER].includes(state);
    if (intentOnly) {
      const value = emit();
      return Object.freeze({ accepted: true, transitioned: false, reason: 'intent-latched-until-recovery', snapshot: value });
    }

    return Object.freeze({ accepted: false, transitioned: false, reason: 'event-not-valid-for-state', snapshot: snapshot() });
  }

  return Object.freeze({
    get state() { return state; },
    get guardHeld() { return guardHeld; },
    get snapshot() { return snapshot(); },
    can(event) {
      if (!Object.values(GUARD_EVENTS).includes(event)) return false;
      if (event === GUARD_EVENTS.RESET) return true;
      if ((event === GUARD_EVENTS.GUARD_PRESS || event === GUARD_EVENTS.GUARD_RELEASE)
        && [GUARD_STATES.BLOCK_HIT, GUARD_STATES.PARRY, GUARD_STATES.COUNTER, GUARD_STATES.RECOVER].includes(state)) return true;
      const simulatedHeld = event === GUARD_EVENTS.GUARD_PRESS
        ? true
        : event === GUARD_EVENTS.GUARD_RELEASE
          ? false
          : guardHeld;
      return Boolean(resolveDynamicTarget(state, event, simulatedHeld, lastOutcome));
    },
    send,
    update(deltaMs) {
      elapsedMs += Math.max(0, Number(deltaMs) || 0);
      return snapshot();
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
