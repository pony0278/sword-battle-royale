// @ts-check

// S1.C2, step 3 of four — the guard's vocabulary, and the graph over it.
//
// Moved out of guard-state-machine.js unchanged. Nothing here is a weapon's: these are the states a
// guard can be in, the events that move it between them, who is allowed to raise each event, and
// which event leads where. A katana guards through the same eight states as a longsword.
//
// WHY it had to move before the table could. Step 4 takes LONGSWORD_GUARD_PRESENTATION out of
// guard-state-machine.js and has a weapon's own module build it. That table is keyed by
// GUARD_STATES, so whatever builds it must import GUARD_STATES - and while GUARD_STATES lived in
// guard-state-machine.js, which would then import the built table back, that is a cycle. R20Z
// measured this repository at zero import cycles and the property is worth keeping, so the
// vocabulary goes to the bottom of the stack where it has no imports of its own and anything may
// depend on it.
//
// guard-state-machine.js re-exports all four names, so none of the thirty-one modules that import
// GUARD_STATES from there had to change.

export const GUARD_STATES = Object.freeze({
  NEUTRAL: 'neutral',
  ENTER: 'guard_enter',
  HOLD: 'guard_hold',
  BLOCK_HIT: 'guard_block_hit',
  PARRY: 'guard_parry',
  COUNTER: 'guard_counter',
  RECOVER: 'guard_recover',
  EXIT: 'guard_exit',
});

export const GUARD_EVENTS = Object.freeze({
  GUARD_PRESS: 'guard_press',
  GUARD_RELEASE: 'guard_release',
  ENTER_COMPLETE: 'enter_complete',
  BLOCK_CONFIRMED: 'block_confirmed',
  PARRY_CONFIRMED: 'parry_confirmed',
  COUNTER_CONFIRMED: 'counter_confirmed',
  REACTION_COMPLETE: 'reaction_complete',
  COUNTER_COMPLETE: 'counter_complete',
  RECOVER_COMPLETE: 'recover_complete',
  EXIT_COMPLETE: 'exit_complete',
  RESET: 'reset',
});

export const GUARD_EVENT_AUTHORITY = Object.freeze({
  [GUARD_EVENTS.GUARD_PRESS]: 'local-intent',
  [GUARD_EVENTS.GUARD_RELEASE]: 'local-intent',
  [GUARD_EVENTS.ENTER_COMPLETE]: 'presentation',
  [GUARD_EVENTS.BLOCK_CONFIRMED]: 'authoritative-combat',
  [GUARD_EVENTS.PARRY_CONFIRMED]: 'authoritative-combat',
  [GUARD_EVENTS.COUNTER_CONFIRMED]: 'authoritative-combat',
  [GUARD_EVENTS.REACTION_COMPLETE]: 'presentation',
  [GUARD_EVENTS.COUNTER_COMPLETE]: 'presentation',
  [GUARD_EVENTS.RECOVER_COMPLETE]: 'presentation',
  [GUARD_EVENTS.EXIT_COMPLETE]: 'presentation',
  [GUARD_EVENTS.RESET]: 'system',
});

export const GUARD_TRANSITION_GRAPH = Object.freeze({
  [GUARD_STATES.NEUTRAL]: Object.freeze({
    [GUARD_EVENTS.GUARD_PRESS]: GUARD_STATES.ENTER,
  }),
  [GUARD_STATES.ENTER]: Object.freeze({
    [GUARD_EVENTS.GUARD_RELEASE]: GUARD_STATES.EXIT,
    [GUARD_EVENTS.ENTER_COMPLETE]: GUARD_STATES.HOLD,
  }),
  [GUARD_STATES.HOLD]: Object.freeze({
    [GUARD_EVENTS.GUARD_RELEASE]: GUARD_STATES.EXIT,
    [GUARD_EVENTS.BLOCK_CONFIRMED]: GUARD_STATES.BLOCK_HIT,
    [GUARD_EVENTS.PARRY_CONFIRMED]: GUARD_STATES.PARRY,
  }),
  [GUARD_STATES.BLOCK_HIT]: Object.freeze({
    [GUARD_EVENTS.COUNTER_CONFIRMED]: GUARD_STATES.COUNTER,
    [GUARD_EVENTS.REACTION_COMPLETE]: GUARD_STATES.RECOVER,
  }),
  [GUARD_STATES.PARRY]: Object.freeze({
    [GUARD_EVENTS.COUNTER_CONFIRMED]: GUARD_STATES.COUNTER,
    [GUARD_EVENTS.REACTION_COMPLETE]: GUARD_STATES.RECOVER,
  }),
  [GUARD_STATES.COUNTER]: Object.freeze({
    [GUARD_EVENTS.COUNTER_COMPLETE]: GUARD_STATES.RECOVER,
  }),
  [GUARD_STATES.RECOVER]: Object.freeze({
    [GUARD_EVENTS.RECOVER_COMPLETE]: GUARD_STATES.HOLD,
  }),
  [GUARD_STATES.EXIT]: Object.freeze({
    [GUARD_EVENTS.GUARD_PRESS]: GUARD_STATES.ENTER,
    [GUARD_EVENTS.EXIT_COMPLETE]: GUARD_STATES.NEUTRAL,
  }),
});
