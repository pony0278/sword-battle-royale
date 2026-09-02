import { GUARD_SECTORS } from './guard-sector.js';
import { defendedSectorFor } from './attack-direction-as-defended.js';

export const GUARD_SECTOR_GATE_STAGE = 'R23T.1';

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
export function planGuardSectorGate(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const aimed = String(input.aimedSector || '').toLowerCase();
  const aimedSector = GUARD_SECTORS.includes(aimed) ? aimed : null;
  const defendedSector = defendedSectorFor(direction) || null;
  const covers = Boolean(defendedSector) && aimedSector === defendedSector;
  return Object.freeze({
    stage: GUARD_SECTOR_GATE_STAGE,
    direction,
    aimedSector,
    defendedSector,
    covers,
    reason: !defendedSector ? 'unknown-direction-nothing-to-cover'
      : aimedSector == null ? 'shield-not-pointed-anywhere-covers-nothing'
        : covers ? 'shield-in-the-sector-the-swing-arrives-at'
          : 'shield-in-another-sector-guards-nothing',
    authority: 'coverage-commitment-and-shield-contact-gate-only-body-contact-still-measured',
  });
}
