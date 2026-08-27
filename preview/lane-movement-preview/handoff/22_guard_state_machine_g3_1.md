# G3.1 — Guard State Machine Foundation

## Goal

Turn the accepted Skyrim Triangle Forward Base Guard into a deterministic presentation-state foundation that later Guard-family animation stages can author against.

This stage does **not** decide combat outcomes. Hit / block / parry / counter authority remains outside the presentation state machine so the design can later support an authoritative multiplayer server without coupling animation state to combat truth.

## Canonical Guard Hold

G3.1 reuses the accepted G2.5.1 mother pose:

- clip: `SKYRIM_GUARD/shd_blockidle`
- correction layer: `longsword_triangle_forward_v1`
- in-place: `true`
- loop: `true`
- canonical authored state: `LONGSWORD_GUARD_AUTHORING_STATE.authored === true`

The lower-level Skyrim retarget, coordinate basis, arm FK and weapon-bind pipeline stays frozen.

## State Graph

```text
neutral
  |
  | guard_press
  v
guard_enter
  | enter_complete
  v
guard_hold
  |\
  | \ block_confirmed
  |  v
  | guard_block_hit ---- counter_confirmed ---> guard_counter
  |  |                                      
  |  | reaction_complete                    | counter_complete
  |  v                                      v
  | guard_recover <--------------------------
  |  |   \
  |  |    \ counter_confirmed (late authoritative result;
  |  |     \ allowed only after block/parry)
  |  |      -------------------------------> guard_counter
  |  |
  |  | recover_complete + guard held
  |  +-------------------------------> guard_hold
  |
  | parry_confirmed
  v
guard_parry ---- counter_confirmed ---> guard_counter
  |
  | reaction_complete
  v
guard_recover

Guard release:
- from guard_hold -> guard_exit immediately
- during block/parry/counter/recover -> input is latched; state finishes reaction first
- recover_complete with guard released -> guard_exit
- exit_complete -> neutral
- guard_press during guard_exit -> guard_enter without transient neutral
```

## States

| State | Role | Authored clip status |
|---|---|---|
| `neutral` | non-guard presentation | external / not owned by G3.1 |
| `guard_enter` | transition into Guard | G3.2 slot |
| `guard_hold` | canonical defensive hold | **G2.5.1 accepted Skyrim Guard** |
| `guard_block_hit` | normal block recoil | G3.3 slot |
| `guard_parry` | successful parry reaction | G3.3 slot |
| `guard_counter` | counterattack transition/action | G3.4 slot |
| `guard_recover` | return toward Guard Hold | G3.2 slot |
| `guard_exit` | leave Guard | G3.2 slot |

## Event Authority Boundary

### Local intent

- `guard_press`
- `guard_release`

These represent local controller intent only. They must not claim a successful block/parry/counter.

### Authoritative combat outcomes

- `block_confirmed`
- `parry_confirmed`
- `counter_confirmed`

These events must come from the authoritative combat layer. The presentation machine only reacts after the outcome is already confirmed.

`counter_confirmed` is intentionally tolerated one presentation step late: if a local Block/Parry reaction already emitted `reaction_complete` and entered `guard_recover`, a later authoritative counter confirmation may still enter `guard_counter` **only when the last accepted outcome was block or parry**. This protects valid server results from normal network delay without accepting arbitrary stale counters.

### Presentation completion

- `enter_complete`
- `reaction_complete`
- `counter_complete`
- `recover_complete`
- `exit_complete`

These events describe animation/presentation completion and route to the next state.

### System

- `reset`

Used for respawn, debug reset, scene teardown or other explicit presentation reset.

## Guard-Held Latching Policy

Reaction states must not be interrupted merely because the player releases Guard during a hit/parry/counter animation.

For `guard_block_hit`, `guard_parry`, `guard_counter` and `guard_recover`:

- `guard_release` updates `guardHeld = false`
- the current state remains active
- after `recover_complete`, the machine routes to `guard_exit`

The inverse is also supported: pressing Guard again during `guard_exit` routes directly back to `guard_enter`, avoiding a one-frame neutral flash.

## Deterministic Runtime Data

Each machine snapshot includes:

- current `state`
- `guardHeld`
- `elapsedMs` in the current state
- monotonic transition `sequence`
- last accepted authoritative outcome
- last transition record
- presentation descriptor for the current state
- explicit authority note

A rejected stale/invalid combat event does **not** mutate `lastOutcome`.

This is important for future network use where late or reordered outcome packets may arrive after presentation state already changed.

## Source Files

- `src/combat/guard-state-machine.js`
- `tests/guard-state-machine.test.js`
- `src/combat/longsword-guard-metadata.js` — canonical G2.5.1 mother pose dependency

## G3.1 Acceptance Contract

G3.1 is complete when the following are true:

1. Neutral → Enter → Hold → Exit → Neutral is deterministic.
2. `guard_hold` directly references the accepted Skyrim Guard clip/correction layer.
3. Block and Parry can only enter reaction states from Guard Hold.
4. Counter presentation only starts after authoritative `counter_confirmed`; a delayed confirmation may be accepted from Recover only when Recover came from an accepted Block/Parry outcome.
5. Guard release during reaction is latched until recovery.
6. Re-press during Exit re-enters without transient Neutral.
7. Invalid authoritative outcomes are rejected without mutating machine outcome state.
8. State age and transition sequence are deterministic and test-covered.
9. Presentation state machine contains no hit/block/parry success calculation.
10. Full repository test suite remains green.

## Follow-up

### G3.2 — Guard Enter / Recover / Exit Authoring

Author the actual transition clips or additive transition curves that connect Neutral ↔ canonical Skyrim Guard Hold without popping.

### G3.3 — Block / Parry Reaction Authoring

Author compact recoil responses while preserving the accepted lower-body stance and Triangle Guard readability.

### G3.4 — Counter Transition

Bind authoritative counter confirmation to a fast, readable Guard → Counter action path.

Only after the complete Guard Family is stable should G4 create TOP / RIGHT / LEFT directional Guard variants.
