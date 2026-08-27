# G4.2.1 — Contact & Recovery Polish

## Goal

Fix two visual integration defects observed in the first online G4.2 recording:

1. Parry starts only after the attacker reaches canonical contact, so the defender reacts late and the swords miss each other visually.
2. RIGHT / LEFT attacks hard-cut from the final UAL2 attack pose directly into `UAL1/Sword_Idle`, producing a visible snap during reset.

This stage remains presentation-only. G4.3 still owns real sword sweep collision and authoritative Block / Parry resolution.

## Parry contact timing

G4.2.1 separates **visual Parry preparation** from **confirmed contact**.

- Canonical attack contact times remain unchanged:
  - TOP: `0.43s`
  - RIGHT: `0.23s`
  - LEFT: `0.30s`
- Defender pre-rolls the approved G3.6.3 Parry presentation by `160ms` before canonical contact.
- At canonical contact, the lab still emits `PARRY_CONFIRMED`.
- The confirmation payload carries `presentationOffsetSeconds: 0.16`, allowing the production reaction timeline to continue from the already-previewed visual pose instead of rewinding to frame zero.
- Gameplay Counter / free-attack reward windows remain measured from confirmed contact. Only the visual animation clock is offset.

This produces the intended order:

`attack windup → defender Parry prep → scheduled sword contact → PARRY_CONFIRMED → power deflect → Guard recovery`

The contact marker is still a presentation marker, not collision truth.

## Attack recovery to Idle

G4.2.1 adds a pose-matched return from the final attack pose to canonical `UAL1/Sword_Idle` sample 0.

| Direction | Recovery blend |
|---|---:|
| TOP | 120ms |
| RIGHT | 155ms |
| LEFT | 155ms |

At the completed attack frame the lab:

1. captures the authored final attack pose;
2. samples and captures the target Idle pose;
3. restores the final attack pose;
4. blends the complete rig pose into Idle with the existing recovery bridge quaternion/vector interpolation;
5. starts normal looping Idle only after the recovery blend completes.

The longer lateral blend specifically addresses the visible UAL2 RIGHT / LEFT reset snap while keeping TOP compact.

## Files

- `src/combat/longsword-contact-recovery-presentation.js`
- `src/combat/guard-reaction-presentation.js`
- `tools/action-studio/two-actor-combat-lab.js`
- `tests/g4-contact-recovery-polish.test.js`

## Verification contract

The Two-Actor Lab exposes `data-g421` and `window.__G421_RESULT__`.

Node coverage verifies:

- all three attacks begin Parry preview 160ms before their canonical contact;
- preview reaches the 160ms Parry contact pose immediately before attack contact;
- RIGHT / LEFT use 155ms pose-matched Idle recovery and TOP uses 120ms;
- visual Parry lead advances animation source time without opening gameplay reward windows before confirmed contact.

## Next visual review

Re-record TOP / RIGHT / LEFT against Parry and inspect:

- whether the defender blade now reaches the incoming blade at the scheduled contact frame;
- whether RIGHT / LEFT settle into Idle without a one-frame arm/body snap;
- whether 160ms Parry lead is too early or late per direction.

If blade geometry is still spatially separated after timing is aligned, solve that in G4.3 with actual sword segments / sweep contact instead of further faking contact time.
