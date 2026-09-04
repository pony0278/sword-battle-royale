# G3.4.0 — Full Skyrim Motion Baseline

## Decision

Preserve the complete authored Skyrim Guard reaction motions before doing any further timing/silhouette trimming.

The previous G3.3.2 presentation windows intentionally trimmed:

- `shd_blockhit`: 0.80s source → 0.60s presentation
- `shd_blockbashpower`: 0.70s source → 0.48s presentation

Visual review in the integrated Action Studio showed that the hard presentation cut could make the reaction end feel abrupt and unfinished. G3.4.0 therefore restores the full authored motion arc and treats gameplay timing separately from visual completion.

## Runtime baseline

| Reaction | Clip | Source playback | Presentation counter window |
| --- | --- | ---: | ---: |
| Block Hit | `SKYRIM_GUARD/shd_blockhit` | 0.00–0.80s | 0.24–0.60s |
| Parry | `SKYRIM_GUARD/shd_blockbash` | full ~0.333s | 0.08–~0.333s |
| Perfect Parry | `SKYRIM_GUARD/shd_blockbashpower` | 0.00–0.70s | 0.10–0.48s |

The presentation counter windows remain unchanged. The added tail is authored settle/follow-through, not a wider combat-authority window.

## Authority invariants

G3.4.0 does **not** change the combat authority graph:

- `BLOCK_CONFIRMED`, `PARRY_CONFIRMED`, and `COUNTER_CONFIRMED` remain authoritative events.
- reaction `counterWindowOpen` remains presentation metadata only.
- presentation never emits `COUNTER_CONFIRMED`.
- authoritative Counter can still interrupt a reaction and hand off to `Melee_Block_Attack`.
- `REACTION_COMPLETE` still owns the normal reaction → Recover transition when no Counter interrupts it.

## Why this baseline

The animation source already contains a coherent impact/recoil/settle motion. Before changing Counter silhouette or source windows, the project should judge the complete authored Skyrim motion in Action Studio. Future tuning should prefer transition/blend/interrupt work over destructive source trimming when possible.

## Next review

After this baseline is visible in Action Studio:

1. compare Block Hit and Perfect Parry ending continuity against the previous trimmed version;
2. verify that authoritative Counter still feels responsive when triggered during the existing counter window;
3. only then begin G3.4.1 Counter timing / silhouette tuning if the Counter itself still feels too broad or slow.
