import { GUARD_SECTORS, planGuardSector } from '../combat/guard-sector.js';

export const GUARD_SECTOR_RUNTIME_STAGE = 'R21A.2';

// R21A.2: the player's aim, held between frames.
//
// Deliberately the whole of it: this runtime owns which sector the player is pointing at and
// nothing else. It is not consulted by the parry gate, the coverage director or the cone gate -
// step one of directional parry is that the direction EXISTS and is VISIBLE, so that the question
// "can a human read the attack and point at it in time" can be answered by a person's hands before
// any rule is written against it. Wiring it into a judgement before that is answered would be
// deciding the interesting question by accident.
export function createGuardSectorRuntime(options = {}) {
  const profile = options.profile || undefined;
  let sector = GUARD_SECTORS.includes(options.initialSector) ? options.initialSector : null;
  let lastPlan = null;

  function report() {
    return Object.freeze({
      stage: GUARD_SECTOR_RUNTIME_STAGE,
      sector,
      angleDegrees: lastPlan?.angleDegrees ?? null,
      magnitude: lastPlan?.magnitude ?? null,
      reason: lastPlan?.reason ?? 'never-aimed',
      authority: 'guard-aim-only-no-contact-authority',
    });
  }

  return Object.freeze({
    // Offsets from the middle of the view, in pixels, y growing downward the way a browser reports
    // it. Whoever holds the DOM converts; this never sees an event.
    aim(input = {}) {
      lastPlan = planGuardSector({ ...input, currentSector: sector, profile });
      sector = lastPlan.sector;
      return report();
    },
    // R21N.1: chosen outright rather than pointed at. A discrete input names the sector and is
    // the timed press in one action, so there is no aiming plan behind it - the reason below says
    // so rather than leaving a stale pointer plan looking like the cause.
    select(direction) {
      const chosen = GUARD_SECTORS.includes(String(direction || '').toLowerCase())
        ? String(direction).toLowerCase()
        : null;
      if (chosen == null) return report();
      sector = chosen;
      lastPlan = { sector: chosen, angleDegrees: null, magnitude: null, reason: 'chosen-by-a-discrete-input' };
      return report();
    },
    reset() { sector = null; lastPlan = null; return report(); },
    get sector() { return sector; },
    get report() { return report(); },
  });
}
