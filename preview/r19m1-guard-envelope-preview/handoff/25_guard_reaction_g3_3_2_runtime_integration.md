# G3.3.2 — Guard Reaction Runtime Integration

## Status

Implemented on top of the accepted G3.1 Guard FSM, G3.2 Guard Enter/Recover/Exit presentation, and G3.3.1 Skyrim reaction visual decisions.

The combat simulation remains authoritative. G3.3.2 is a presentation/runtime integration layer; it does **not** decide whether a Block, Parry, Perfect Parry, or Counter succeeded.

## Runtime chain

```text
Triangle Guard Hold
  ├─ BLOCK_CONFIRMED
  │    → SKYRIM_GUARD/shd_blockhit
  │    → source window 0.000–0.600 s
  │    → REACTION_COMPLETE (presentation)
  │    → G3.2 Recover 140 ms
  │    → Hold / Exit depending on guardHeld
  │
  └─ PARRY_CONFIRMED
       ├─ normal
       │    → SKYRIM_GUARD/shd_blockbash
       │    → source window 0.000–0.333 s
       │
       └─ perfect payload
            → SKYRIM_GUARD/shd_blockbashpower
            → source window 0.000–0.480 s

       → REACTION_COMPLETE (presentation)
       → G3.2 Recover / authoritative Counter
```

## Perfect Parry payload

Perfect Parry deliberately reuses the existing authoritative `PARRY_CONFIRMED` event and `guard_parry` state. Presentation selects the stronger source when the event payload contains one of:

```js
{ perfect: true }
{ perfectParry: true }
{ grade: 'perfect' }
{ variant: 'perfect-parry' }
```

This avoids introducing a presentation-only combat outcome into the authoritative state graph.

## Frozen reaction profiles

| Variant | Source | Source duration | Runtime source window | Counter presentation window | Decision |
|---|---|---:|---:|---:|---|
| Block Hit | `shd_blockhit` | 0.800 s | 0.000–0.600 s | 0.240–0.600 s | ADOPT WITH CORRECTIONS |
| Parry | `shd_blockbash` | 0.333 s | full source | 0.080–0.333 s | ADOPT |
| Perfect Parry | `shd_blockbashpower` | 0.700 s | 0.000–0.480 s | 0.100–0.480 s | ADOPT WITH CORRECTIONS |

The late 0.20 s of Block Hit and late 0.22 s of Bash Power are not destructively removed from their GLBs. Runtime simply stops sampling them and hands presentation to G3.2 Recover / Counter handling.

`shd_blockbashintro` remains rejected from the post-confirmation reaction chain because its real Blockman playback reads as preparation/wind-up.

## Product source assets

The repo ships four converted Skyrim Guard source GLBs:

- `shd_blockidle.source.glb` — canonical Hold / weapon bind baseline
- `shd_blockhit.source.glb` — Block Hit
- `shd_blockbash.source.glb` — normal Parry
- `shd_blockbashpower.source.glb` — Perfect Parry

Reaction GLB SHA256:

```text
270d68b5c62a7de68c39112ab9a813f27a758ac737a078fe55b21896cfce1f28  shd_blockhit.source.glb
bae74b1cdf8724eb17073a7347192946fef8cc9cedcdb8c9728e6ea9004ea637  shd_blockbash.source.glb
603cf8326501ca2dd3628e8f47c37c6cbad6bec491b224123af418e70c36fd47  shd_blockbashpower.source.glb
```

Raw HKX inputs are not product assets and are not shipped.

## Runtime ownership

### `guard-state-machine.js`

- authoritative outcome events remain unchanged,
- Block Hit and Parry presentation slots are now authored G3.3.2 entries,
- Perfect Parry dynamically resolves the presentation clip/profile from the `PARRY_CONFIRMED` payload,
- Counter remains unauthored G3.4 work.

### `guard-reaction-presentation.js`

Owns:

- reaction clip IDs,
- source windows,
- reaction durations,
- presentation counter windows,
- Perfect Parry payload recognition,
- deterministic reaction sampling.

### `guard-presentation-runtime.js`

Owns presentation execution:

- samples exact source time through the existing character animation API,
- preserves in-place reaction playback,
- reapplies the accepted Triangle Guard quaternion correction,
- exposes `counterWindowOpen` without confirming a Counter,
- sends presentation-owned `REACTION_COMPLETE` when the useful source window ends,
- reuses G3.2 Enter / Recover / Exit completion profiles.

## Authority invariant

```text
BLOCK_CONFIRMED / PARRY_CONFIRMED / COUNTER_CONFIRMED
    = authoritative-combat

ENTER_COMPLETE / REACTION_COMPLETE / RECOVER_COMPLETE / EXIT_COMPLETE
    = presentation
```

A visible counter window never advances the FSM to `guard_counter` by itself. Only authoritative `COUNTER_CONFIRMED` can do that.

## Verification

- committed product GLBs are checked by fixed SHA256 before browser verification,
- the permanent G3.3.2 browser gate loads all four committed Skyrim Guard GLBs through the production retarget path and verifies Block / Parry / Perfect Parry completion into G3.2 Recover,
- the complete `npm test` suite includes the dedicated G3.3.2 reaction-profile and presentation-runtime tests,
- Action Studio standalone `action-studio.bundle.js` / `index.html` were rebuilt only after the full suite passed,
- Action Studio manual Skyrim preview treats `shd_blockidle` as looped Hold and the three G3.3.2 reactions as one-shot clips.

## Next stage

G3.4 should author/integrate the actual Guard Counter presentation while preserving the Counter authority boundary already established in G3.1.
