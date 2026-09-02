// R23Z.1 — the player's block is omnidirectional again; the opponent's still guards one sector.
//
// Measured on playtest (block mode, shield held, the opponent swinging TOP/RIGHT/LEFT): pointer in
// the dead zone - three hits of three; pointer in a sector - only the matching direction blocked,
// three of nine. That was R23T.1's one-sector gate wired into BOTH exchanges, overriding the
// R18R / R21C.1 / task #8 decision that the block does not take direction and only the parry
// reads it. The gate is told whose shield it is now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUARD_COVERAGE, planGuardSectorGate } from '../src/combat/guard-sector-gate.js';

test('R23Z.1 an omnidirectional shield covers every direction whatever it is pointed at, and still reports the aim', () => {
  for (const direction of ['top', 'right', 'left']) {
    for (const aimedSector of [null, 'top', 'right', 'left']) {
      const gate = planGuardSectorGate({ direction, aimedSector, coverage: GUARD_COVERAGE.OMNIDIRECTIONAL });
      assert.equal(gate.covers, true, `${direction} vs aim ${aimedSector}`);
      assert.equal(gate.reason, 'omnidirectional-shield-covers-every-sector');
      assert.equal(gate.aimedSector, aimedSector, 'the parry still reads where the shield points');
      assert.equal(gate.coverage, GUARD_COVERAGE.OMNIDIRECTIONAL);
    }
  }
  assert.equal(planGuardSectorGate({ direction: 'diagonal', coverage: GUARD_COVERAGE.OMNIDIRECTIONAL }).covers, false, 'an unknown direction has nothing to cover either way');
});

test('R23Z.1 unsaid, the gate is the one-sector rule R23T.1 measured - the default did not move', () => {
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: null }).covers, false);
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: 'left' }).covers, false);
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: 'top' }).coverage, GUARD_COVERAGE.ONE_SECTOR);
  assert.equal(planGuardSectorGate({ direction: 'top', aimedSector: 'top', coverage: 'anything-else' }).coverage, GUARD_COVERAGE.ONE_SECTOR, 'a word that is not the omnidirectional one is not a wall');
});

test('R23Z.1 the lab tells each exchange whose shield it is: yours is a wall, theirs guards one sector', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  // Composition: both the pre-contact read and the lifecycle callback for the exchange where YOU
  // defend say omnidirectional, and both for the exchange where the opponent defends say one-sector.
  assert.match(entry, /aimedSector: guardSector\.sector, guardCoverage: GUARD_COVERAGE\.OMNIDIRECTIONAL,/);
  assert.match(entry, /guardCoverage: GUARD_COVERAGE\.OMNIDIRECTIONAL, readAimedSector: \(\) => guardSector\.sector,/);
  assert.match(entry, /aimedSector: attackerFighter\.guardSector\.sector, guardCoverage: GUARD_COVERAGE\.ONE_SECTOR,/);
  assert.match(entry, /guardCoverage: GUARD_COVERAGE\.ONE_SECTOR, readAimedSector: \(\) => attackerFighter\.guardSector\.sector,/);
  const controller = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  assert.match(controller, /planGuardSectorGate\(\{ direction: snapshot\.direction, aimedSector, coverage: guardCoverage \}\)/);
});
