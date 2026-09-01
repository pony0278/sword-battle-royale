import { GUARD_SECTORS } from './guard-sector.js';
import { LONGSWORD_ATTACK_DIRECTIONS } from './longsword-directional-metadata.js';

export const ATTACK_DIRECTION_AS_DEFENDED_STAGE = 'R21Q.1';

// R21Q.1 - an attack's name and the sector a defender points at are not the same word.
//
// R21C.1 compared them as though they were: `aimedSector === attackDirection`, identity. Three
// playtests in a row then produced the same impossible-looking pattern - of every wrong-direction
// miss against a RIGHT attack, 35 out of 35 had the player pointing LEFT, and not one pointed TOP.
// A player who could not read the attack would spread their errors. That is not confusion; it is a
// mapping, and it was ours.
//
// The camera sits behind the defender at z = +4.3 looking at z = +1.2, so it looks along -z and
// screen-right is world +x. Sampling the blade tip through the parry window (TTC 180 -> 60ms), at
// the calibrated lane, 2x tempo:
//
//   attack named   TTC 180   TTC 120   TTC 60    mean x   appears on
//   top             +0.05     -0.12     -0.78    -0.25    near the middle, as a vertical cut should
//   right           -1.17     -1.41     -1.84    -1.47    the LEFT of the screen, all the way
//   left            +0.22     +0.68     +1.35    +0.68    the RIGHT of the screen, all the way
//
// Neither crosses the centre line at any point in the window. The clips are named in the
// attacker's frame - the hand the cut is thrown with - and the guard sector is named in the
// defender's, because planGuardSector reads a pointer offset in screen pixels. Two fighters facing
// each other mirror every lateral word between them, and TOP is the one direction that survives
// the mirror, which is exactly why TOP was the only direction that ever scored.
//
// So the fix is here rather than in the clip names: renaming the animations would move contact
// timing, the golden grid, the parry gate and ninety test files, to say the same thing this table
// says. What the gate needs is the attack RESTATED IN THE DEFENDER'S FRAME - the sector a player
// looking at the fight would point at - and then the comparison is honest again.
export const DEFENDED_SECTOR_FOR_ATTACK = Object.freeze({
  top: 'top',
  // The lateral pair swaps. This is the whole change.
  right: 'left',
  left: 'right',
});

export const MEASURED_BLADE_SCREEN_SIDE = Object.freeze({
  stage: ATTACK_DIRECTION_AS_DEFENDED_STAGE,
  tempoScale: 2,
  screenRightIsWorldAxis: '+x',
  meanTipXInsideWindow: Object.freeze({ top: -0.25, right: -1.47, left: 0.68 }),
  crossesTheCentreLineInsideTheWindow: false,
  // What the mirror cost, counted from the pasted runs: every wrong-direction miss on a RIGHT
  // attack pointed LEFT, across three separate playtests.
  rightAttacksMisreadAsLeft: Object.freeze({ thisRun: 6, previousRun: 18, runBefore: 11, total: 35 }),
  rightAttacksMisreadAsTop: 0,
  authority: 'naming-frame-only-no-contact-authority',
});

// Both vocabularies are the same three words, which is precisely why the bug was invisible: every
// comparison type-checked and read correctly out loud.
export const NAMING_FRAMES_SHARE_A_VOCABULARY = GUARD_SECTORS.length === LONGSWORD_ATTACK_DIRECTIONS.length
  && GUARD_SECTORS.every((sector) => LONGSWORD_ATTACK_DIRECTIONS.includes(sector));

export function defendedSectorFor(attackDirection) {
  const key = String(attackDirection || '').toLowerCase();
  return DEFENDED_SECTOR_FOR_ATTACK[key] || null;
}

// The inverse, for anything that has a sector and wants the attack that it answers. Same table -
// the mirror is its own inverse - but named so a reader never has to work out which way it runs.
export function attackDirectionAnsweredBy(sector) {
  const key = String(sector || '').toLowerCase();
  return DEFENDED_SECTOR_FOR_ATTACK[key] || null;
}
