# Skyrim Greatsword converted-source assets

Same rules as `assets/skyrim/guard/converted/`: these GLBs carry the **Skyrim source hierarchy and
the source animation**, not a baked target rig, and Action Studio retargets them through the
production Skyrim → procedural Blockman bridge. Raw `.hkx` files are intentionally **not shipped**.

What is different is where they came from.

## The first bake this repository made itself

The four guard clips were baked through Blender in 2025 and reviewed by hand. `2hm_idle` was
decoded here, by `tools/skyrim-hkx-bridge/convert-hkx.mjs`, on top of HavokLib's `hk_to_gltf`:

```bash
bash tools/skyrim-hkx-bridge/build-havok-toolset.sh
node tools/skyrim-hkx-bridge/convert-hkx.mjs skeleton.hkx 2hm_idle.hkx \
  assets/skyrim/greatsword/converted
```

That is only trustworthy because the same tool reproduces a bake that was already reviewed. The
manifest froze `shd_blockidle.hkx`'s hash, so re-baking it is a comparison rather than an opinion:
**46 curves across the 23 retarget bones, worst absolute difference 0.0.**
`tests/the-hkx-bake-is-reproducible.test.js` is that comparison, and it runs against a re-bake
whenever `HKX_REBAKE_DIR` points at one:

```bash
HKX_REBAKE_DIR=/tmp/rebake node --test tests/the-hkx-bake-is-reproducible.test.js
```

## Frozen source hashes

```text
SHA256 5167f9e2a6a06f5a9f596e4d01c529d6e9ea85528fcc00e0bb72078a65f50f93  2hm_idle.source.glb
```

Inputs are frozen in `tools/skyrim-hkx-bridge/greatsword-input-manifest.json` - the same
`skeleton.hkx` the guard pack was baked against, which is why the two packs' bone offsets are
identical.

## The clip

```text
2hm_idle.source.glb
→ SKYRIM_GREATSWORD/2hm_idle
```

6.667 s at 30 fps, 198 channels on the 99 animation bones, all 23 retarget bones resolved. The two
wrist tracks are both busy - 190 and 197 rotation keys - which is the point: it is a two-handed
hold, and the left hand is on the hilt rather than free.

## Where it is loaded

```text
Action Studio → External Motion Library → Skyrim Greatsword → Load selected pack
Action Studio → V3 Rig Line Only → Stage weapon → Greatsword
```

`SKYRIM_GREATSWORD_CONVERTED_FILES` in `src/animation/skyrim-converted-animation-library.js` is the
list, and it is deliberately separate from `SKYRIM_GUARD_CONVERTED_FILES`: the Guard state machine
plays every entry in its own list, and the derived parry-deflect clips are built from the `shd_*`
family by name. Nothing in the fight reaches for this clip yet.

## Its tracks were pruned, and yours will need to be too

`2hm_idle.hkx` carries **210** transform tracks. This skeleton has **99** animation bones. Skyrim
animation packs are routinely authored against an extended skeleton (XPMSE and the like add weapon
style, twist and physics bones), and `hk_to_gltf` numbers its channels by track index, so the
surplus came out as channels pointing past the end of the node array:

```text
184 channels  →  nodes 118..209, which do not exist
 37 channels  →  the ragdoll skeleton
  2 channels  →  the wrapper node above the bones, which carries the whole character
```

`build/prune-foreign-animation-tracks.mjs` removes them, and `convert-hkx.mjs` runs it before
writing anything, so this is automatic rather than a step to remember. The shared tracks are still
correct: bind offsets are the skeleton's own bone lengths and would scramble under any shift in
numbering, and all 23 retarget bones' offsets match `shd_blockidle`'s to every decimal - except the
WEAPON node, which is exactly the one a two-handed clip should place differently.

`validate-source-glb.mjs` now refuses a bake with dangling channels. It did not before, and it
accepted this file with 184 of them: every check it ran asked what the file *has*, and none asked
what it points *at*.

## Presentation meshes

There are none to strip. The bake runs with `visualize=false`, so no mesh is ever created - the
guard pack's `strip-presentation-meshes.mjs` step exists because its 2025 Blender bakes carried one.
