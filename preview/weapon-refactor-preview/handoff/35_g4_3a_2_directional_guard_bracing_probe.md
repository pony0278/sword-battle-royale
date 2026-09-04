# G4.3A.2 — Directional Guard Bracing Probe

## Goal

Replace large Buckler-following corrections with a body-first defensive response.

G4.3A.2 keeps G4.3A.1 as a diagnostic tool, but the new probe asks a different question:

> Can the defender move the body into a mechanically believable receiving posture first, then use only a small hand correction to finish alignment?

This stage remains presentation/probe only. G4.3A swept geometry remains the only physical Sword × Buckler contact truth.

## Design rule

Order of operations per rendered frame:

1. sample authored Skyrim Guard;
2. predict the incoming blade threat from previous/current blade motion;
3. classify threat height and incoming motion;
4. apply body bracing;
5. re-read Buckler world surface;
6. optionally apply fine hand tracking, capped at 7cm;
7. run G4.3A swept Sword × Buckler contact against the final Buckler surface.

No stage in this sequence emits `PARRY_CONFIRMED`.

## Threat classification

The planner uses actual trajectory features before the attack label:

- `incomingVelocity.y` / total blade speed -> downward / overhead weight;
- predicted threat point Y relative to Buckler center -> low threat weight;
- predicted threat point X plus `left/right` metadata -> lateral brace weight.

Current blending thresholds:

- low bracing starts about 7cm below the Buckler center;
- low bracing reaches full weight around 24cm below;
- overhead bracing starts when downward velocity is about 24% of total blade speed;
- overhead bracing reaches full weight near 72% downward velocity.

The direction label is not collision truth and does not hard-code contact height.

## Body strategies

### `overhead-brace`

Intended for TOP-like downward strikes.

- left shoulder / whole shield arm rises slightly;
- forearm supports the same upward brace;
- chest adds a small pitch response;
- center of mass lowers only slightly.

Limits:

- shoulder/Buckler lift: 5.5cm max;
- shoulder angular brace: 8deg max;
- forearm angular brace: 6deg max;
- overhead crouch contribution: 1.8cm max.

### `low-crouch`

Intended for low LEFT-like trajectories.

The shield is not rotated down after the sword. Instead the defender lowers the receiving posture:

- hips lower;
- both thighs flex slightly;
- both knees flex slightly;
- the authored Guard triangle comes down with the torso.

Limits:

- hip drop: 8cm max;
- thigh bend: 8deg max;
- knee bend: 14deg max.

### `lateral-brace`

Intended for side pressure where the threat is not primarily overhead or low.

- chest yaws into the receiving side;
- shield arm receives only a small brace contribution;
- crouch remains minimal.

Chest yaw is capped at 6deg.

## Fine hand tracking

New formal cap: **7cm**.

This is intentionally much smaller than the G4.3A.1 diagnostic limits (12cm Guard / 18cm Parry).

Fine tracking happens only after body bracing and uses the post-brace Buckler surface. `wrist.l` is not modified.

G4.3A.1 remains useful to measure how far an unassisted Guard would need to travel, but its larger corrections are not the intended production motion model.

## Immutable equipment rules

Still unchanged:

- socket: `HAND_L`;
- accepted G4.2.3 Buckler mount;
- Buckler local Y rotation = 90deg;
- no socket translation or procedural mount chasing.

## Files

New runtime/planner:

- `src/combat/directional-guard-bracing.js`

New lab:

- `tools/action-studio/directional-guard-bracing-lab.html`
- `tools/action-studio/directional-guard-bracing-lab.js`

New tests:

- `tests/directional-guard-bracing.test.js`

## Lab controls

Attack:

- TOP
- RIGHT
- LEFT

Modes:

- OFF — authored Guard only;
- BODY BRACE — body accommodation only;
- BODY + FINE — body accommodation plus <=7cm final arm alignment.

Debug markers:

- green = predicted threat;
- blue = Buckler center after body bracing, before fine hand tracking;
- red = actual G4.3A active contact.

HUD exposes:

- chosen strategy;
- low / overhead / lateral weights;
- crouch amount;
- shoulder lift;
- chest yaw;
- knee bend;
- fine tracking need/application;
- real contact status.

The page is mobile-responsive using the same top-canvas / scrolling-controls layout adopted for G4.3A.1.

## Authority boundary

G4.3A.2 must not:

- emit `PARRY_CONFIRMED`;
- emit `BLOCK_CONFIRMED`;
- interrupt the attacker;
- apply recoil;
- award a counter window;
- move `HAND_L` socket data;
- change accepted Buckler mount calibration.

## Visual review gates

Before G4.3B:

1. TOP should read as the defender raising/bracing the whole shield arm against downward force, not the Buckler chasing the sword.
2. LEFT low should visibly lower the defender's body and Guard triangle rather than rotate the shield downward.
3. RIGHT should remain compact with a small torso brace.
4. BODY + FINE must not visibly look magnetic; fine correction is capped at 7cm.
5. G4.3A red contact marker must still be the final collision truth.

After these pass, G4.3B can interrupt the attacking animation at the real contact frame and compute directional recoil from the actual incoming blade motion.
