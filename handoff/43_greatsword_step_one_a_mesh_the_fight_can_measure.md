# 43 — Greatsword, step one: a mesh the fight can measure

handoff/40 listed the mesh as the one requirement no retiming substitutes for, because contact is
read off the blade polyline: a greatsword sharing the longsword's blade has the longsword's reach to
the millimetre, and 大範圍 is then not a property the fight can see.

The mesh arrived. This is it extracted, drawn as lines, mounted, and measured. **No timing, no move,
no combat number changed** — the golden grid, the parry gate and the defence matrix reproduced every
committed value, which is the twelfth consecutive reproduction.

## What the mesh is

`assets/kaykit/weapons/sword_E.glb`, user-supplied and KayKit-shaped (material `weapons`, texture
`weapons_bits_texture`, matching the package this repository's rig already comes from). 818
vertices, 616 triangles, one primitive, **no skin and no animations** — which is correct: a weapon
parents to `HAND_R` and is posed by the hand.

Its texture is an external URI that was not supplied, so it renders untextured. That costs nothing
measured: contact is geometry, and the weapon draws as edges rather than shaded surfaces.

## A claim I made and then had to withdraw

I first reported that the greatsword's blade axis was reversed and would need its own transform.
It does not. That came from comparing the greatsword's **raw file** against the longsword's
**post-transform committed values**. The v3 extractor applies `rotate-z-pi` — negate x and y — to
the longsword's raw source too, and measured against each other the two files are authored the same
way. The same `coordinateTransform` applies unchanged, and a test asserts the property rather than
the memory: in both definitions the tip is below the guard, the pommel above it, and the tip is the
lowest point of the mesh.

## Where the rig node numbers come from

Eleven nodes, the same ids as the longsword, because `procedural-v3-weapon.js` builds a line weapon
out of exactly those. They are not one kind of number:

| | how |
|---|---|
| `blade.tip`, `guard.l`, `guard.r`, `guard` | **measured off this mesh** |
| `grip`, `secondary_grip`, `pommel`, `blade.root`, `blade.mid`, `parry.point` | **the longsword's proportions** of the greatsword's own spans |

The split is what the mesh can and cannot answer. A crossguard is visible in the geometry — it is
the band where the silhouette is widest — and **the method was validated before it was trusted**:
run over the longsword, taking the mean Y of every vertex in the outer tenth of `|x|`, it returns
**-0.2043** against the **-0.20** that definition has carried since it was authored. On the
greatsword it selects 56 vertices spanning 0.070 — a band, not a smear down the blade.

A "grip" is not visible the same way; it is a convention about where a hand goes along a handle. So
those keep the longsword's fractions, read out of the committed longsword definition at extraction
time rather than copied as literals, so the relationship stays true if the longsword is re-extracted.

## Measured

```
crossguard   Y -0.4053 from 56 vertices spanning 0.0696
blade        guard -0.4053 -> tip -2.8237   (2.4184, longsword 1.2095, x1.9995)
grip         guard -0.4053 -> butt  0.4280  (0.8333, longsword 0.5658)
contact span blade.root -0.6052 -> tip -2.8237 = 2.2185 (longsword 1.1095)
```

Rendered on the rig, in the hand, through the real Three.js: **contact polyline 2.2185 m against the
longsword's 1.1095 m — exactly 2.00x.** That is the number the sweep sampler reads, and it is the
reason a second mesh was worth sourcing at all.

## One defect found and fixed on the way

`createProceduralV3Longsword(THREE, { definition })` took a definition and then **drew the
longsword's blade regardless**: `createExactV3Outline` read the longsword's geometry module directly
rather than the definition it was handed, and the validator rejected any definition not built from
that same module. So the seam looked open and was not.

Both now come from the definition, which carries its own `sourceGeometry`. The module is
`procedural-v3-weapon.js` — it builds any of them, and the old name was half a lie in the way
handoff/41's category B describes. `object3d.name` is derived from the weapon type, so the longsword
is still `V3_PROCEDURAL_LONGSWORD` and the scene chain `weapon-mount-policy.js` documents stays true.

The failure this would have produced is the worst shape available: the drawn blade and the measured
blade disagreeing, silently.

## The greatsword is opt-in, deliberately

`V3_GREATSWORD_DEFINITION` lives in its own module. Its geometry is **82 KB of generated source, 10.8
KB gzipped**, and the builder is reached by every page that draws a sword — eagerly importing it
would spend part of the cold-start work (~180 requests to 14) on a weapon nobody has equipped.
Verified: the string `v3_greatsword_two_handed_exact_edges` appears in neither the standalone
Action Studio bundle nor any chunk under `dist/`.

That absence is asserted in the suite, which raised R22J.1's source-text ratchet by one. It is the
KEEP shape — an absence of an import cannot be shown by calling the module — and the reason is
recorded in the baseline comment, as that ratchet requires.

## Two things this did NOT do

- **No mount profile was added.** Both meshes are authored identically and get the same extractor
  transform, so `DEFAULT_KAYKIT_SWORD_MOUNT` applies unchanged, and it does. A greatsword-specific
  mount would be a look decision, and the extraction records the one measurement that decision needs:
  the mount origin sits **48.6% up the grip** against the longsword's **35.4%**. If the hand should
  sit lower on the haft, that is a `position` offset in the mount, made where it can be looked at.
- **Nothing two-handed.** The left hand is not on the hilt, because the pose comes from clips and
  neither retarget family poses `hand_l` onto a grip. That is the next decision, and handoff/40's
  three options stand — with one addition found since: `whole-body-motion-solver.js` already carries
  a seven-phase `TWO_HAND_LEFT_ARM` profile behind a `twoHandGrip` flag, used by Action Studio's
  templates and wired to nothing in the combat path.

## Gates

1458 tests, typecheck clean, both boot gates, and golden grid + parry gate + defence matrix
reproducing every committed number — `left@1.6` still using 14.0% of its tolerance.

CI gains a staleness check for the extraction, beside the Action Studio bundle's. It is not a test,
because re-running an extractor rewrites a tracked file and `npm test` should not.
