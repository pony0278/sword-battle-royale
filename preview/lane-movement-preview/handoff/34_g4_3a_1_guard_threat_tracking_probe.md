# G4.3A.1 — Guard Threat Tracking Probe

## Goal

Investigate the observed LEFT attack miss without faking contact time or enlarging the Buckler collider.

G4.3A.1 adds a bounded presentation-only tracking layer after the authored Skyrim Guard pose. It predicts where the incoming blade will pass the Buckler plane, then permits the defender's left arm to make a small correction toward that threat.

`PARRY_CONFIRMED` is still owned by future combat resolution and may only follow real G4.3A Sword × Buckler geometry contact.

## Immutable equipment rules

The following remain unchanged:

- `HAND_L` socket transform;
- accepted G4.2.3 Buckler mount (`Y = 90°`);
- Buckler visual radius `0.24m`;
- Parry radius `0.26m`;
- Parry thickness `0.075m`.

Tracking moves the animated left arm, not the equipment socket or Buckler-local mount.

## Prediction

The planner receives the previous and current world-space blade polyline:

- blade root;
- blade mid;
- blade tip.

Endpoint velocity is extrapolated over a short horizon. At sampled future times the blade is projected onto the current Buckler plane, and the best future threat candidate records:

- predicted point;
- future time;
- blade fraction;
- radial distance from Buckler center;
- signed plane distance;
- amount currently outside the Buckler disc.

This is prediction only. It does not create contact.

## Tracking modes

### OFF

No correction.

### GUARD TRACK

- prediction horizon: `110ms`;
- maximum positional correction: `0.12m`;
- comfortable coverage radius: `82%` of Buckler radius;
- tracking speed: `0.85m/s`;
- upper-arm correction budget: `8°`;
- lower-arm correction budget: `10°`.

This is intended for slow, subtle defensive alignment.

### PARRY TRACK

- prediction horizon: `140ms`;
- maximum positional correction: `0.18m`;
- comfortable coverage radius: `60%` of Buckler radius;
- tracking speed: `1.6m/s`;
- upper-arm correction budget: `14°`;
- lower-arm correction budget: `18°`.

This is intentionally stronger but still below the existing Guard correction scope (`upperarm.l 20°`, `lowerarm.l 25°`).

## Reach rule

The planner reports both:

- `requiredDistance` — how far the Buckler would need to shift to bring the predicted threat into its comfort radius;
- `appliedDistance` — clamped to the selected mode's maximum.

If required correction exceeds the cap, the result is `OUT_OF_REACH`. Tracking is never allowed to magnetize the Buckler arbitrarily far toward the sword.

## Arm solve

The browser probe applies a small CCD-style post-animation correction to:

1. `lowerarm.l`;
2. `upperarm.l`.

The authored Skyrim Guard is sampled first every frame. The tracking correction is then applied on top of that frame only. This prevents cumulative pose drift.

`wrist.l` is intentionally left untouched in this stage. If later testing shows the Buckler normal must also steer toward angled attacks, wrist orientation can be evaluated separately without mixing it into the LEFT-height diagnosis.

## Contact authority

After the arm correction, the existing G4.3A swept contact probe runs against the Buckler's new world surface.

The order is:

`authored Guard → predict threat → bounded left-arm correction → updated Buckler world surface → G4.3A real swept contact`

No scheduled `contactSeconds` are used as collision truth.

## Lab

`tools/action-studio/guard-threat-tracking-lab.html`

Controls:

- TOP / RIGHT / LEFT;
- OFF / GUARD TRACK / PARRY TRACK;
- Auto Repeat;
- predicted-threat debug display;
- Buckler surface display;
- 3/4 / Side / Defender / Contact Close views.

Debug colors:

- green sphere: predicted threat;
- blue sphere: requested Buckler target center;
- green line: requested correction;
- red sphere: actual G4.3A active contact.

HUD exposes:

- prediction lead time;
- radial distance;
- blade fraction;
- required correction;
- capped correction;
- reachable / out-of-reach;
- achieved arm correction;
- real contact result.

## Acceptance focus

The first visual question is LEFT:

1. OFF should reproduce the low miss.
2. GUARD TRACK should show whether a <=12cm correction is sufficient.
3. PARRY TRACK should show whether a stronger <=18cm correction is still visually natural.
4. TOP and RIGHT should remain mostly unchanged because already-covered threats produce little or no correction.
5. If LEFT remains `OUT_OF_REACH` or requires visibly distorted arm motion, fix the attack trajectory/spacing instead of increasing tracking limits.

## Tests

`tests/guard-threat-tracking.test.js` verifies:

- Guard remains weaker than Parry tracking;
- future low attacks are predicted near the Buckler plane;
- a LEFT-like low miss produces a bounded correction;
- distant attacks are explicitly clamped and marked unreachable;
- already-covered threats do not cause unnecessary Guard movement.

## Next

Only after the three attack directions are visually credible should G4.3B consume actual contact and implement attack interruption + directional recoil.
