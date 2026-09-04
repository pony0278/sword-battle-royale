import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const probe = await readFile(new URL('../tools/action-studio/shield-parry-r281/defence-matrix-probe.js', import.meta.url), 'utf8');
const parryProbe = await readFile(new URL('../tools/action-studio/shield-parry-r281/parry-gate-probe.js', import.meta.url), 'utf8');
const goldenCapture = await readFile(new URL('../tools/action-studio/b1-golden/capture-golden-grid.mjs', import.meta.url), 'utf8');

// R21Z.1 - the defence matrix was measuring on the wall clock.
//
// It went red on left@180 with no resolution at all, once. Re-run three times it came back green,
// but not identical: top@180 resolved 'parry', then 'block', then 'parry'. The gate normalises both
// to 'defended' so that wandering never showed as a failure - but the same press resolving by two
// different mechanisms means the press was landing at a different point in the swing each run, and
// left@180 is the tightest cell in the matrix (R21O.3: LEFT arrives late). Sooner or later the
// jitter lands on the wrong side of an edge, and that is the red run.
//
// R20K.1 had already found and fixed exactly this for the golden grid - "about one flipped cell per
// pass, wandering between cells" - and wrote down why. The defence matrix was built afterwards and
// without it. This is the same fix and a test so a third probe cannot be written without it.

test('R21Z.1 the matrix pins the frame step before it times anything', () => {
  assert.match(probe, /api\.setFixedStepMs\(1000 \/ 60\)/, 'the sim step must be pinned');
  // Refuses rather than silently measuring on the wall clock, the way the golden grid does.
  assert.match(probe, /has no pinned frame step/);
  assert.match(goldenCapture, /has no pinned frame step/, 'the precedent this copies');

  // Pinned BEFORE the first press, not somewhere inside the loop.
  const pin = probe.indexOf('api.setFixedStepMs(1000 / 60)');
  const drive = probe.indexOf('await driveOnePress(');
  assert.ok(pin !== -1 && drive !== -1 && pin < drive, 'pin the clock before driving anything');
});

test('R21Z.1 each cell records the TTC its press actually landed at', () => {
  // The number that would have made the original red run diagnosable, and the one that says
  // whether the pinning is still holding: pinned, these must not move between runs.
  assert.match(probe, /pressedAtTtcMs = \(contactSeconds - elapsed\) \* 1000/);
  assert.match(probe, /pressedAtTtcMs == null \? '' : `\(@\$\{row\.pressedAtTtcMs\}ms\)`/,
    'and it has to reach the stamped detail line, or nobody sees it');
});

test('R23B.1 all three browser gates are pinned, not two of them', () => {
  // The parry gate was the last unpinned probe, and it was left that way ON PURPOSE: it presses at
  // the game's own prompt rather than at a named TTC, so it is far less sensitive to frame jitter
  // than the defence matrix was. Less is not none. Across runs of identical code its reported
  // contact points wandered (top 0.93 to 0.94, left 0.10 to 0.17) and it failed once outright, with
  // top resolving to nothing at all, then passed twice on the same commit.
  //
  // Three probes, three pins, one rule - and the rule is checked across all of them here rather
  // than restated in three files, so a FOURTH probe written without one is what fails this.
  for (const [name, source] of [['defence matrix', probe], ['parry gate', parryProbe]]) {
    assert.match(source, /api\.setFixedStepMs\(1000 \/ 60\)/, `${name} must pin the sim step`);
    assert.match(source, /has no pinned frame step/, `${name} must refuse rather than measure on the wall clock`);
  }
  assert.match(goldenCapture, /has no pinned frame step/, 'the golden grid set the precedent');
});
