# B — the vocabulary leaves the weapon

handoff/39 sorted every longsword-named symbol into three piles. This is the second pile done.

Category B was defined there as *weapon-agnostic mechanics wearing the longsword's name*: things that
are misnamed rather than coupled, where the move is a rename and a file move with no behaviour
change. Four entries, all four now moved.

Nothing in this change reads a clip, a contact time or a blade, and the gates say so: the golden
grid, the parry gate and the defence matrix reproduced every committed number, to the digit.

## What moved

| was | is | why it was never the longsword's |
|---|---|---|
| `LONGSWORD_ATTACK_DIRECTIONS` in `longsword-directional-metadata.js` | `ATTACK_DIRECTIONS` in `attack-directions.js` | the three words the guard sectors are also named from. Two modules assert that equality at import; that assertion is the argument. |
| `LONGSWORD_ATTACK_PHASES` and `getLongswordAttackPhase` in `longsword-directional-attack-runtime.js` | `ATTACK_PHASES` and `getAttackPhase` in `attack-phases.js` | the function reads `activeStartSeconds`, `activeEndSeconds` and `durationSeconds` off a profile. Those three landmarks are what `createDirectionalAttackTimings` produces for any weapon. |
| `LONGSWORD_GUARD_CORRECTION_SCOPE` and `getLongswordGuardCorrectionBones` in `longsword-guard-metadata.js` | `GUARD_CORRECTION_SCOPE` and `getGuardCorrectionBones` in `guard-correction-scope.js` | a bone list and a degree budget per bone. Measured against the rig, not against what the rig is holding. |
| `longsword-guard-correction.js` | `guard-quaternion-correction.js` | the offsets arrive as a parameter. No function in the file can tell a longsword from a greatsword, because none of them is ever told. |

One option key moved with them: `createPreContactController({ longswordAttackPhases })` is now
`{ attackPhases }`. The controller shadowed it into a local constant of the old name, so the lie
reached three lines of its body as well.

## The measured result

Modules under `src/` that import a `longsword-*` module:

| | before | after |
|---|---:|---:|
| all modules | 17 | 11 |
| excluding the `longsword-*` modules themselves | 12 | 7 |

Five weapon-agnostic modules stopped importing the longsword outright - `attack-direction-as-defended`,
`contact-lifecycle-director`, `guard-sector`, `opponent-drive`, `swing-windup-tracking` - and
`guard-quaternion-correction` now imports no weapon module at all.

The seven that remain are not category B. Six of them hold a longsword default that C is about
(`fighter-condition`, `guard-presentation-runtime`, `guard-state-machine`, `guard-transition-presentation`,
`predictive-intercept-parry`, `two-actor-combat-integration`), and the seventh is `game/weapon.js`,
which is the registry: importing the longsword is its job.

## No aliases

The old names are gone rather than deprecated, and
`tests/the-vocabulary-is-not-the-weapons-b.test.js` fails if any of them comes back. A left-behind
alias is how a rename rots - the next weapon copies whichever name it finds first - and this rename
exists precisely so the greatsword is not handed a vocabulary that says "longsword" on it.

That test also pins every value across the move (three directions, five phases, eighteen bones and
their budgets) and checks that none of the four new modules imports a weapon module. The first half
proves nothing changed; the second half is what the change was for.

## Two build defects found on the way, both from S1.C2

`npm run build:action-studio` had been failing since `994345e`, which is a commit from this same
line of work. CI runs that build and diffs its output, so the "Build Action Studio" step has been
red from that commit onward, and every later commit inherited it. Two separate causes, both in the
bundler rather than in the game:

1. Its leftover-ESM check was `/\b(?:import|export)\s/` over the whole file, unanchored. A `//`
   comment in `guard-states.js` explaining why a cycle would form contains the word *import*
   followed by a space, so the module failed to bundle over its own prose while its code was
   already fully rewritten. The check is now anchored to the start of a line, which is where module
   syntax lives after the two rewrites above it have run.

2. It had no case for `export { A, B };` over locally-declared names - the form `guard-state-machine.js`
   uses to keep re-publishing the guard vocabulary after that vocabulary moved out of it. The
   statement is now stripped and its names join the module's export record. The
   `export { A } from './x.js'` form is still unsupported on purpose: it binds nothing locally, and
   the check reports it.

The bundle is regenerated and committed. Worth saying plainly: the tests did not catch this,
because the tests read the bundle rather than rebuild it. Only CI rebuilds, and only CI compares.

## Not verified here

`tools/action-studio/verify-guard-runtime-surface.sh` cannot run in this container. The standalone
Action Studio page still loads Three.js from a CDN, and the sandbox blocks it -
`Action Studio requires Three.js r128`, after `ERR_TUNNEL_CONNECTION_FAILED`. Measured before and
after this change on both the committed and the regenerated bundle: identical failure, same message,
no asset request in either. So this change did not move it, and it is expected to pass in CI, which
has open network.

It is also a loose end worth naming: the cold-start work put
`shield-driven-contact-coupling-lab.html` on one origin with no CDN. `tools/action-studio/index.html`
never got that treatment.

## Still open from handoff/39

- **C-1 remains scoped, C-2 remains partial.** Untouched here; B and C-2 are disjoint, as 39 says.
- **`dodge-state.js`** has not had the C-1 treatment.
- **The direction count is still `3` by assertion** rather than by construction - `guard-sector.js`
  and `attack-direction-as-defended.js` both check `GUARD_SECTORS.length === ATTACK_DIRECTIONS.length`.
  That is now an assertion between two weapon-agnostic modules, which is an improvement, but a
  weapon with four attack directions still breaks it.
- **The `.mjs` migration records under `tools/action-studio/`** carry the old names inside string
  literals. They are records of edits already applied, and rewriting them would falsify the record,
  so they were left alone. They are not runnable against the current source and should not be run.
