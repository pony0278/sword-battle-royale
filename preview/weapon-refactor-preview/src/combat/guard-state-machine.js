// @ts-check
import {
  GUARD_STATES,
  GUARD_EVENTS,
  GUARD_EVENT_AUTHORITY,
  GUARD_TRANSITION_GRAPH,
} from './guard-states.js';
import { getGuardReactionProfile } from './guard-reaction-presentation.js';
import { LONGSWORD_GUARD_PRESENTATION } from './longsword-guard-presentation.js';

// S1.C2 — what this module used to be, and what it is now.
//
// It held eight states, the graph over them, AND a table of how one weapon presents each of those
// states, built from four longsword imports when the module loaded. handoff/39 recorded the table
// as category C: a mechanic with a weapon frozen into it. Both halves left, in that order, and what
// remains is the machine.
//
// Step 3 sent the vocabulary and the graph DOWN to guard-states.js, which imports nothing, so that
// step 4's builder could key a table by GUARD_STATES without importing this module back.
// Step 4 sent the table UP to the weapon that owns it: longsword-guard-presentation.js assembles it
// with createGuardPresentationTable, and this module receives one already built.
//
// Both are re-exported. Thirty-one modules import GUARD_STATES from this path and two tests import
// LONGSWORD_GUARD_PRESENTATION from it; none of them should have to care where either now lives.
// The second re-export carries an assumption with it - that there is one table, and it is the
// longsword's. The day there are two, what this module holds is whichever one the fighter carries,
// and that re-export is the line that says so.
export { GUARD_STATES, GUARD_EVENTS, GUARD_EVENT_AUTHORITY, GUARD_TRANSITION_GRAPH };
export { LONGSWORD_GUARD_PRESENTATION };

export const GUARD_STATE_AUTHORITY_NOTE =
  'Presentation state only. Authoritative combat simulation confirms block, parry and counter outcomes.';

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

// W1: the table is a parameter now, defaulting to the longsword's. S1.C2 step 4 moved the table out
// of this module but left the machine reading one fixed import, which was enough while no fighter
// carried a weapon. A fighter carries one now, so the machine is asked which table to read.
export function getGuardPresentation(state, payload = {}, presentation = LONGSWORD_GUARD_PRESENTATION) {
  const baseline = presentation[state]
    || presentation[GUARD_STATES.NEUTRAL];
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
  // W1: which weapon's guard this machine presents. The longsword while nothing says otherwise,
  // which is every existing caller - two in src/, seventeen lab pages and five tests, none of
  // which had to change to gain the option.
  const presentation = options.presentation || LONGSWORD_GUARD_PRESENTATION;
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
      presentation: getGuardPresentation(state, lastTransition?.payload || {}, presentation),
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
