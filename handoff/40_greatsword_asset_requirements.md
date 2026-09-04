# 40 — What the greatsword needs before it can be measured

`handoff/06` makes the greatsword Weapon Prototype 2, to verify **武器速度差異 + Heavy Impact**.
G1 built the seam it plugs into. This document is what has to exist before the first number can be
measured, written as a specification rather than a wish, because every constraint below was read
off the repository rather than assumed.

## The seam is ready

Nothing structural is left. A greatsword needs no change to any of these:

| what | where | how a second weapon uses it |
|---|---|---|
| attack timings | `directional-attack-timings.js` | `createDirectionalAttackTimings(sixTables)` |
| guard presentation | `guard-presentation-table.js` | `createGuardPresentationTable(guardMetadata)` |
| contact time | `fighter-condition.js` | `measuredContactSecondsFor({ getDirectionalAttackProfile })` |
| the exchange | `two-actor-combat-integration.js:242` | `createTwoActorCombatIntegration({ attackRuntime })` |

`greatsword-attack-timings.js` is the empty record for the first of these. It throws until the
measurements exist, and the error lists what is still missing.

## 1. The mesh

**Why it cannot be skipped.** Contact is measured off the blade polyline —
`createBladePolylineSampler` reads the weapon's own geometry, and
`measureSweptSwordBucklerClosestApproach` decides outcomes from it. A greatsword sharing the
longsword's blade has the longsword's reach exactly, to the millimetre, and 「大範圍」 is then not a
property the fight can see. It is the one requirement that no amount of retiming substitutes for.

**What exists.** One weapon object, in one place:

```
src/character/v3-sword-geometry-definition.js     generated, "Do not edit by hand"
  id            v3_sword_1handed_exact_edges
  sourceObject  sword_1handed
  source        tools/kaykit_combat_lab_v3_procedural_character_generator.html#EMBED.sword
  vertices      358        triangles 300
  bounds        min [-0.2517, -1.4095, -0.0653]   max [0.2517, 0.3658, 0.0653]
```

The generator's `EMBED` holds `knight`, `sword`, and the animation packs. There is no second
weapon object anywhere in the repository.

**What is needed.**

- A two-handed sword mesh, in a form `build/extract-v3-sword-geometry.mjs` can read — today that
  means an `EMBED`-style base64 glb in an HTML generator, or a `.glb` plus a small change to the
  extractor's input path.
- Blade axis along local **−Y**, grip toward **+Y**, matching the bounds above. The extractor
  applies `rotate-z-pi-for-action-studio-hand-r-mount`; a mesh authored on a different axis needs
  its own transform recorded rather than a fixup at load.
- Longer than 1.775 local units end to end if the reach is meant to differ, and that difference is
  the thing being verified. How much longer is a decision to make in the lab against the measured
  reach table in `opponent-drive.js` (top 2.9m / right 2.6m / left 2.6m for the longsword), not
  here.

**Cheapest acceptable substitute**, if a real mesh is slow to source: the same 358-vertex
definition scaled on Y. `createProceduralV3Longsword(THREE, { definition })` already takes the
definition as a parameter, so a scaled copy needs no code change — only a recorded provenance
saying it is scaled rather than authored, the way `attack-advance.js` marks
`code-driven-target` against `authored-root-motion`.

## 2. The animations

**What exists, and what is already spoken for.**

| pack | clips | used by the longsword |
|---|---|---|
| UAL1 | `Sword_Attack`, `Sword_Idle` | `Sword_Attack` is TOP |
| UAL2 | `Sword_Regular_A`, `Sword_Regular_B`, `Sword_Regular_C`, `Sword_Regular_Combo`, `Sword_Heavy_Combo`, `Sword_Block`, `Sword_Dash`, `Hit_Knockback` | `Regular_A` is RIGHT, `Regular_B` is LEFT |
| KayKit | `Melee_Block`, `Melee_Block_Attack`, `Melee_Block_Hit`, `Melee_Blocking` | the guard counter |
| Skyrim (converted) | `shd_blockidle`, `shd_blockhit`, `power_parry_g363`, `perfect_power_parry_g363` | the whole guard stack |

Unused and one-handed: `Sword_Regular_C`, `Sword_Regular_Combo`, `Sword_Heavy_Combo`,
`Sword_Dash`. `Sword_Heavy_Combo` is the closest thing to an overhead heavy the repository owns.

**The binding constraint is the rig, not the count.** A clip is usable only if its bone names map
through a retarget table, and there are exactly two:

```
QUATERNIUS_BONE_RETARGETS   19 bones, and STOPS AT THE WRIST
  root, pelvis, spine_01, spine_03, Head,
  upperarm_l/r, lowerarm_l/r, hand_l/r,
  thigh_l/r, calf_l/r, foot_l/r, ball_l/r

SKYRIM_BONE_RETARGETS       23 targets, INCLUDING handslot.l and handslot.r
```

**That difference is not cosmetic and it decides the mount.** `weapon-mount-policy.js` measured it:
a Skyrim clip animates where the weapon hangs, so the mount has to undo the difference between
Skyrim's weapon frame and this rig's; the UAL packs never touch the socket — 1.2 degrees across an
entire swing against Skyrim's 0.7 under a guard hold. The mount follows whichever family is posing
the hand, per frame. A two-handed pack therefore needs one of:

- bone names matching Quaternius' 19, so the existing table applies unchanged; or
- bone names matching Skyrim's 23; or
- a third retarget table, written and validated the way
  `handoff/17_skyrim_guard_g2_4_3_arm_chain_fidelity.md` records the Skyrim one being validated.

**A two-handed grip is the open question.** Both existing families drive the right arm chain and,
in Quaternius' case, stop at the wrist — nothing in either poses a left hand onto a hilt. Whether a
two-handed hold needs a left-hand IK, a new socket, or simply a pack that animates `hand_l` onto
the grip is the first thing to establish once a candidate pack exists, and it is the requirement
most likely to cost more than it looks.

**Minimum set for Prototype 2.** Two attack clips are enough to verify speed difference and heavy
impact — one horizontal, one overhead. Guard, parry and recover can start on the Skyrim clips the
longsword already uses; they are a hold and a reaction, and re-measuring them is cheaper than
sourcing them.

## 3. What is NOT blocked on assets

Worth knowing, because it changes what is worth doing while sourcing:

- **Slower is free.** `ATTACK_TEMPO_SCALE_RANGE` is 1 to 3 and a scale below 1 is refused outright,
  so tempo only ever makes a weapon slower. The mechanism for 「慢」 exists and is bounded in the
  right direction.
- **The step forward is a number.** `ATTACK_ADVANCE_PROFILES` holds metres-by-contact per
  direction, and its own comment says they are "numbers now, not baked curves". Execution Slash's
  前踏 is one more entry.
- **Guard, parry and dodge are data.** `createGuardPresentationTable` takes a weapon's guard
  metadata; `dodge-state.js` holds its constants at module level and wants the same treatment
  `fighter-condition.js` got at S1.C1 before a heavy weapon should dodge differently.

## 4. What has no vocabulary yet, and is not an asset problem

From the S0 scan re-run against the greatsword's move list. These are mechanics, not measurements,
and none of them is unblocked by finding a mesh:

| move | what is missing | measured |
|---|---|---|
| Charged Heavy | a charge phase | `LONGSWORD_ATTACK_PHASES` has five states and none of them waits for a release; `grep -i charge` over `src/` returns 0 files |
| Execution Slash | charge, plus probably a guard break | the eight guard states have no GUARD_BREAK; adding one grows `guard-states.js` and every weapon's table gains an entry |
| Unstoppable / high poise | poise | `poise`, `unstoppable`, `guardBreak` return 0 files. The hook exists — the runtime already has an INTERRUPTED phase and an interruption object — but nothing gates it |
| Shoulder / Kick | a contact surface that is not a blade | contact is measured off blade polylines in five modules; `body-hurtbox.js` covers the receiving side only |

`handoff/06` records the greatsword's unique skill as **Unstoppable Cleave**; the decision taken
alongside this document is **Execution Slash**, and 06 is updated to match. That choice trades the
poise mechanic for the charge mechanic, which is the more expensive of the two — the interruption
hook poise would gate already exists, and nothing for charge does.
