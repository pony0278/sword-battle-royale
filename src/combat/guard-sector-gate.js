import { GUARD_SECTORS } from './guard-sector.js';
import { defendedSectorFor } from './attack-direction-as-defended.js';

export const GUARD_SECTOR_GATE_STAGE = 'R23Z.1';

// R23Z.1 - whose shield this is. The player's block was decided omnidirectional in R18R and again
// in R21C.1 ("the shield is still omnidirectional; holding F still blocks"), and R23T.1 overrode
// that as a side effect of giving the OPPONENT a shield that guards one sector: one gate, wired
// into both exchanges. Measured on playtest: with block held and the pointer in the dead zone,
// every one of the opponent's three directions landed (nine cells, nine hits); pointed, only the
// matching sector blocked. The rule is per fighter now, and the gate is told which it is.
export const GUARD_COVERAGE = Object.freeze({
  ONE_SECTOR: 'one-sector', // the opponent (R23T.1): a swing lands where the shield is not
  OMNIDIRECTIONAL: 'omnidirectional', // the player (R18R, R21C.1): the block is a wall, the parry reads direction
});

// R23T.1 — the shield guards one sector.
//
// Measured before this existed: with the guard held in block mode and the pointer in any of the
// three sectors, every one of the opponent's three directions resolved `block` - nine cells, nine
// blocks. The shield was omnidirectional on purpose (R18R: "omnidirectional, not omniscient"),
// and it could be, because until step 6 only the player ever guarded and the direction game was
// the parry's alone (the parry gate has read aimedSector against defendedSectorFor since R21C.1).
//
// An opponent who guards changes what the block is for. If their shield catches every direction
// there is nothing for the player to read or feint; if it guards one sector, the duel is the one
// For Honor plays - both stand in guard, each shield in one of three sectors, and a swing lands
// when it arrives where the shield is not. So the block takes direction now, for both fighters,
// through the same mapping the parry already used: a swing from the attacker's RIGHT arrives at
// the defender's LEFT.
//
// Two effects, in the cone gate's shape (R19Z.1): coverage does not engage for a sector the shield
// is not in, so the shield does not visibly chase a blade it will not stop; and a shield contact
// in the wrong sector guards nothing, the way an unraised shield guards nothing, so a blade that
// grazes a mis-held shield by geometric accident still reaches the body. No sector at all is not
// covering: a guard that has not been pointed anywhere is the neutral guard, and it stops nothing.
//
// R23Z.1: all of the above is the ONE_SECTOR rule. An OMNIDIRECTIONAL shield covers every known
// direction whatever it is pointed at - the aim is still reported, because the parry reads it.
export function planGuardSectorGate(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const aimed = String(input.aimedSector || '').toLowerCase();
  const aimedSector = GUARD_SECTORS.includes(aimed) ? aimed : null;
  const defendedSector = defendedSectorFor(direction) || null;
  const omnidirectional = input.coverage === GUARD_COVERAGE.OMNIDIRECTIONAL;
  const covers = Boolean(defendedSector) && (omnidirectional || aimedSector === defendedSector);
  return Object.freeze({
    stage: GUARD_SECTOR_GATE_STAGE,
    direction,
    aimedSector,
    defendedSector,
    coverage: omnidirectional ? GUARD_COVERAGE.OMNIDIRECTIONAL : GUARD_COVERAGE.ONE_SECTOR,
    covers,
    reason: !defendedSector ? 'unknown-direction-nothing-to-cover'
      : omnidirectional ? 'omnidirectional-shield-covers-every-sector'
      : aimedSector == null ? 'shield-not-pointed-anywhere-covers-nothing'
        : covers ? 'shield-in-the-sector-the-swing-arrives-at'
          : 'shield-in-another-sector-guards-nothing',
    authority: 'coverage-commitment-and-shield-contact-gate-only-body-contact-still-measured',
  });
}
