# Skyrim Guard converted-source assets

These GLBs contain the **Skyrim source hierarchy + source animation**, not an Action Studio-baked target rig. Action Studio retargets them at runtime/authoring time through the production Skyrim → procedural Blockman bridge.

## Canonical Guard Hold

```text
shd_blockidle.source.glb
→ SKYRIM_GUARD/shd_blockidle
```

`shd_blockidle` remains the G2.5.1 Triangle Forward mother Guard and the source of the accepted G2.4.5 weapon bind calibration.

## G3.3.2 accepted Guard reactions

```text
shd_blockhit.source.glb
→ SKYRIM_GUARD/shd_blockhit
→ guard_block_hit

shd_blockbash.source.glb
→ SKYRIM_GUARD/shd_blockbash
→ guard_parry (normal Parry)

shd_blockbashpower.source.glb
→ SKYRIM_GUARD/shd_blockbashpower
→ guard_parry (Perfect Parry variant)
```

The reaction GLBs were baked from the real reviewed Skyrim LE HKX motions against the same canonical 99-joint source hierarchy used by `shd_blockidle.source.glb`. Raw `.hkx` files are intentionally **not shipped** in this directory.

### Frozen source hashes

They are not written here any more. Three workflows carried these three hashes inline, the
mesh-strip below rewrote the files, and none of the copies was updated - so all three gates went red
on `main` and stayed red, because nothing anyone runs locally checked those bytes.

One record now, checked by `npm test` and by every workflow that cares:

```bash
npm run verify:frozen-sources     # tools/skyrim-hkx-bridge/frozen-source-assets.json
```

The hashes below are the pre-strip ones, kept only so the history reads straight:
`270d68b5…` blockhit, `bae74b1c…` blockbash, `603cf832…` blockbashpower.

All three carry 297 animation channels on the canonical 99 joints - translation, rotation and scale for each. The skin itself went with the presentation mesh (see below); the retarget matches joints by name and never used it.

## G3.3.2 runtime windows

The source assets stay intact; trimming is presentation metadata, not destructive editing:

```text
Block Hit       shd_blockhit       source 0.000–0.600 s of 0.800 s
Parry           shd_blockbash      source 0.000–0.333 s of 0.333 s
Perfect Parry   shd_blockbashpower source 0.000–0.480 s of 0.700 s
```

After the useful source window, the G3.1 state machine receives presentation-owned `REACTION_COMPLETE` and hands presentation back to the existing G3.2 Recover transition. Counter availability is exposed as a presentation window only; an actual Counter still requires authoritative `COUNTER_CONFIRMED`.

## Review / authoring tools

The original dedicated source review remains available at:

```text
tools/action-studio/skyrim-guard-visual-review.html
```

Action Studio loads this directory through **Skyrim Guard Probe → Load selected pack**. The production converted-source list now contains the Hold plus the three accepted G3.3.2 reactions.

Do not place raw `.hkx` files in this directory. New experimental GLBs should remain ignored unless they have passed an explicit adoption decision and are deliberately force-added as product assets.

## Presentation meshes are stripped

These files carry the animation and the node hierarchy the retarget matches by name, and nothing
else. `skyrim-animation-retarget.js` reads the source through `root.traverse()` and
`getObjectByName` - it needs the 23 names in `SKYRIM_BONE_RETARGETS`, not geometry - and
`skyrim-weapon-bind-calibration.js` builds its own root from the TARGET rig definition.

Measured before removing anything, per file: node count unchanged at 122, sampler count unchanged,
every sampler's bytes identical, and all 23 source bone names still present. 335 KB came off each
of three files and 125 KB off shd_blockidle - just over 1 MB.

**A re-bake must strip again.** These are committed artifacts rather than build output - the hkx
bridge's inputs are gitignored - so nothing regenerates them automatically:

```bash
node build/strip-presentation-meshes.mjs assets/skyrim/guard/converted/*.source.glb
```
