# S0 — the weapon seam, measured

Taken before a second weapon rather than during one, on the same reasoning R20Z was taken before
more systems: the question "what does a katana cost" is answerable by measurement, and answering it
after the work has started means answering it with the work as the evidence.

This scan does not change behaviour. Nothing here was renamed, moved or deleted.

## What was measured, and with what

A knowledge graph over the repository (tree-sitter AST, 5375 nodes / 11144 edges across 624 files,
`contains` 4892 · `calls` 3889 · `imports_from` 2279), cross-checked against `grep` on every symbol
it reported.

**Where the graph is trustworthy here, measured:** on module-level named symbols — exported
functions, constants, imports — recall against a word-boundary grep was **44 of 44**. The single
apparent miss (`createFighter` in `shield-driven-contact-coupling-r281-regression.test.js`) is a
mention inside a comment, so the graph was right and grep was the false positive.

**Where it is blind, also measured, and the reason this document still quotes source:**

| blind spot | measured |
|---|---|
| Frozen-object method dispatch | `createGuardPresentationRuntime` returns `Object.freeze({ sync, … })`; `sync` is not a node, and the 30 `guardRuntime.sync(` call sites produce 0 edges |
| The per-frame pipeline generally | `attacker.update(` 68 · `defender.update(` 31 · `sampleAnimation(` 42 · `registerAnimations(` 36 — none of these targets exist as nodes |
| Comments | 0 of 5375 nodes carry a docstring field; the extractor reads JSDoc, and this repository's measurements live in `//` blocks above declarations |

So the graph was used for **enumeration** — which files touch a symbol, exhaustively — and every
classification below was made by reading the source it pointed at. The graph cannot be the source of
truth for a calibrated number, because it does not carry the paragraph that says how the number was
measured.

## The size of the seam

Narrower than the file names suggest. Six modules carry `longsword` in their name, and the symbols
they export reach **11 modules under `src/`** — at most four per symbol. The large fan-outs are the
workbench and the record: 39 files under `tools/` and `tests/`.

| symbol | src | tools | tests |
|---|---:|---:|---:|
| `LONGSWORD_ATTACK_DIRECTIONS` | 4 | 0 | 3 |
| `LONGSWORD_GUARD_AUTHORING_STATE` | 4 | 5 | 3 |
| `LONGSWORD_ATTACK_PHASES` | 2 | 5 | 8 |
| `LONGSWORD_GUARD_BASE` | 2 | 0 | 3 |
| `applyGuardQuaternionOffsetsWeighted` | 2 | 2 | 1 |
| `LONGSWORD_GUARD_REACTION_PROFILES` | 2 | 1 | 2 |
| `createLongswordDirectionalAttackRuntime` | 1 | 11 | 5 |
| `getLongswordDirectionalAttackProfile` | 1 | 0 | 5 |
| `sampleLongswordAttackRecovery` | 0 | 9 | 1 |

## A — data that is genuinely the longsword's

A second weapon needs its own copy of each of these, and every number in them is a measurement, not
a preference. None of it can be typed; it has to be re-measured in the lab the way the originals
were.

| holder | what it holds |
|---|---|
| `LONGSWORD_DIRECTIONAL_ATTACKS` (`longsword-directional-metadata.js`) | clip bindings `UAL1/Sword_Attack`, `UAL2/Sword_Regular_A`, `UAL2/Sword_Regular_B`, and measured `contactSeconds` 0.43 / 0.23 / 0.26. **Already carries a `weapon: 'longsword'` field on every entry.** |
| `NATURAL_DURATIONS` (`longsword-directional-attack-runtime.js`) | 1.533 / 0.433 / 0.533, plus the per-frame blade-axis tail measurements that decide where presentation stops sampling |
| `LONGSWORD_GUARD_BASE` (`longsword-guard-metadata.js`) | source asset, `clipId`, `correctionLayerId`; also carries `weapon: 'longsword'` |
| `LONGSWORD_GUARD_AUTHORING_STATE` | per-bone quaternion offsets for five bones at `baseSample` 0.50, with its workflow-run provenance |
| `LONGSWORD_TRIANGLE_GUARD_TARGETS` | eight geometric gates — hand heights, sword-tip height, forward dot, triangle area, torso yaw |
| `MEASURED_RECOVERY_TRAVEL_DEGREES` and neighbours (`longsword-contact-recovery-presentation.js`) | recovery travel and settle rates |
| `V3_LONGSWORD_DEFINITION` (`procedural-v3-longsword.js`) | the blade geometry the contact sampler reads |
| the mount quaternions in `weapon-mount-policy.js` | already documented in place: 24.98° of blade axis, and the reach table it moves |

## B — weapon-agnostic mechanics wearing the longsword's name

These are misnamed, not coupled. Moving them is a rename and a file move with no behaviour change,
and it is what makes A legible as data.

| symbol | why it is not the longsword's |
|---|---|
| `LONGSWORD_ATTACK_DIRECTIONS` = `['top','right','left']` | the directional triangle itself. `guard-sector.js:150` and `attack-direction-as-defended.js:55` both assert that the guard sectors and these directions are the same vocabulary — which is the point: it is the vocabulary, not the weapon's. |
| `LONGSWORD_ATTACK_PHASES` = `IDLE / WINDUP / ACTIVE / RECOVERY / INTERRUPTED` | a state vocabulary. Its two `src` consumers (`contact-lifecycle-director`, `swing-windup-tracking`) read phases, never a weapon. |
| `applyGuardQuaternionOffsetsWeighted`, `applyGuardQuaternionOffsets`, and the quaternion helpers in `longsword-guard-correction.js` | generic rig maths. The offsets arrive as a parameter; nothing in the function knows what is held. |
| `LONGSWORD_GUARD_CORRECTION_SCOPE` | a bone list — the right arm chain. It belongs to the rig, and any right-hand weapon shares it. |

## C — the single-weapon assumptions, which are the actual blockers

Four sites, and one of them is good news.

**1. `fighter-condition.js:49` — bound at import time.**

```js
export const MEASURED_CONTACT_SECONDS = getLongswordDirectionalAttackProfile('top').contactSeconds;
```

A module-level constant evaluated when the module loads, from one weapon's one direction, and the
assisted-parry stagger is derived from it. This is the sharpest one: it cannot take a second value
without becoming a function of the fighter's weapon, and everything downstream of the stagger moves
when it does.

**2. `guard-state-machine.js:114` — a weapon frozen into a mechanic.**

`LONGSWORD_GUARD_PRESENTATION` is built at module load and freezes `clipId`, `correctionLayerId`
and `correctionAuthoredStage` into the state machine's presentation baseline; lines 110-112 bind
`BLOCK_HIT` / `PARRY` / `PERFECT_PARRY` profiles the same way. The state machine is category B —
guard states are not a weapon's — but its baseline table is category A data, resolved once, at
import.

**3. `guard-sector.js:150` and `attack-direction-as-defended.js:55`.**

Module-level assertions coupling sector count to `LONGSWORD_ATTACK_DIRECTIONS.length`. Harmless
today, and correct — but they are the shape of the assumption, and they are why B has to be renamed
before A can move.

**4. `two-actor-combat-integration.js:242` — the seam already exists.**

```js
const attackRuntime = options.attackRuntime || createLongswordDirectionalAttackRuntime(options.attackOptions);
```

Injection with a longsword default. A second weapon is passed in here; nothing has to be extracted
first. The same pattern holds for `guardMachine`, `outcomeGate` and `recoilPlanner` on the lines
below it.

## The opponent seam, for the same reason

`opponent-drive.js` imports `LONGSWORD_ATTACK_DIRECTIONS` and owns
`MEASURED_OPPONENT_THREAT_CEILING_METERS` (top 2.9m / right 2.6m / left 2.6m, swept 1.40-3.90m in
0.10m steps). It states in its own header that it is an input source and touches no contact, poses
or outcomes — which makes it the cleanest seam in the repository, and the place an opponent profile
goes. Its reach table is category A data belonging to the pair (weapon, opponent), not to either
alone: it is a measurement of *this* weapon reaching *that* body.

## What this scan deliberately did not do

**Nothing was renamed.** A rename against the golden grid and the parry gate is a change to make
deliberately, not a side effect of a scan.

Corrected after the fact: this section first claimed the B renames touch `guard-state-machine.js`
and so collide with C-2. They do not. Measured, all four category-B symbols appear in that file
zero times — its longsword imports are `LONGSWORD_GUARD_BASE`, `LONGSWORD_GUARD_AUTHORING_STATE`,
`LONGSWORD_GUARD_REACTION_PROFILES` and `LONGSWORD_GUARD_COUNTER_PROFILE`, every one of them
category A. B touches `opponent-drive`, `guard-sector`, `attack-direction-as-defended`,
`contact-lifecycle-director`, `swing-windup-tracking`, `pre-contact-controller`,
`guard-presentation-runtime` and `predictive-intercept-parry`; C-2 touches `guard-state-machine`.
The two sets are disjoint, so their order is free.

**The `tools/` and `tests/` fan-out was not classified.** 39 files, and most of them are the record
of which probe belonged to which stage. Deleting or renaming evidence is a decision for the person
who owns the record.

**No weapon record was designed.** The shape is now visible — A is the payload, B is the vocabulary
it is expressed in, C is where a single value is currently resolved — but choosing the record's
fields is S1, and it should be chosen against the golden grid, not against this document.

## Still open

- `MEASURED_CONTACT_SECONDS` has three test consumers and no `src` consumer besides its own module.
  Whether it wants to be a fighter-scoped value or stay a module constant with the longsword as an
  explicit default is the first S1 decision.
- `sampleLongswordAttackRecovery` has 9 `tools/` consumers and 0 in `src`. Either the labs are
  ahead of the game, or it is workbench-only and named as though it were not.
- `LONGSWORD_GUARD_PRESENTATION` has 0 `src` consumers and 2 test consumers, while being the table
  the state machine reads internally. It is exported for the tests alone.
