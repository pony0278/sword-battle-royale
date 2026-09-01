import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EXACT_FIELDS,
  NUMERIC_TOLERANCES,
  REPORTED_FIELDS,
  SETTLED_YAW_TOLERANCE_DEGREES,
  compareGoldenCell,
  describeCell,
  describeTightestMargin,
  tightestMargin,
} from '../tools/action-studio/b1-golden/golden-grid-diff.mjs';

// R21W.1 - a red gate has to leave evidence.
//
// The golden grid went red once in four runs during R21V.1 and there was nothing to look at
// afterwards: the per-cell diff had scrolled past the summary, and a cell that THREW took the loop
// with it and ended the log on a stack trace with no cell named at all. R20K.1 pinned the frame
// step precisely so these cells reproduce bit for bit, so a red run is either a real behavioural
// change or that pinning stopped holding - and only the numbers separate those two.
//
// So these hold the reporting rather than the fight: every failure names both records, every
// numeric miss carries its distance and its tolerance, and a green run still says which cell came
// closest to its own line.

const cell = Object.freeze({
  dir: 'left', stance: 1.6, blocked: true, clang: false, body: false,
  posture: 'chase', relevance: true, startSep: 1.6, settledSep: 2.223262, settledYawDeg: 0,
});

test('R21W.1 a cell that reproduces reports nothing bad and a margin for each tolerance', () => {
  const { bad, margins } = compareGoldenCell(cell, { ...cell });
  assert.deepEqual(bad, []);
  assert.deepEqual(margins.map((margin) => margin.field), ['startSep', 'settledSep', 'settledYawDeg']);
  for (const margin of margins) assert.equal(margin.distance, 0, `${margin.field} should be exact`);
});

test('R21W.1 a numeric miss carries how far off it was and what it was judged against', () => {
  // The distinction the terse form could not make: a hair over the line reads exactly like a
  // different fight when the message is `settledSep 1.31!~2.22` and nothing else.
  const { bad } = compareGoldenCell(cell, { ...cell, settledSep: 1.316265 });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^settledSep /);
  assert.match(bad[0], /off by 0\.906997/, 'the distance, not just the two values');
  assert.match(bad[0], /tolerance 0\.05/, 'and the line it crossed');

  // Inside the tolerance is not a failure, and does not pretend to be.
  assert.deepEqual(compareGoldenCell(cell, { ...cell, settledSep: cell.settledSep + 0.04 }).bad, []);
});

test('R21W.1 the exact fields are exact, and the stance is not allowed to drift at all', () => {
  for (const field of EXACT_FIELDS) {
    const { bad } = compareGoldenCell(cell, { ...cell, [field]: 'moved' });
    assert.equal(bad.length, 1, `${field} must be compared`);
    assert.match(bad[0], new RegExp(`^${field} `));
  }
  // The stance is set rather than settled, so a millimetre of drift there is a broken driver, not
  // a moving value - it gets a tolerance six orders of magnitude tighter than the settle.
  const startSep = NUMERIC_TOLERANCES.find((entry) => entry.field === 'startSep');
  assert.equal(startSep.tolerance, 1e-6);
  assert.equal(compareGoldenCell(cell, { ...cell, startSep: 1.60001 }).bad.length, 1);

  // Finishing square is measured against zero, not against the record: the record could carry a
  // turned defender and it would still be wrong.
  assert.deepEqual(compareGoldenCell({ ...cell, settledYawDeg: 9 }, { ...cell, settledYawDeg: 9 }).bad,
    [`settledYawDeg 9!=0 (tolerance ${SETTLED_YAW_TOLERANCE_DEGREES})`]);
});

test('R21W.1 a failure prints both whole records, not only the field that moved', () => {
  const line = describeCell(cell);
  for (const field of REPORTED_FIELDS) assert.match(line, new RegExp(`${field}=`), `${field} must be shown`);
  // A missing record still prints - a cell that threw has no measurement, and the golden half is
  // the only evidence there is.
  assert.match(describeCell(null), /blocked=-/);
});

test('R21W.1 the tightest margin is the fraction of a tolerance used, not the absolute gap', () => {
  // The version this replaces ranked absolutely, so it always named startSep - judged at 1e-6 -
  // and the answer was "cleared by 0.000001 of 0.000001" on every run, which says nothing.
  const tightest = tightestMargin([
    { name: 'top@1.4', field: 'startSep', distance: 0, tolerance: 1e-6 },
    { name: 'left@1.6', field: 'settledSep', distance: 0.007, tolerance: 0.05 },
    { name: 'top@2', field: 'settledYawDeg', distance: 0.05, tolerance: 0.5 },
  ]);
  assert.equal(tightest.name, 'left@1.6', '14% of its tolerance beats 10% and 0%');
  assert.ok(Math.abs(tightest.used - 0.14) < 1e-9);
  assert.match(describeTightestMargin(tightest), /left@1\.6 settledSep used 14\.0% of its 0\.05 tolerance/);
  assert.equal(describeTightestMargin(null), null, 'a run with no margins says nothing rather than crashing');
});

test('R21W.1 the driver records a thrown cell instead of ending the run on a stack trace', () => {
  const driver = readFileSync(new URL('../tools/action-studio/b1-golden/verify-golden-grid.mjs', import.meta.url), 'utf8');
  // A behavioural claim about a file that cannot be imported without launching chromium: it exits
  // on missing argv and awaits a browser at the top level. The shape is what is checkable here,
  // and the shape is the whole fix - the loop must not be able to end early.
  assert.match(driver, /try \{ r = await runExchange\(page, cell\); \} catch \(error\) \{ thrown = error; \}/);
  assert.match(driver, /threw · \$\{thrown\.message\}/, 'and the thrown message has to reach the failure list');
  assert.match(driver, /continue;/, 'the remaining cells still get measured');
});

test('R21W.1 the runner repeats a failing gate output beside its verdict', () => {
  // Where the evidence was actually lost: the summary prints three PASS/FAIL lines, and by then
  // the gate detail is a screen or three above it.
  const runner = readFileSync(new URL('../build/verify-combat.mjs', import.meta.url), 'utf8');
  assert.match(runner, /for \(const result of failed\)/);
  assert.match(runner, /result\.output/, 'the captured output is what gets repeated');
});
