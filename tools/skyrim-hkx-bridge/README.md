# Skyrim HKX -> source GLB

How a `.hkx` animation out of Skyrim becomes a `*.source.glb` this repository will accept.

Everything here is offline authoring. The game never reads a `.hkx`, and the decoder is not
shipped or linked - see `build-havok-toolset.sh` for the licence reasoning.

## What you need

Two files, and they must be a matched pair:

| | | |
|---|---|---|
| `skeleton.hkx` | the rig the clip was authored against | `hkaSkeleton`, 19 semantic bones |
| `<clip>.hkx` | the animation | `hkaSplineCompressedAnimation` + `hkaAnimationBinding` |

Both must be the same Havok generation (`hk_2010.2.0-r1` for Skyrim LE). A clip baked against a
different skeleton is the failure that is hardest to catch afterwards, because it produces a
plausible animation on the wrong hierarchy - so the pair is checked before anything is decoded.

Raw `.hkx` files are **not committed**. What is committed is a manifest recording each input's
sha256 (`greatsword-input-manifest.json` and siblings), so a bake can be traced to its source
without the source living in the tree.

## The four steps

### 1. Build the decoder

```bash
npm run build:havok-toolset
```

Clones PredatorCZ/HavokLib at a pinned ref into `/tmp/havok-toolset`, applies two additive
patches, and builds with **clang** - g++ 13 rejects Spike's reflection templates outright. Takes
a few minutes. The container reclaims `/tmp`, so expect to run this once per session.

### 2. Look at what you have (optional, but do it the first time)

```bash
npm run probe:skyrim-hkx -- <clip>.hkx           # class, version, track count
npm run validate:skyrim-bake-pair -- <skeleton>.hkx <clip>.hkx
```

The second one is the pair contract. If it refuses, stop - converting anyway wastes the rest.

### 3. Convert

```bash
npm run convert:hkx -- <skeleton>.hkx <clip>.hkx <outDir>
```

One command, four things inside it:

- **pair contract** again, because the convert path must never depend on someone having run step 2
- **hk_to_gltf** at sample-rate 30, `visualize=false`, pointed at your skeleton
- **prune** - a clip authored against an extended skeleton carries tracks for bones this skeleton
  does not have, and the exporter numbers them off the end of the node array. The greatsword idle
  arrives with 223 such tracks. Left in, they are channels pointing at nodes that do not exist.
- **validate** - the same check the review harness runs, so a bake that would be refused later is
  refused now, rather than in a directory of accepted assets

Settings go into the toolset's config file, never onto the command line: `hk_to_gltf` announces
"CLI option detected, config won't be loaded, all booleans set to false" the moment any flag
appears, which would silently drop the sample rate. A freshly built toolset has no config yet -
the tool writes its defaults the first time a module runs - so `convert:hkx` seeds it.

### 4. Prove it

```bash
npm run compare:source-bakes -- <reference>.source.glb <new>.source.glb
```

Compares the retarget curves per retarget bone, not per node - `wrist.r` and `hand.r` share one
source node, so a per-node comparison would undercount.

Then add the file's hash to `frozen-source-assets.json`. That one record is what `npm test` and
the three visual workflows check against; nothing else should carry an inline hash.

## Is it deterministic?

Yes, and that is checked rather than assumed. On 2026-09-05, from a compiler build made minutes
earlier in a container that had lost the previous one:

```
2hm_idle.hkx (53,552 bytes)  ->  2hm_idle.source.glb
  198 channels, 223 foreign tracks pruned
  sha256 5167f9e2a6a06f5a9f596e4d01c529d6e9ea85528fcc00e0bb72078a65f50f93
```

Byte-identical to the committed asset. The decoder itself was verified separately against the
2025 Blender bake of `shd_blockidle` - 46 curves across the 23 retarget bones, worst absolute
difference 0.0 (`tests/the-hkx-bake-is-reproducible.test.js`).

## After the GLB

The source GLB is the Skyrim skeleton, posed. It is not yet something the character wears - the
retarget onto the KayKit rig, the weapon bind calibration, and the off-hand IK all happen at
runtime, and none of them are baked into the file. `src/animation/skyrim-animation-retarget.js`
reads this file and must leave it as it found it; `tests/the-retarget-reads-the-file-not-the-scene.test.js`
is why.
