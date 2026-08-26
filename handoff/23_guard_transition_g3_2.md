# G3.2 — Guard Enter / Recover / Exit Authoring

## Status

**PASS / READY FOR VISUAL ACCEPTANCE** on PR #15.

Final verification head before this documentation update: `0ad8b0abad17e9f34dbec1c5aa08de9247cc0758`.

- CI Run 181: **SUCCESS**
- Guard Transition Visual Verification Run 4: **SUCCESS**
- Skyrim Guard Visual Verification Run 106: **SUCCESS**
- G3.2 visual artifact: `9315857673`
- artifact digest: `sha256:80575ab1cee88cfed02c2a7dbd67e52c62db44a1c13c7ce0d1393b2d3b8df501`

## Goal

Turn the G3.1 Guard state slots into authored presentation transitions without creating unrelated full-body animation clips.

G3.2 reuses the accepted Skyrim Triangle Forward Guard as the only Guard base:

- clip: `SKYRIM_GUARD/shd_blockidle`
- correction layer: `longsword_triangle_forward_v1`
- in-place: `true`
- canonical G2.5.1 quaternion offsets remain unchanged
- canonical neutral for Action Studio acceptance: `ACTION_STUDIO/IDLE_POSE`

## Authoring Strategy

The transition family uses deterministic presentation weights instead of new FBX/GLB clips.

### Guard Enter — 180 ms

Curve: `ease-out-cubic`

```text
holdWeight       0 -> 1
correctionWeight 0 -> 1
reactionOverlay  0
```

The real Skyrim Hold blends from Action Studio's actual authored `IDLE_POSE`; the G2.5.1 local quaternion correction ramps through the same envelope.

### Guard Recover — 140 ms

Curve: `ease-out-cubic`

```text
holdWeight       1
correctionWeight 1
reactionOverlay  1 -> 0
```

Recover deliberately does not weaken the mother Guard. G3.3 will author Block/Parry recoil as an additive reaction overlay; G3.2 already defines how that overlay returns to zero.

### Guard Exit — 160 ms

Curve: `ease-in-cubic`

```text
holdWeight       1 -> 0
correctionWeight 1 -> 0
reactionOverlay  0
```

Exit releases the Skyrim Hold and its authored correction together and returns to the exact same Action Studio `IDLE_POSE` used at Enter start.

## Quaternion Blend Rule

G2.5.1 correction offsets are not interpolated as Euler angles.

`scaleQuaternionOffset()` scales each local correction through the shortest quaternion arc from identity to the accepted canonical offset. Therefore a 50% correction has approximately 50% of the canonical quaternion angle and cannot take an arbitrary Euler-axis route.

`applyGuardQuaternionOffsetsWeighted()` is the runtime/application helper for the weighted correction layer.

## Mixer Baseline Rule

The first visual implementation exposed an important bug: although the numerical envelope was correct, `AnimationAction.play()` had captured procedural rig rest/T-pose as its PropertyMixer original state. The result was a visually wrong Exit endpoint.

The corrected G3.2 lab now:

1. applies the exact Action Studio `IDLE_POSE`,
2. only then activates the Skyrim Guard AnimationAction through the animation controller,
3. therefore captures Idle as the PropertyMixer original state,
4. uses that same Idle as the zero-weight baseline for Neutral / Enter start / Exit end.

The rejected intermediate run measured Exit-end vs Neutral at exactly `62°`, exposing the right-elbow Idle-vs-rest mismatch. After the baseline fix:

- Neutral vs Action Studio Idle: `0°`
- Enter start vs Neutral: about `0.0000017°`
- Exit end vs Neutral: about `0.0000017°`
- root max excursion: `0`
- motion-root max excursion: `0`

This gate prevents a future regression back to T-pose/rest even if the transition weights still look numerically correct.

## G3.1 State Contract Integration

The following presentation slots are now authored at G3.2:

- `guard_enter`
- `guard_recover`
- `guard_exit`

All three point to the same canonical Skyrim Guard clip and correction layer and expose a `transitionProfileId`.

The following remain intentionally unauthored:

- `guard_block_hit` -> G3.3
- `guard_parry` -> G3.3
- `guard_counter` -> G3.4

The G3.1 authority boundary is unchanged. G3.2 only controls presentation weights and completion timing; it does not decide whether block/parry/counter succeeds.

## Action Studio Visual Lab

`tools/action-studio/guard-transition-authoring-lab.html`

The lab loads:

1. Action Studio's actual authored `IDLE_POSE`,
2. the real canonical converted Skyrim Guard GLB,
3. the actual procedural character,
4. the G2.4.5 weapon-bind calibrated sword,
5. the committed G2.5.1 correction offsets,
6. the committed G3.2 transition profiles.

Controls:

- Enter / Hold / Recover / Exit / Neutral
- transition-time scrubber
- Enter -> Hold -> Exit cycle playback
- Front / 3-quarter / Side / Back views

The automation gate verifies:

- canonical clip identity,
- Neutral equals Action Studio Idle across 15 major bones,
- Enter start equals Neutral,
- Exit end equals Neutral,
- Enter endpoint weights,
- Recover reaction-overlay contract,
- Exit endpoint weights,
- root stability,
- motion-root stability.

## Visual Evidence

The final artifact contains:

- Neutral
- Enter start
- Enter midpoint
- Enter end
- Hold
- Recover midpoint
- Exit midpoint
- Exit end
- Enter midpoint side view

Manual review of the final artifact confirmed:

- Neutral and Exit end visually match,
- no T-pose/rest fallback,
- Enter midpoint moves toward the accepted Skyrim Guard without root drift,
- Enter end/Hold preserve the accepted mother Guard,
- Side view remains stable with no foot/root fly-away.

## Acceptance Contract

G3.2 is accepted because:

1. Enter starts from the real Action Studio Idle and reaches full Guard in 180 ms.
2. Hold/correction weights ramp together `0 -> 1`.
3. Recover preserves full Guard and fades only the future G3.3 reaction overlay in 140 ms.
4. Exit fades hold/correction together `1 -> 0` in 160 ms and returns to the same Idle.
5. Weighted correction uses shortest-path quaternion interpolation.
6. No root, hips, leg or locomotion authoring was introduced.
7. Real-browser visual lab reports PASS.
8. Full repository tests remain green.
9. The complete pre-G3.2 Skyrim Guard regression workflow remains green.

## Follow-up

### G3.3 — Block Hit / Parry Reaction Authoring

Create compact additive recoil overlays over the stable mother Guard. G3.2's `reactionOverlayWeight` contract is already ready to fade those reactions back into Hold.

### G3.4 — Counter Transition

Bind authoritative counter confirmation to a readable Guard -> Counter presentation.

G4 TOP / RIGHT / LEFT Guard variants remain out of scope until the Guard family lifecycle is visually stable.
