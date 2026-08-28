# G4.3A — Swept Sword × Buckler Contact Probe

## Goal

Replace the G4.2 presentation-only scheduled contact marker with a real spatial contact probe between the attacking longsword and the defender's accepted offhand Buckler.

G4.3A is intentionally **geometry only**. It does not emit `PARRY_CONFIRMED`, interrupt the attacker, award counter windows, or apply recoil. Those remain G4.3B/C responsibilities.

## Accepted Buckler calibration

The user-reviewed G4.2.3 calibration is now recorded as an explicit accepted loadout contract:

- socket: `HAND_L`
- socket remains immutable
- position: `(0, 0, 0.035)` m
- rotation: `(0°, 90°, 0°)` = `(0, π/2, 0)` radians
- scale: `(1, 1, 1)`
- visual radius: `0.24m`
- visual thickness: `0.055m`
- Parry radius: `0.26m`
- Parry thickness: `0.075m`

File:

- `src/character/offhand-buckler-accepted-calibration.js`

G4.3A passes this mount explicitly when attaching the Buckler. The legacy default mount in `offhand-buckler.js` is not used as collision truth.

## Sword sweep representation

Each rendered frame captures three world-space blade points:

- `blade.root`
- `blade.mid`
- `blade.tip`

The previous and current frame polylines create two swept blade strips:

1. root → mid
2. mid → tip

Each strip is triangulated between previous/current positions. The probe intersects these swept triangles against the Buckler disc center plane and both slab boundary planes (`± thickness / 2`). This catches high-speed tunneling where neither discrete frame is itself inside the Buckler volume.

A static segment-vs-disc-slab fallback is also evaluated for previous/current blade sections so resting or already-overlapping contact is represented.

## Buckler collision representation

`buckler.getWorldParrySurface()` supplies:

- world center
- world normal
- radius
- thickness

The surface remains an `oriented-disc`. G4.3A never derives collision from the rendered line mesh.

## Contact report

`probeSweptSwordBucklerContact()` returns more than a boolean:

- `geometricContact`
- `contact` (geometric contact while attack is ACTIVE)
- `mode`
  - `swept-strip`
  - `static-slab`
- `point`
- `sweepAlpha` (`0..1` within the rendered frame)
- `bladeFraction` (`0..1` root→tip)
- `signedDistance`
- `radialDistance`
- `incomingMotion`
- `incomingVelocity`
- `approachDot` against Buckler world normal

This metadata is deliberately shaped for G4.3B, where Parry recoil can use actual incoming blade motion rather than hard-coded TOP/LEFT/RIGHT reversal tables.

## ACTIVE-window boundary

Geometry truth and gameplay eligibility are separated:

- sword physically touches Buckler outside ACTIVE → `geometricContact=true`, `contact=false`
- sword physically touches Buckler during ACTIVE → `geometricContact=true`, `contact=true`

G4.3A does not send Guard state-machine events in either case.

The old canonical metadata (`TOP 0.43s`, `RIGHT 0.23s`, `LEFT 0.30s`) remains available for animation sanity checks, but it is no longer collision truth in the new probe.

## Lab

New page:

`tools/action-studio/swept-sword-buckler-contact-lab.html`

It loads:

- attacker UAL1/UAL2 directional attacks
- G4.2.1 pose-matched attack recovery
- defender production Skyrim Guard Hold
- accepted G4.2.3 Buckler mount
- G4.3A swept contact probe

Debug visualization:

- previous blade polyline
- current blade polyline
- previous→current sweep connectors
- Buckler Parry Surface + normal
- actual contact point sphere

Controls:

- TOP / RIGHT / LEFT
- auto repeat
- sweep visualization toggle
- Parry Surface toggle
- 3/4 / Side / Attacker / Defender / Contact Close views

The page exposes:

- `data-g43a`
- `window.__G43A_RESULT__`
- `window.__G43A_LAB__`

## Node coverage

`tests/swept-sword-buckler-contact.test.js` covers:

1. accepted Y=90° Buckler mount contract;
2. Buckler surface normalization;
3. high-speed tunneling through the Buckler between frames;
4. radial miss rejection;
5. geometric contact outside ACTIVE without combat promotion;
6. blade-fraction + incoming-velocity metadata for future recoil.

The dedicated G4.3A tests were dry-run locally and passed before publishing the branch.

## Authority boundary

G4.3A must not:

- send `PARRY_CONFIRMED`;
- send `BLOCK_CONFIRMED`;
- interrupt attack animation;
- modify Guard state graph;
- apply hitstop;
- apply attacker recoil;
- award free-attack/counter windows.

## Next — G4.3B

Once TOP / RIGHT / LEFT visual review confirms that the real contact point is credible:

1. Parry input/window establishes defender eligibility.
2. G4.3A active swept contact becomes the physical candidate.
3. Resolver emits `PARRY_CONFIRMED` at the actual contact frame.
4. Attacker animation is interrupted at that exact pose.
5. `incomingVelocity` + Buckler normal drive `PARRY_RECOIL` direction.
6. Defender continues the approved G3.6.3 deflect presentation from contact.

Do not return to scheduled `contactSeconds` to fake sword contact.
