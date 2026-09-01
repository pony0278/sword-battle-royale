import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFENCE_MATRIX_DIRECTIONS,
  DEFENCE_MATRIX_VERDICT_STAGE,
  MEASURED_AT_DOUBLE_TEMPO,
  MEASURED_DEFENCE_AT_PRESS,
  PARRY_WINDOW_MS,
  PROBED_PRESS_TTC_MS,
  directionsWithoutOverlap,
  judgeDefenceMatrix,
} from '../src/combat/defence-matrix-verdict.js';
import { COMMITTED_PARRY_CONTACT_GATE_PROFILE } from '../src/combat/committed-parry-contact-gate.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const probe = await readFile(new URL('../tools/action-studio/shield-parry-r281/defence-matrix-probe.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('R21P.1 every probed press sits inside the window the gate itself accepts', () => {
  assert.equal(DEFENCE_MATRIX_VERDICT_STAGE, 'R21P.1');
  // The point of the matrix is that these are LEGAL moments - the game tells the player to press
  // here. Probing outside the window would be asking a different, easier question.
  assert.equal(PARRY_WINDOW_MS.opensAtTtc, COMMITTED_PARRY_CONTACT_GATE_PROFILE.earliestInputTtcSeconds * 1000);
  assert.equal(PARRY_WINDOW_MS.closesAtTtc, COMMITTED_PARRY_CONTACT_GATE_PROFILE.latestInputTtcSeconds * 1000);
  for (const ttc of PROBED_PRESS_TTC_MS) {
    assert.ok(ttc <= PARRY_WINDOW_MS.opensAtTtc && ttc >= PARRY_WINDOW_MS.closesAtTtc,
      `${ttc}ms must be a moment the gate would accept`);
  }
});

test('R21P.1 a parry and a block both count as defended', () => {
  // The grade is the parry composition gate's question. This one only asks whether the blow landed.
  const observed = {
    top: { 180: 'block', 120: 'parry' },
    right: { 180: 'parry', 120: 'parry' },
    left: { 180: 'parry', 120: 'block' },
  };
  assert.equal(judgeDefenceMatrix(observed).pass, true);
});

test('R21P.1 an undefended legal press fails the gate', () => {
  const observed = {
    top: { 180: 'block', 120: 'parry' },
    right: { 180: 'parry', 120: 'parry' },
    left: { 180: null, 120: 'parry' },
  };
  const run = judgeDefenceMatrix(observed);
  assert.equal(run.pass, false);
  assert.equal(run.failures.length, 1);
  assert.deepEqual(
    { direction: run.failures[0].direction, pressTtcMs: run.failures[0].pressTtcMs, actual: run.failures[0].actual },
    { direction: 'left', pressTtcMs: 180, actual: 'undefended' },
  );
  // Anything that is not a parry or a block is undefended, including a missing resolution - the
  // shape five ad-hoc probes kept producing.
  for (const outcome of [null, undefined, 'unblocked', 'no-resolution']) {
    const row = judgeDefenceMatrix({ ...observed, left: { 180: outcome, 120: 'parry' } });
    assert.equal(row.pass, false, `${outcome} must not count as a defence`);
  }
});

test('R21P.1 the committed record is what 1x actually does', () => {
  // Every direction defends a press made anywhere in its own window at 1x. Recorded because the
  // browser gate reproduces exactly this, not because it ought to be true.
  for (const direction of DEFENCE_MATRIX_DIRECTIONS) {
    for (const ttc of PROBED_PRESS_TTC_MS) {
      assert.equal(MEASURED_DEFENCE_AT_PRESS[direction][ttc], 'defended');
    }
  }
  assert.deepEqual(directionsWithoutOverlap(), []);
});

test('R21P.1 the 2x defect is recorded with the numbers that show why', () => {
  const m = MEASURED_AT_DOUBLE_TEMPO;
  // The window is fixed in ms, the blockable range is geometry and scales - so they cross over.
  assert.ok(m.guardStillDefendsWhenRaisedAtTtcMs.left > PARRY_WINDOW_MS.opensAtTtc,
    'LEFT needs the guard up before its own parry window opens');
  assert.ok(m.guardStillDefendsWhenRaisedAtTtcMs.top <= m.guardStillDefendsWhenRaisedAtTtcMs.left);
  assert.ok(m.guardStillDefendsWhenRaisedAtTtcMs.right <= m.guardStillDefendsWhenRaisedAtTtcMs.left);
  assert.ok(m.leftBoundaryMs.fails < m.leftBoundaryMs.works, 'later presses are the ones that fail');
  // The reason five hand-written probes measured a no-op: the press only exists in block mode.
  assert.equal(m.setGuardHeldIsInertOutsideBlockMode, true);
  assert.match(entry, /if \(selectedMode !== 'block'\) return guardKeyHeld;/);
});

test('R21P.1 the probe drives the real path, in the mode the press exists in', () => {
  assert.match(probe, /api\.setMode\('block'\)/);
  assert.match(probe, /api\.setGuardHeld\(true\)/);
  // The lane reset five ad-hoc probes went without, and the aim through a real pointer event.
  assert.match(probe, /api\.resetLane\?\.\(\)/);
  assert.match(probe, /dispatchEvent\(new PointerEventCtor\('pointermove'/);
  // The review aid rescales the very thing being timed, so the probe refuses to run under it.
  assert.match(probe, /if \(slowReview\) slowReview\.checked = false;/);
  // Measurement only: the probe reports, src/combat judges.
  assert.doesNotMatch(probe, /parryGate\.(arm|confirm)\(/);
  assert.match(entry, /maybeStartDefenceMatrixProbe\(/);
});

test('R21P.1 the review aid no longer defaults on', () => {
  // It rescales the pre-contact phase to 0.12x and freezes the sim for 1.5s at the window, and it
  // reset to checked on every reload - three playtests were recorded through it unnoticed.
  const toggle = page.match(/<input id="slowReview"[^>]*>/)[0];
  assert.doesNotMatch(toggle, /checked/);
});
