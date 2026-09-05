# 46 — The decoder came inside

handoff/45 concluded that HKX decoding stays outside this repository, and gave two reasons. One was
right and one was wrong, and it matters which.

**Wrong:** "this environment cannot fetch them." That was tested exactly one way — `curl` against
`github.com`, which the proxy 403s — and generalised into a property of the environment. `git clone`
goes through the session's git proxy, which serves anonymous reads of public repositories. HavokLib
cloned on the first try once a `Bash(git clone *)` permission rule existed.

**Right, and load-bearing:** *"A wrong decoder does not throw; it yields bone rotations that look
plausible and are wrong."* That argument is why the fetched decoder was not simply trusted either.

## What made it checkable

`g2-3-1-input-manifest.json` froze the sha256 of `shd_blockidle.hkx` in 2025, and the GLB that was
baked from it — through Blender, reviewed by hand — is committed. A frozen input with a reviewed
output turns "trust this decoder" into "reproduce a known-good bake".

```text
46 curves across the 23 retarget bones
worst absolute difference   0.0000e+0
```

`build/compare-source-bakes.mjs` is that comparison and
`tests/the-hkx-bake-is-reproducible.test.js` is the test. The comparison is per-retarget rather than
per-file: a byte diff fails on things that are not motion (the committed files kept four orphaned
mesh nodes from `strip-presentation-meshes.mjs`; a `visualize=false` bake never creates them), and
per-*node* counting would have hidden that `wrist.r` and `hand.r` read the same source node — losing
it loses two readers, not one.

The test also asserts the comparison can **fail**. A comparator that compares nothing also reports
zero, and "worst difference 0.0" is exactly the number a broken one produces.

## The toolset

`tools/skyrim-hkx-bridge/build-havok-toolset.sh` — clone at `ef5d5c6`, two patches, build with
clang. HavokLib is GPLv3, so its source is fetched into `/tmp` and the repository carries a recipe
rather than a copy; it is used the way Blender is, offline, and nothing it builds is linked into the
game.

Both patches are additive and the 0.0 reproduction is the evidence they changed nothing:

- `#include <cstdint>` in `reflector_class.hpp` and `reflector_enum.hpp`. Newer libstdc++ dropped a
  transitive include these relied on, so they no longer compile anywhere without it.
- clang, not g++. HavokLib's README names clang 10; g++ 13 rejects Spike's reflection templates
  outright (`union mutate has no member named 'i'`). clang 18 compiles them.

`tools/skyrim-hkx-bridge/convert-hkx.mjs` holds the settings a source bake must use — `sample-rate
30`, `visualize false`, the frozen skeleton — written into `havok_toolset.config` rather than passed
as flags, because `hk_to_gltf` announces *"CLI option detected, config won't be loaded, all booleans
set to false"* the moment any flag appears and silently loses them.

## The greatsword, and the defect that nearly shipped with it

`2hm_idle.hkx` converted, validated, and was copied into
`assets/skyrim/greatsword/converted/`. Then a routine measurement asked how many nodes the clip
animates and got **210 — from a file with 118 nodes.**

`2hm_idle.hkx` carries 210 transform tracks. `skeleton.hkx` declares 99 animation bones (plus a
19-bone ragdoll and a wrapper). Skyrim animation packs are routinely authored against an extended
skeleton — XPMSE and friends add weapon-style, twist and physics bones — and `hk_to_gltf` numbers
its output channels by track index, so the surplus came out as:

```text
184 channels  →  nodes 118..209, which do not exist        invalid glTF
 37 channels  →  the ragdoll skeleton                      a stranger's rotation on a named node
  2 channels  →  the wrapper above the bones               would have moved the whole character
```

**Is the rest of the file still right?** The bind offsets answer it. A node's translation in a
skeletal bake is the skeleton's own bone length, so any shift in track numbering scrambles them.
All 23 retarget bones' offsets match `shd_blockidle`'s to every printed decimal — with one
exception, `handslot.r`, the WEAPON node, which is exactly the one a two-handed clip is supposed to
place differently. So the surplus is pruned rather than the pair refused.

`build/prune-foreign-animation-tracks.mjs` does it, `convert-hkx.mjs` runs it before writing
anything, and the result has the reviewed shape exactly: 198 channels on nodes 0..98, which is what
all four guard bakes carry, with the 46 retarget curves bit-for-bit unchanged.

### Two things this cost, and both are worth keeping

**A name test was not good enough.** The first rule excluded nodes named `Ragdoll_` and let two
channels through onto the wrapper — which is named `NPC Root [Root]`, like the bone it parents, and
which carries the entire character. The rule is structural now: the bones are the largest scene-root
subtree, minus that root when it duplicates a descendant's name. A bake whose skeleton root really
*is* the scene root keeps its track, and there is a test for that too.

**The validator asked the wrong kind of question.** `validate-source-glb.mjs` returned
`acceptedForG23Review: true` for a file with 184 dangling channels, because every check it ran asked
what the file *has* — all 19 semantic bones present, self-contained, an animation exists — and none
asked what it points *at*. It refuses dangling channels now, and the four committed guard bakes are
unaffected.

## The method note worth carrying

Both mistakes in this cycle were the same mistake. handoff/45 tested reachability one way and
concluded a property of the environment. The greatsword bake was validated one way — the checks that
existed — and concluded a property of the file. In both cases the missing question was *what would
this look like if it were wrong?*, and in both cases asking it took one command.

## Where the greatsword stands

```text
2hm_idle.source.glb   6.667 s @ 30 fps   198 channels   23/23 retarget bones
                      NPC L Hand 190 rotation keys, NPC R Hand 197
```

Both wrists are busy, which is what a two-handed hold should look like.

## The clip holds the sword. The retarget does not.

handoff/44 pinned the authored pose failing to reach the hilt and said a real clip was what it
wanted. `npm run measure:skyrim-grip-reach` puts the real clip through the production bridge:

```text
best 0.4134 · worst 0.4186 · 0/31 samples within tolerance (0.10)

hands apart, as a fraction of head-to-root height
  in the source clip     13.6%
  after retargeting      30.0%   (2.21x the source)
```

**The animation is the part that is right.** 13.6% of head-to-root is two hands on one haft; the
shield hold measures 52.3% by the same method, which is the control that says the number is a
property of the clip and not of the measurement. The hold is lost in the bridge.

Why: a rotation-only retarget does not preserve *reach* across skeletons with different limb
proportions. Matching every joint angle on a differently-proportioned arm does not put the hand in
the same place. Two things rule out the cheaper explanations — the gap varies by under 0.006 across
6.667 s, so it is a fixed offset rather than a pose that swings past and misses; and HAND_R sits
exactly on PRIMARY_GRIP, so the mount is not it.

So **option C, the off-hand IK, is needed after all**. handoff/44 hoped a real clip would make it
unnecessary. It does not, and now there is a measurement saying why rather than a look. (What the
measurement says changed once it was corrected — see below.)

A second, smaller finding fell out of the same run, independent of the retarget: the greatsword's
`SECONDARY_GRIP` sits **0.0881** from the main hand, against the **0.192** the source clip
authors — 46% of it. The node was placed proportionally from the longsword's, and the clip is the
first thing to say where a two-handed grip actually goes.

## Three of the numbers above were wrong, and the corrections are the finding

Asked to tell apart "the left arm points wrong" from "the sword sits wrong", all three of the
measurements this stage had produced turned out to be answering the wrong question. Each is worth
recording, because each was a plausible-looking number produced by a real tool.

**The mount.** `build/skyrim-grip-reach.mjs` mounted the sword with the raw
`DEFAULT_KAYKIT_SWORD_MOUNT`. `src/game/bootstrap.js` does not: a Skyrim-driven fighter gets
`composeSkyrimWeaponMountCalibration(THREE, DEFAULT_KAYKIT_SWORD_MOUNT, bind)`, the mount composed
with that clip's own G2.4.5 weapon bind. The two differ by **112°**. Every gap the tool had reported
described a configuration that does not ship, and the 112° is what made the haft look 73° off when
it is **20.6°**.

**The reference points, twice.** Skyrim's `Weapon` and `Shield` nodes are the two hands' EQUIPMENT
points — exactly what `handslot.r` and `handslot.l` are here, and what `PRIMARY_GRIP` and
`SECONDARY_GRIP` have to line up with. `NPC L Hand [LHnd]` is the *wrist*, one palm short of the
grip. Comparing source wrists against target sockets is comparing two different things:

```text
                        source   this rig   ratio
wrist to wrist            13.6%     17.9%    1.32x     the POSE - the retarget's job
equipment to equipment     9.8%     36.0%    3.66x     the GRIP - what has to reach
```

The "2.21x hand separation" this document reported was the first row measured against the second.
Measured like for like, **the retarget largely keeps the pose.**

## Where the reach actually goes

```text
how far each equipment point sits off its own wrist, per head-to-root height
  Skyrim   off hand 6.4%   main hand 4.9%
  this rig          15.1%  on both sides      2.3x
```

`handslot.l` and `handslot.r` hang more than twice as far off the wrist as Skyrim's equipment nodes
do. Two points each flung 0.10 further out, in the directions two differently-angled hands point,
is how a 0.12 grip span becomes 0.43. And the retarget cannot correct it: `SKYRIM_BONE_RETARGETS`
gives those two bones **rotation only**, so the rest-pose offset is never touched.

That is a change to `procedural-kaykit-rig.js` that would move every weapon and every shield on
every clip, and the G2.4.5 calibration and all six defence-matrix timings sit on top of it. Not a
change to make while answering a greatsword question.

## What was fixed: the grip node

`SECONDARY_GRIP` is derived from the clip now instead of from the longsword's proportions.
`build/extract-greatsword-geometry.mjs` carries the derivation:

```text
2hm_idle.source.glb, at rest:  Weapon -> Shield  11.540 source units
                               head-to-root     117.39
                            =  0.0983 of a body, 166.8 deg off the source weapon's +Y
                               (along the haft; 2.64 units off-axis is the wrist's own offset)
this rig's rest head-to-root   1.2414        ->  0.1220
```

0.0881 → **0.1220**. It moves the worst gap from 0.4018 to **0.3912** — real, correct, and small,
which is the point: it had to be settled before an IK solver could be written, because the solver
would have aimed at it.

The authored-pose record in `tests/two-hand-grip.test.js` moved with it (greatsword plant
0.2671 → 0.2839, impact 0.7817 → 0.7889) — the pose did not change, the target did.

`tests/the-clip-holds-the-sword-the-retarget-does-not.test.js` pins all of it, the control included,
in the same spirit as handoff/44's record of failure: numbers for a fix to beat.

## It is loadable now

Action Studio's **External Motion Library → Skyrim Greatsword → Load selected pack** fetches it and
retargets it, and **V3 Rig Line Only → Stage weapon** swaps the figure's blade so the pose can be
read against the sword it is meant to hold. Both are driven end to end by
`build/verify-built-studio.mjs` against the built page, alongside the Guard Runtime sample it
already reproduced.

Three decisions worth keeping:

- **Its own pack, not a fifth guard entry.** `SKYRIM_GREATSWORD_CONVERTED_FILES` and its own base
  URL. The Guard state machine plays every entry in its own list, and the derived parry-deflect
  clips are built from the `shd_*` family by name — a greatsword clip in that list would end up
  inside the Guard machine. The test asserts the pack produces no virtual clips.
- **The weapon is held, not captured.** The preview runtime and the motion-guide overlay each read
  the sword once at construction — the trail reads its tip, the off-hand guide reads its secondary
  grip — so both now take a `setSword`. Without it the swap leaves the old blade's trail behind.
- **The 82 KB is paid by the authoring page only.** The standalone studio bundle went 512,092 →
  600,348 bytes; the community lab chunk stayed at 495.66 kB and carries no reference to the
  greatsword at all. That is the split R22J.1's absence assertion exists to protect.

The status line says what the measurement found, where an author will read it: *"1 converted
greatsword clip retargeted at 30 fps · the off hand does not reach the hilt yet"*.

## The off hand goes on the hilt

```text
worst gap  0.3928 -> 0.000000   on every one of 31 frames
largest correction   shoulder 47.7 deg   elbow 20.1 deg   budget 60
equipment span       9.8% source -> 10.3% here, 1.04x
```

`src/animation/two-bone-ik.js` is the solver and `src/animation/off-hand-grip-ik.js` aims it at the
weapon's own `SECONDARY_GRIP`. Two bones — `upperarm.l` and `lowerarm.l` — and everything past the
elbow rides along rigid, which is what makes it correct to target a *socket* rather than a bone.

It is the smaller of the two fixes on purpose. The socket offset above is still 2.3x Skyrim's; this
closes the gap where it shows without moving a single piece of equipment.

Four decisions worth keeping:

- **The elbow keeps the plane the animation put it in.** A two-bone chain has one degree of freedom
  left once the hand is fixed, and this solver spends it by keeping the arm's existing plane rather
  than inventing a pole vector it has no evidence for. Tested: two arms bent in different planes
  toward the same target keep their own elbows.
- **It refuses rather than doing its best.** Out of reach, or over budget at either joint, and the
  pose is restored exactly. A solver that half-reaches is how a limb ends up somewhere nobody chose.
- **The budget was measured, not guessed.** It was written as 45 and refused all 31 frames; the clip
  needs 47.7 at the shoulder. 60 now, with the first value and its failure recorded next to it.
- **A shield refuses it.** `shield-arm-hold.js` already owns this exact chain whenever a shield is
  up, and two writers on one arm is a bug rather than a merge. The rule is checked, not documented:
  anything socketed on `HAND_L` and the grip does nothing.

The grip span coming out 1.04x the source's is the evidence that it closed for the right reason —
both hands sit on the haft the way the animator put them, rather than the hand merely arriving at a
point.

In Action Studio it is **V3 Rig Line Only → Off-hand grip (IK)**, defaulted on for the greatsword
and off for the longsword, because whether the off hand is free is a property of what is held. The
status line says what happened, including the refusals in terms an author can act on — the studio's
own authored poses honestly report *"the hilt is beyond the off arm in this pose"*, since the
seven-key chop leaves gaps up to 1.26.

## Still not done

Nothing in the fight plays it — the Guard machine does not reach for it, `greatsword-attack-timings.js`
is still ten `null`s, and `bootstrap.js` does not run the off-hand grip; it is wired into the
authoring page only. The socket offset is still there, and every future Skyrim clip will inherit it.
