# R20Z — the maintenance pass, and the rules it left behind

Taken before adding more systems rather than after, on the reasoning that the two things worth
fixing early are the ones that tax every future change and the one that gets more expensive the
longer it waits.

## What was measured first

The structure was healthier than the symptoms suggested: **zero import cycles**, and **0 of 1900
named imports** pointing at something that no longer exists. The problems were all in what surrounds
the code.

| finding | measured |
|---|---|
| The browser gates ran nowhere | 0 of 31 workflows invoked them; the page they drive was gitignored |
| Workflows bound to deleted branches | 13 of 31, unable to fire again |
| Tests pinned to source text | 517 assertions across 44 files |
| The entry's headroom | 719 lines against a 720-line ceiling |
| Two lab pages hand-synced | 96% identical, 209 vs 206 lines |
| Game composition living in the lab folder | 15 modules, 2338 lines |
| `three` in node_modules but not in package.json | a clean CI runner would 404 on the renderer |

## The rules that now hold, and where they are enforced

**Nothing under `src/` may import anything under `tools/`.**
`tests/game-does-not-import-the-lab-r20z4.test.js`. src/ is the game — rules in `src/combat`,
composition in `src/game` — and tools/ is the workbench. The workbench may reach into the game; the
game may not reach back. No manifest: a module lands on one side or the other and the rule reads the
direction off the filesystem. This is what makes a second entry point (a CrazyGames build, a
headless server) a matter of composing `src/game` rather than of extracting it from a lab.

**The measured combat is gated by machine, not by habit.** `npm run verify:combat` regenerates the
probe page from the published lab, serves the repository from `tools/static-server.mjs`, and runs
the golden grid and the parry gate. `ci.yml` runs it after `npm test`. Before this the two gates
that prove a change did not move the combat had never run anywhere but by hand.

**The probe page is generated, never edited.** `build/build-probe-lab.mjs`. It is the published lab
with exactly two CDN script tags rewritten, and a test undoes the two swaps and asserts
character-for-character equality with the lab. The hand-synced copy it replaced had drifted several
stages behind while being the page every local verification measured.

**Comments do not compete with the entry's size budget.** One owner
(`shield-parry-r281-thin-entry-audit.test.js`), counting code lines only. The old raw-line ceiling
charged a comment what it charged a statement, in a repository whose comments are its documentation,
and it had worked: 720 raw lines with 28 of them comments.

## What was deliberately not done

**The 517 source-text assertions stay.** Too large to move safely in one pass, and most of them are
harmless until touched. Clear them file by file as those files are worked on. The three that were
removed are the ones that charged rent on unrelated work: an order-sensitive list of all 90 debug
facade keys, a count of bootstrap's imports asserted in two places, and the raw-line ceiling
duplicated in three.

**The frame loop stays in the entry.** Extracting it was on the list until it was measured: 73 lines
referencing 31 symbols from the entry. Moving it converts an implicit closure into a 31-field
parameter bag and makes every new system wire into two places instead of one. The pressure that
motivated it is gone anyway - the entry sits at 657 code lines against 680.

**22 of 37 lab pages have no test, and 12 src modules are imported by nothing but their own tests.**
Both are historical evidence rather than dead weight, and deleting evidence is a decision for the
person who owns the record, not a cleanup.

## Still open

- Rename `createShieldParryLabScene`: it is `src/game/scene.js` now and the name still says lab. A
  five-site rename, left out of the move to keep that diff reviewable.
- 17 workflows remain that only fire on pull requests, while this project pushes straight to main.
  They duplicate `ci.yml` and never run. Collapsing them is subtraction, but subtraction of the
  record of which probe belonged to which stage.
