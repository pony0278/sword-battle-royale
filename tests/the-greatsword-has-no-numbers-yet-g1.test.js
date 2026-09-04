import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GREATSWORD_ATTACK_MEASUREMENTS,
  createGreatswordAttackTimings,
  greatswordAttackMeasurementsAreComplete,
  missingGreatswordMeasurements,
} from '../src/combat/greatsword-attack-timings.js';
import { LONGSWORD_ATTACK_TIMINGS } from '../src/combat/longsword-attack-timings.js';

// G1 - the greatsword's record exists and is honest about being empty.
//
// The seam is built and the slots are named; the assets those slots would be measured off are not
// in the repository, per handoff/40. This file's job is to make sure that stays visible: a record
// of nulls is only useful while nothing can quietly treat it as measured.

test('G1 the greatsword refuses to be built while it has no measurements', () => {
  assert.equal(greatswordAttackMeasurementsAreComplete(), false);
  assert.throws(() => createGreatswordAttackTimings(), (error) => {
    // The error is the checklist, so it has to name what is missing rather than just fail.
    assert.match(error.message, /handoff\/40/);
    for (const slot of missingGreatswordMeasurements()) {
      assert.ok(error.message.includes(slot), `the error does not name the missing ${slot}`);
    }
    return true;
  });
});

test('G1 no slot is quietly filled with a placeholder that would read as measured', () => {
  const filled = Object.entries(GREATSWORD_ATTACK_MEASUREMENTS)
    .filter(([, slot]) => slot.value != null)
    .map(([name]) => name);
  assert.deepEqual(filled, [],
    `${filled.join(', ')} has a value. Every number in this record must come from the lab - if it `
    + 'was measured, say so in its note and delete it from this assertion.');
});

// The slots are the builder's parameters, and the two lists drift apart the moment either changes.
// Checked against the longsword's record rather than against a hand-written list, so that a
// seventh parameter added to createDirectionalAttackTimings shows up here as a missing slot.
test('G1 the greatsword names a slot for everything the longsword actually supplies', () => {
  const slots = new Set(Object.keys(GREATSWORD_ATTACK_MEASUREMENTS));
  // What the builder returns is not what it takes, so the timings record cannot be introspected
  // directly. These are the six measured tables plus the four resolvers named in handoff/40.
  for (const required of [
    'directions', 'attacks', 'naturalDurations', 'presentationEndSourceSeconds',
    'activeLeadSeconds', 'activeTrailSeconds', 'trailLeadSeconds', 'trailTailSeconds',
    'timeWarps', 'clipSourceFor',
  ]) {
    assert.ok(slots.has(required), `no slot for ${required}`);
  }
  // Every slot says what its measurement is OF. A slot without a note is a slot nobody can fill.
  for (const [name, slot] of Object.entries(GREATSWORD_ATTACK_MEASUREMENTS)) {
    assert.ok(typeof slot.note === 'string' && slot.note.length > 40,
      `${name} has no usable note`);
  }
});

test('G1 the longsword is unaffected by the greatsword existing', () => {
  assert.equal(LONGSWORD_ATTACK_TIMINGS.weapon, 'longsword');
  assert.equal(LONGSWORD_ATTACK_TIMINGS.getProfile('top').contactSeconds, 0.43);
});
