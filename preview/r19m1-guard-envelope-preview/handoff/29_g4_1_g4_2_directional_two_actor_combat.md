# G4.1 + G4.2 — Directional Attack Runtime / Two-Actor Combat Lab

## Goal

Move the project from single-character Guard presentation into the first two-character combat sandbox without prematurely implementing authoritative hit resolution.

## G4.1 — Directional Attack Runtime

Canonical longsword light attacks remain:

| Direction | Clip | Natural duration | Canonical contact |
|---|---|---:|---:|
| TOP | `UAL1/Sword_Attack` | 1.533s | 0.43s |
| RIGHT | `UAL2/Sword_Regular_A` | 0.433s | 0.23s |
| LEFT | `UAL2/Sword_Regular_B` | 0.533s | 0.30s |

Implementation:

- `src/combat/longsword-directional-attack-runtime.js` converts canonical direction/contact metadata into G4.1 longsword attack definitions.
- The G4.1 attack-definition layer adds `direction` while leaving the shared `ActionDefinition` schema untouched, so existing Action Studio standalone bundles do not need unrelated regeneration.
- Runtime phases are `idle → attack_windup → attack_active → attack_recovery → idle`.
- Active, movement, weapon-trail and recovery-cancel windows are generated from the canonical contact point.
- External animation binding remains source-authored at 1.00x and in-place with root rotation locked.
- Overlapping attacks are rejected by the presentation runtime.

The generated windows are presentation / authoring hints. They are not authoritative hit truth.

## G4.2 — Two-Actor Combat Lab

Entry point:

`tools/action-studio/two-actor-combat-lab.html`

The lab creates two independent canonical Blockman characters:

- Attacker: UAL1 + UAL2 animation libraries.
- Defender: production Skyrim Guard library and the existing Guard state machine / presentation runtime.

The attacker exposes TOP / RIGHT / LEFT buttons. The defender response can be selected as:

- Guard Hold
- Block Hit
- Parry
- Perfect Parry

At the canonical attack contact time the lab emits a scripted presentation event into the Guard state machine. This intentionally lets us review real attack-vs-Guard motion now while preserving the G4.3 boundary.

### Important authority boundary

G4.2 does **not** decide whether swords, guard volumes or hurtboxes actually collided.

The current trigger is:

`selected attack → canonical contact time → selected scripted defender response`

G4.3 must replace that scripted trigger with spatial combat resolution and authoritative outcome confirmation before gameplay/network code consumes Block / Parry results.

## Verification gates

The G4.2 browser surface reports `data-g41` and `data-g42` and verifies:

- all three canonical attack definitions exist;
- TOP loads `UAL1/Sword_Attack`;
- RIGHT loads `UAL2/Sword_Regular_A`;
- LEFT loads `UAL2/Sword_Regular_B`;
- attacker idle loads `UAL1/Sword_Idle`;
- defender production Hold / Block Hit / Power Parry clips are registered;
- UAL1, UAL2 and Skyrim libraries are all present in the two-actor surface.

Node coverage is provided by `tests/longsword-directional-attack-runtime.test.js` and is included in `npm test`.

## Next stage — G4.3

Build the first real Combat Resolver:

1. sword segment / sweep sampling;
2. defender hurtbox and Guard volume;
3. contact candidate generation;
4. Guard timing / Perfect Parry timing evaluation;
5. authoritative-style `BLOCK_CONFIRMED` / `PARRY_CONFIRMED` outcome adapter;
6. remove the scripted contact reaction from G4.2 or retain it only as a debug override.
