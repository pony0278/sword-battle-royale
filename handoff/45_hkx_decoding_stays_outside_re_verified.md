# 45 — HKX decoding stays outside, re-verified

Asked in 2026: can an HKX decoder be installed in this environment, and doesn't Action Studio
already have one? Both halves are answered here so the next person does not re-run the search.

**Short answer: no, and no.** handoff/10's decision from G2.2 still holds, and this is the evidence
for it measured in the current container rather than inherited from that document.

## The misreading, because the filename invites it

`handoff/10_skyrim_hkx_decoder_bridge.md` is titled **"Skyrim HKX Decoder Bridge"**, and it is easy
to remember that as "the repository has a decoder". Its own section 3 is titled *Why the HKX decoder
is an EXTERNAL bridge*, and says:

> `hkaSplineCompressedAnimation` is compressed Havok animation data. The current browser/CI
> environment has no licensed/native Havok 2010.2 decoder, Blender runtime, or `hkxcmd`
> installation. Therefore G2.2 uses a clean dependency boundary: HKX decoding / source skeleton
> interpretation = offline authoring dependency.

And about the probe the repository *does* own:

> The probe intentionally does **not** claim to decompress spline animation data. It only rejects
> incompatible raw inputs early.

**"Bridge" names a boundary, not a converter.** Everything under `tools/skyrim-hkx-bridge/` is a
validator:

| file | what it does |
|---|---|
| `inspect-hkx.mjs` | matches five marker strings; says whether a file is a Skyrim-era Havok animation container at all |
| `real-bake-contract.mjs` | validates a skeleton + animation PAIR, hashes both, checks the 19 semantic source bones |
| `validate-source-glb.mjs` | validates the GLB that came back from the external bake |

Action Studio's own "import a local Skyrim Guard bridge" button reads glTF and nothing else:
`importConvertedSkyrimFile` constructs a `THREE.GLTFLoader` and hands the file to it, and its status
line says `select a .glb`. No path in this repository has ever read Havok animation data.

## What the container actually has, measured

```
java ✓   rust/cargo 1.94.1 ✓   gcc/g++ 13.3 ✓   cmake 3.28 ✓   make ✓   python3 3.11 ✓
wine ✗   mono ✗   blender ✗   dotnet ✗
```

No wine, mono or dotnet closes `hkxcmd` (Windows/.NET) outright. No Blender closes Route A and
Route B from handoff/10 §4 in-container.

## Nothing installable exists in the registries

| registry | searched | result |
|---|---|---|
| npm | `hkx`, `havok`, `skyrim animation` | `hkx*` is an unrelated lint-config org; `havok` is Babylon's physics engine. Nothing. |
| PyPI | `hkxconv`, `hkxpack`, `pyhkx`, `hkx`, `skyrim-hkx` | all 404. `havok` exists as `0.0.0 · Placeholder to prevent dependency confusion`. |
| crates.io | sparse index, exact paths `3/h/hkx`, `hk/xc/hkxconv`, `hk/xp/hkxpack`, `ha/vo/havoklib`, `hk/an/hkanim` | all 404 |

## The structural reason, which is the durable finding

The known open-source converters — hkxpack, hkxconv, HavokLib and friends — live on GitHub, not in a
package registry, and **this environment cannot fetch them.** Every GitHub repository outside the
session's own scope returns 403; `github.com/pony0278/sword-battle-royale` returns 200 and four
candidate converter repositories returned 403.

The allowlist is visible in the JVM's proxy configuration, and it is registries only:

```
registry.npmjs.org   jsr.io   npm.jsr.io   pypi.org
files.pythonhosted.org   index.crates.io   proxy.golang.org
```

crates.io's *search* API is proxied and 403s; only the sparse index is direct, so a crate can be
checked by exact name but not discovered. That is why the table above lists exact names.

So the blocker is not "no tool exists" — tools exist. It is that a source-only tool cannot reach
this container, and a compiled Windows one has no runtime here.

## Why writing one was refused

Parsing the 2010 packfile (classnames / types / data) is work but tractable.
Decompressing `hkaSplineCompressedAnimation` is not: per-track quantisation and spline blocks,
reverse-engineered by the modding community, with **no reference implementation reachable from
here** to check an implementation against.

The decisive argument is the failure mode. A wrong decoder does not throw; it yields bone rotations
that look plausible and are wrong. This repository's whole discipline rests on measurements being
trustworthy — thirteen consecutive identical reproductions of the golden grid, a measured number
behind every handoff. Putting an unverifiable decoder underneath all of that trades the one property
that makes the rest worth anything.

## The case that prompted this: 2hm_idle.hkx

A user-supplied Skyrim two-handed idle — the greatsword's stance clip, the equivalent of
`shd_blockidle` for the shield. Inspected without redistributing it, and **not committed**:
`g2-3-1-input-manifest.json` sets `"commitRawHkx": false`.

```
byteLength      53,552
format          hk_2010.2.0-r1
animationClass  hkaSplineCompressedAnimation
bindingClass    hkaAnimationBinding
acceptedForG22Bridge: true
```

**It clears the constraint handoff/40 called the likely blocker.** All 19 G2.3.1 semantic source
bones are present, and every one of the 23 `SKYRIM_BONE_RETARGETS` targets resolves by name:

```
G2.3.1 source bones          19 / 19
SKYRIM_BONE_RETARGETS        23 / 23 resolvable
  SHIELD             -> handslot.l
  WEAPON             -> handslot.r
  NPC L Hand [LHnd]  -> hand.l
  NPC R Hand [RHnd]  -> hand.r
```

So **no third retarget table is needed** — this is handoff/40's second option, already built and
already driving the longsword's whole guard stack. The file carries 179 `NPC ` bone names against
the existing sources' 99-joint hierarchy, which does not matter: `skyrim-animation-retarget.js`
resolves by `traverse()` and name, never by index or count, so extra joints are ignored.

A method note, since it nearly went into this document wrong: `grep -c "NPC L Hand [LHnd]"` reports
zero because `[LHnd]` is a character class. The counts above are `grep -F`, and the 23/23 is the
retarget table's own alias list run against the file.

**What is missing is the skeleton.** A spline-compressed animation carries tracks only —
`hkaSkeleton` and `hkaSkeletonMapper` appear zero times in this file — so the bake needs the paired
`skeleton.hkx`, and it should be the one the manifest already records (74,048 bytes, sha256
`16a91abd…`) so the result lands on the same canonical hierarchy as the four existing sources.

## What to do, unchanged from handoff/10 §4

Route A, on a machine that has it: import `skeleton.hkx`, import the animation onto it, preserve the
Skyrim source armature and rest pose, export a self-contained GLB with the source hierarchy and one
animation. **Do not retarget in Blender** — G2.1 owns the retarget math, so every source pack stays
comparable.

Hand back `2hm_idle.source.glb`. On this side it needs nothing new.

## The one thing worth measuring the moment it arrives

A two-handed idle should have the off hand on the hilt. `npm run measure:grip-reach` answers whether
it does, against the threshold and the record of failure handoff/44 pinned: the authored pose leaves
gaps of 0.27 to 1.26, and anything under 0.10 means the clip is holding the sword.

If it clears, option C — an off-hand IK — is not needed, and the two-handed grip question closes on
a measurement rather than on a look.
