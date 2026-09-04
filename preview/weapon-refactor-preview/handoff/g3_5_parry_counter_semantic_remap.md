# G3.5 / G3.5.1 — Parry Semantic Remap + Free Attack Follow-up

## Goal

Keep Guard combat readable without inventing unnecessary animation states.

The final design is intentionally simple:

- **Block** stops the incoming attack;
- **Parry** is a correctly timed Block that creates an advantage;
- **Perfect Parry** creates a stronger advantage;
- the attacker becomes staggered / unbalanced under authoritative combat rules;
- the defender uses the **existing directional attack system** (`top / left / right`) to punish the opening;
- production combat does **not** require a dedicated Counter state, Counter button, or Counter animation.

## Defensive presentation

Block Hit, Parry and Perfect Parry all use the validated defensive-contact source:

`SKYRIM_GUARD/shd_blockhit`

Production source window:

`0.00–0.60s`

Root rotation policy:

`lock`

This is semantically valid because Parry is not a separate offensive action. It is a timing-qualified defensive success.

## G3.5.1 — Parry Advantage contract

A successful Parry produces a combat opportunity rather than launching a special move.

Production contract:

- enemy response: `authoritative-stagger`;
- stagger duration authority: `authoritative-combat-balance`;
- defender follow-up mode: `normal-directional-attack`;
- attack system: `existing-directional-action-system`;
- allowed directions: `top / left / right`;
- dedicated Counter state required: **no**;
- dedicated Counter animation required: **no**.

The animation layer deliberately does not hard-code attacker stagger milliseconds. Exact advantage duration is a combat-balance responsibility and can be tuned later without changing animation assets.

## Current follow-up gates

The existing reaction timing is reused as the first presentation gate for free attack follow-up:

- normal Parry: `0.08–0.333...s`;
- Perfect Parry: `0.10–0.48s`.

These are current integration values, not final balance guarantees. They can change when authoritative opponent stagger and real directional attack input are connected.

Ordinary Block does **not** grant the G3.5.1 free-attack advantage.

## Runtime compatibility

G3.5.1 uses a production semantic cutover with legacy compatibility.

The old G3.4 Counter implementation remains in source only so historical regression labs and tests can continue proving that previously shipped Counter presentation behavior has not silently broken.

`LONGSWORD_GUARD_COUNTER_PROFILE` is now explicitly:

- `legacyOnly: true`;
- `productionEnabled: false`;
- `retiredByStage: G3.5.1`.

`Melee_Block_Attack` therefore does not need a replacement Counter animation. It may remain available as a future Shield Bash / Guard Push candidate.

The old `guard_counter / COUNTER_CONFIRMED` core path is likewise compatibility-only for this stage. New production code must not enter that path to represent a Parry punish.

A later cleanup can physically delete the legacy Counter state after the gameplay runtime has fully adopted Parry Advantage.

## Action Studio production preview

The production Guard Runtime controller now:

- loads Skyrim Guard defensive-contact assets only;
- does **not** load KayKit melee for Counter;
- does **not** require `Melee_Block_Attack`;
- does **not** send `COUNTER_CONFIRMED`;
- exposes whether the free directional attack follow-up is currently open;
- shows `Top / Left / Right` as the available punish family.

The static fifth Guard Runtime DOM key remains `data-guard-runtime="counter"` temporarily for CI / standalone-surface compatibility, but the G3.5.1 controller relabels it to **Parry Advantage** and treats it as a Parry-success preview. It no longer enters the Counter state.

## Asset policy

Keep these sources; do not use them to force Parry semantics:

- `shd_blockbash` → future Shield Bash candidate;
- `shd_blockbashpower` → future Power Shield Bash candidate;
- `Melee_Block_Attack` → future Shield Bash / Guard Push candidate and G3.4 regression asset.

No additional Parry or Counter animation search is required for the current design.

## Authority boundary

Presentation may expose:

- Parry grade;
- whether the current presentation-time follow-up gate is open;
- the existing directional attack family that may consume the advantage.

Authoritative gameplay must decide:

- whether the Parry actually succeeded;
- opponent stagger / vulnerability duration;
- whether an attack input is legal at the current simulation tick;
- hit, damage, block and subsequent combat results.

## Next recommended stage

### G3.5.2 — Authoritative Stagger + Directional Attack Handoff

Connect the semantic contract to real gameplay runtime:

1. Parry success applies attacker stagger / vulnerability through authoritative combat logic.
2. Defender regains access to the existing `top / left / right` attack input.
3. No special Counter action is injected.
4. Validate that a normal directional attack can start during the Parry advantage and that ordinary Block cannot receive the same privilege.
5. Tune advantage duration only after the real two-character interaction is observable.

This stage should focus on gameplay integration, not animation acquisition.
