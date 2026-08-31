import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARD_SECTORS,
  GUARD_SECTORS_MATCH_ATTACK_DIRECTIONS,
  GUARD_SECTOR_AXIS_DEGREES,
  GUARD_SECTOR_PROFILE,
  GUARD_SECTOR_STAGE,
  planGuardSector,
} from '../src/combat/guard-sector.js';
import { LONGSWORD_ATTACK_DIRECTIONS } from '../src/combat/longsword-directional-metadata.js';

const aim = (offsetX, offsetY, currentSector = null) => planGuardSector({
  offsetX, offsetY, viewportWidth: 1100, viewportHeight: 800, currentSector,
});

test('R21A.2 a sector is named after the attack it answers', () => {
  assert.equal(GUARD_SECTOR_STAGE, 'R21A.2');
  // The whole convention, in one assertion. R21A.1 measured that the swings carry no geometry to
  // match - all three windups travel on the defender's right - so this naming is the only thing
  // tying a player's aim to an attack, and it drifting apart is the failure that replaces a mirror.
  assert.deepEqual([...GUARD_SECTORS].sort(), [...LONGSWORD_ATTACK_DIRECTIONS].sort());
  assert.equal(GUARD_SECTORS_MATCH_ATTACK_DIRECTIONS, true);
  for (const sector of GUARD_SECTORS) {
    assert.equal(typeof GUARD_SECTOR_AXIS_DEGREES[sector], 'number', `${sector} needs a screen axis`);
  }
});

test('R21A.2 up is TOP, right is RIGHT, left is LEFT', () => {
  assert.equal(aim(0, -200).sector, 'top', 'screen up, where y is negative');
  assert.equal(aim(300, 0).sector, 'right');
  assert.equal(aim(-300, 0).sector, 'left');
  // And a long way out in each direction still lands the same place.
  assert.equal(aim(0, -4000).sector, 'top');
  assert.equal(aim(40, -300).sector, 'top', 'a little off vertical is still up');
});

test('R21A.2 the dead zone holds the last sector rather than clearing it', () => {
  const deadZone = Math.min(1100, 800) * GUARD_SECTOR_PROFILE.deadZoneFraction;
  assert.ok(deadZone > 10 && deadZone < 200, `dead zone ${deadZone}px`);
  const drifting = aim(5, 5, 'left');
  assert.equal(drifting.sector, 'left', 'passing back through the middle is not letting go');
  assert.equal(drifting.changed, false);
  assert.match(drifting.reason, /dead-zone/);
  // With nothing held yet it stays empty rather than inventing a choice.
  assert.equal(aim(0, 0).sector, null);
});

test('R21A.2 a cursor resting on a boundary does not flicker', () => {
  // 45 degrees is the top/right boundary. Just past it, holding right, must stay right.
  const justPast = aim(200, -206, 'right');
  assert.equal(justPast.sector, 'right');
  assert.match(justPast.reason, /boundary/);
  // Far enough past and it is a real change.
  const committed = aim(60, -300, 'right');
  assert.equal(committed.sector, 'top');
  assert.equal(committed.changed, true);
  // The hysteresis is symmetric: the same geometry the other way round.
  assert.equal(aim(206, -200, 'top').sector, 'top');
  assert.equal(aim(300, -60, 'top').sector, 'right');
});

test('R21A.2 the bottom boundary is deterministic', () => {
  // Straight down is equidistant from right and left. It resolves to the earlier sector rather
  // than to whichever way a float rounds, and hysteresis means a cursor sweeping through the
  // bottom keeps what it arrived with - so the arbitrary half never happens in play.
  assert.equal(aim(0, 300).sector, 'right');
  assert.equal(aim(0, 300, 'left').sector, 'left', 'arriving from the left, it stays left');
  assert.equal(aim(0, 300, 'right').sector, 'right');
});

test('R21A.2 refuses to aim inside a viewport that does not exist', () => {
  const noViewport = planGuardSector({ offsetX: 100, offsetY: 100, currentSector: 'top' });
  assert.equal(noViewport.sector, 'top', 'a half-built layout must not change the guard');
  assert.match(noViewport.reason, /no-viewport/);
  assert.equal(planGuardSector({}).sector, null);
});

test('R21A.2 carries no authority over contact', () => {
  assert.match(aim(300, 0).authority, /no-contact-authority/);
  assert.match(GUARD_SECTOR_PROFILE.provenance, /not-measured/);
});
