# G3.5.1P-T3 — Promote Shared Deflect to Production Parry Presentation

## Goal

Promote the visually accepted G3.5.1P T1/T2 contact → deflect chain into the **production Guard reaction path** used by the normal Action Studio and future gameplay runtime.

The player-visible requirement is now explicit:

`Enemy Attack → shield contact → readable impact hold → upward/lateral deflect → Parry Advantage`

The normal Action Studio must no longer stop at `shd_blockhit` for Parry / Perfect Parry.

## Accepted visual decision carried forward

T2 selected **Shared Normal T1** over `shd_blockbashpower`.

Production source chain for both Parry grades:

1. `SKYRIM_GUARD/shd_blockhit`
2. contact read / hitstop
3. bone-track crossfade
4. compact `SKYRIM_GUARD/shd_blockbash` source segment `0.090–0.220s`
5. settle on the deflected pose until the existing reaction boundary

`shd_blockbashpower` stays available as source/probe evidence but is **not mapped into production Parry**.

## Production timings

### Normal Parry

- contact source: `shd_blockhit`
- contact end: `0.160s`
- contact hold: `85ms`
- crossfade: `70ms`
- deflect source: `shd_blockbash`
- deflect source window: `0.090–0.220s`
- blend lead: `0.030s`
- deflect playback rate: `1.15x`
- visual chain completes at about `0.402s`
- total reaction state remains `0.600s`

### Perfect Parry

- contact source: `shd_blockhit`
- contact end: `0.160s`
- contact hold: `95ms`
- crossfade: `75ms`
- same `shd_blockbash 0.090–0.220s` deflect
- same `1.15x` deflect rate
- visual chain completes at about `0.417s`
- total reaction state remains `0.600s`

Perfect strength is intentionally **not** communicated by `shd_blockbashpower`. Later gameplay/presentation layers own stronger stagger, hitstop, FX, audio and camera response.

## Production implementation

### Why a virtual AnimationClip

The previous Probe lab could blend two source clips directly, but the production Guard runtime is intentionally a simple single-clip reaction sampler.

T3 preserves that architecture by synthesizing two virtual Three.js AnimationClips when the converted Skyrim library loads:

- `SKYRIM_GUARD/parry_contact_deflect_t3`
- `SKYRIM_GUARD/perfect_parry_contact_deflect_t3`

The synthesizer samples the already-retargeted Block Hit and Block Bash bone tracks, inserts the accepted hold, performs quaternion slerp / linear transform blending during the crossfade, plays the compact deflect segment, then holds the final pose until `0.600s`.

This means:

- Action Studio and gameplay use the same production clip;
- the state machine does not need a special multi-clip sub-state machine;
- Block stays unchanged;
- Counter legacy stays unchanged;
- root rotation lock stays unchanged;
- reaction completion / Recover timing stays unchanged.

## Authority / gameplay boundary

This stage changes **presentation only**.

It does not change:

- authoritative Block/Parry resolution;
- Parry Advantage semantics;
- the existing free Top / Left / Right follow-up model;
- authoritative attacker stagger ownership;
- legacy G3.4 Counter regression path.

The 600ms reaction envelope is deliberately preserved so T3 does not accidentally rebalance existing gameplay timing while promoting the visual chain.

## Action Studio acceptance

The normal production Guard reaction surface must prove:

- Block still plays `shd_blockhit`;
- Parry maps to `SKYRIM_GUARD/parry_contact_deflect_t3`;
- Perfect maps to `SKYRIM_GUARD/perfect_parry_contact_deflect_t3`;
- both virtual clips are generated from `blockhit + blockbash`;
- neither production virtual clip uses `blockbashpower`;
- source hashes remain frozen;
- root rotation remains locked;
- reaction still presentation-completes into Recover at 600ms.

The visual workflow captures:

- Parry contact;
- Parry hold;
- Parry blend;
- Parry deflect in 3/4;
- Parry deflect from the side;
- Perfect contact;
- Perfect blend;
- Perfect deflect in 3/4;
- Perfect deflect from the side.

## Next stage

After T3 is visually accepted and merged, proceed to authoritative stagger + ordinary directional attack handoff. Do not reintroduce a dedicated Counter action merely because the Parry presentation now has a deflect motion.
