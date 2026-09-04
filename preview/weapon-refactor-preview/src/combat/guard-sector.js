import { ATTACK_DIRECTIONS } from './attack-directions.js';

export const GUARD_SECTOR_STAGE = 'R21A.2';

// R21A.2: which of the three directions the player is pointing at.
//
// The sectors are named after the attacks they answer, and that naming is the whole contract - a
// sector called 'right' exists to match the attack called 'right'. It is worth saying plainly that
// this correspondence is a CONVENTION and not a fact about the geometry, because measuring the
// swings (R21A.1) found no geometry to match:
//
//   during the windup all three attacks travel on the DEFENDER'S RIGHT. RIGHT and LEFT never put
//   the blade on the defender's left at any frame; TOP crosses the centre line only on its last
//   windup frame. What separates them is the tip's vertical velocity - TOP rises at +4.45 m/s,
//   RIGHT stays level at -1.79, LEFT falls from 2.19m at -7.01 - and it is identical at 1.4m,
//   1.8m and 2.4m.
//
// R21F.1 measured the same question over TIME rather than at a frame, and the answer is worse
// than "no mirror". Sampled from a common 2.396m stance, the distance between the three blade tips
// in the plane the camera looks across:
//
//   102ms 0.453m    119ms 0.279m    153ms 0.401m    170ms 0.481m    238ms 0.913m
//
// The parry windows run 148-410ms. The three attacks are at their most ALIKE right as the windows
// open and have barely separated through the first stretch of them, so a player asked for the
// direction inside the window has nothing on screen to answer from - they are reading a derivative
// or they are guessing. This is recorded here, next to the convention it undermines, because it is
// a fact about the attack set and outlives whatever is or is not built against it.
//
// A telegraphed stance was built against exactly these numbers (R21F.1) and reverted the same day:
// the poses measured well - the three holds sat 0.84m clear of each other and 0.89m clear of idle,
// against the 0.279m blur above - and still read as unnatural in play. So the measurement stands
// and the remedy does not; whatever is tried next has this bar to clear and this way to check it.
//
// So there is no mirror to get right and no "side the blow comes from" to match. The mapping is
// chosen to be learnable rather than derived: screen up is TOP, screen right is RIGHT, screen left
// is LEFT, which agrees with the lab's own direction buttons and with what players arrive expecting.
// The risk that replaces the mirror is drift - a sector, an attack direction and an indicator glyph
// that stop agreeing - and that is checkable, which a convention buried in three files is not.
export const GUARD_SECTORS = Object.freeze(['top', 'right', 'left']);

// Screen angles, measured the way a person describes them: 0 is right, 90 is up. The caller hands
// pixel offsets where y grows downward, and this flips that once, here, rather than everywhere.
export const GUARD_SECTOR_AXIS_DEGREES = Object.freeze({ top: 90, right: 0, left: 180 });

export const GUARD_SECTOR_PROFILE = Object.freeze({
  // Inside this, the player has not pointed anywhere. Expressed against the smaller viewport
  // dimension so it means the same thing on a wide monitor and a phone in landscape.
  deadZoneFraction: 0.06,
  // A cursor resting exactly on a boundary must not flicker between two sectors, so changing takes
  // this much more than merely being closer. Costs nothing to a deliberate flick.
  hysteresisDegrees: 12,
  // Both are chosen, not measured - there is nothing yet to measure them against. They are the
  // first two dials to turn once somebody has played with this.
  provenance: 'seeded-for-first-play-not-measured',
  authority: 'guard-aim-only-no-contact-authority',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function angularDistanceDegrees(a, b) {
  const delta = Math.abs(((a - b) % 360) + 360) % 360;
  return delta > 180 ? 360 - delta : delta;
}

// Pure. Given where the cursor sits relative to the middle of the view, which sector is that - and
// would the player have to mean it, or are they just passing through?
export function planGuardSector(input = {}) {
  const profile = Object.freeze({ ...GUARD_SECTOR_PROFILE, ...(input.profile || {}) });
  const width = Math.max(0, finite(input.viewportWidth));
  const height = Math.max(0, finite(input.viewportHeight));
  const offsetX = finite(input.offsetX);
  // Screen y grows downward; every angle below is in the human convention.
  const offsetY = -finite(input.offsetY);
  const held = GUARD_SECTORS.includes(input.currentSector) ? input.currentSector : null;
  const magnitude = Math.hypot(offsetX, offsetY);
  const deadZonePixels = Math.min(width, height) * profile.deadZoneFraction;

  if (!(width > 0) || !(height > 0)) {
    return Object.freeze({
      stage: GUARD_SECTOR_STAGE,
      sector: held,
      changed: false,
      magnitude,
      angleDegrees: null,
      reason: 'no-viewport-to-aim-inside',
      profile,
      authority: profile.authority,
    });
  }
  if (magnitude <= deadZonePixels) {
    // Holding, not clearing: a player who lets the cursor drift back through the middle has not
    // asked to drop their guard, and a sector that evaporates there would be unusable.
    return Object.freeze({
      stage: GUARD_SECTOR_STAGE,
      sector: held,
      changed: false,
      magnitude,
      angleDegrees: null,
      reason: 'inside-the-dead-zone-the-last-sector-holds',
      profile,
      authority: profile.authority,
    });
  }

  const angleDegrees = (Math.atan2(offsetY, offsetX) * 180) / Math.PI;
  // Ties resolve to the earlier entry in GUARD_SECTORS, which makes the boundaries deterministic
  // rather than dependent on floating point. The only tie a player can actually hold is straight
  // down - equidistant from right and left - and with hysteresis a cursor sweeping through the
  // bottom keeps whichever sector it arrived with, so the arbitrary half of this is unreachable
  // in play and pinned in a test rather than left to be discovered.
  let nearest = null;
  let nearestDistance = Infinity;
  for (const sector of GUARD_SECTORS) {
    const distance = angularDistanceDegrees(angleDegrees, GUARD_SECTOR_AXIS_DEGREES[sector]);
    if (distance < nearestDistance) { nearestDistance = distance; nearest = sector; }
  }
  if (held && held !== nearest) {
    const heldDistance = angularDistanceDegrees(angleDegrees, GUARD_SECTOR_AXIS_DEGREES[held]);
    if (heldDistance - nearestDistance < profile.hysteresisDegrees) {
      return Object.freeze({
        stage: GUARD_SECTOR_STAGE,
        sector: held,
        changed: false,
        magnitude,
        angleDegrees,
        reason: 'too-close-to-the-boundary-to-count-as-a-change',
        profile,
        authority: profile.authority,
      });
    }
  }
  return Object.freeze({
    stage: GUARD_SECTOR_STAGE,
    sector: nearest,
    changed: nearest !== held,
    magnitude,
    angleDegrees,
    reason: held === nearest ? 'held' : 'aimed',
    profile,
    authority: profile.authority,
  });
}

// The contract this module exists to keep: a sector is named after the attack it answers. Exported
// so the check lives with the claim rather than only in a test file.
export const GUARD_SECTORS_MATCH_ATTACK_DIRECTIONS = GUARD_SECTORS.length === ATTACK_DIRECTIONS.length
  && GUARD_SECTORS.every((sector) => ATTACK_DIRECTIONS.includes(sector));
