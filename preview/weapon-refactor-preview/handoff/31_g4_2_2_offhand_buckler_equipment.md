# G4.2.2 — Offhand Buckler Equipment

## Goal

Give the defender a real left-hand parry object before G4.3A implements swept sword contact.

This stage deliberately solves equipment, mount, scale, orientation and collision-surface authoring only. It does **not** decide Parry outcomes.

## Existing socket reused

The procedural KayKit rig already exposes:

- `HAND_R` on `handslot.r`
- `HAND_L` on `handslot.l`

G4.2.2 therefore does not modify the skeleton or animation retargeting. The Buckler uses the normal character equipment path through `character.attach()`.

Canonical offhand socket:

`HAND_L`

## Buckler geometry

Implementation:

`src/character/offhand-buckler.js`

Default visual dimensions:

- round Buckler radius: `0.24m`
- thickness: `0.055m`
- raised metal rim
- center boss
- mount offset: `+0.035m` on local Z from `HAND_L`

The shield stays intentionally compact so the production Triangle Guard silhouette remains readable instead of becoming a large-shield blocking stance.

## G4.3A parry-surface contract

The Buckler publishes a future contact surface alongside the visible mesh:

- shape: `oriented-disc`
- visual radius: `0.24m`
- authored Parry radius: `0.26m`
- collision thickness: `0.075m`
- local normal: `[0, 0, 1]`
- local center: front face of the shield

The additional `0.02m` radial padding is intentional gameplay forgiveness. It is small enough to remain visually believable while avoiding hand-sized precision requirements.

`buckler.getWorldParrySurface()` exposes current world-space:

- center
- normal
- radius
- visual radius
- thickness

G4.3A will consume this contract for swept blade contact. G4.2.2 itself does not call `PARRY_CONFIRMED`.

## Visual review surface

Entry point:

`tools/action-studio/offhand-buckler-lab.html`

The lab loads:

- canonical procedural Blockman
- production Skyrim Guard Hold
- calibrated production Guard longsword in `HAND_R`
- G4.2.2 Buckler in `HAND_L`

Views:

- 3/4
- Front
- Side
- Back

The `Show G4.3A parry surface preview` toggle displays the slightly expanded collision disc independently of the visible Buckler.

Browser verification publishes:

- `data-g422`
- `window.__G422_RESULT__`
- `window.__G422_LAB__`

## Verification gates

Node coverage verifies:

- Buckler remains bound to `HAND_L`;
- default visual radius is `0.24m`;
- authored Parry radius is `0.26m`;
- parry surface remains an oriented disc facing local `+Z`;
- custom dimensions preserve the same contact-surface contract;
- mount uses the existing character equipment API instead of adding a new skeleton attachment path.

## Next stage

G4.3A — Swept Sword Contact Probe

1. sample attacker blade root / mid / tip across previous and current frames;
2. build swept blade candidate geometry;
3. consume `buckler.getWorldParrySurface()`;
4. report actual sword-vs-Buckler contact point and incoming velocity;
5. visualize misses / contacts before any authoritative Parry result is emitted.
