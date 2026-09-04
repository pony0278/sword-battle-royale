// R24F.1 (#35) - how a phone starts the fight.
//
// Measured before this existed (Playwright, iPhone and Android sizes): a phone opened on a page
// with no defence chosen, no lock, no opponent drive, a 58vh scene under a 207px diagnostic HUD,
// six thousand pixels of lab text stacked below it, and - on any Android in landscape, which is
// over 900 CSS px wide - the desktop layout, whose HUD covered the fighters completely. None of the
// three things a fight needs (block, lock, drive) exist on touch.
//
// This module is the decision: given the pointer, the orientation and where the start sequence is,
// what the overlay shows and whether the opponent may swing. It owns no DOM - the lab UI reads the
// plan and paints it - so the sequence is testable frame by frame without a browser.
//
// The rules, each one measured or decided with the person driving:
//   - a coarse pointer in portrait sees the rotate prompt, whatever else is going on: the sector
//     indicator lands on the player's feet in landscape already and portrait has no room at all,
//     so the fight waits, and a fight interrupted by rotating back waits too (the drive pauses).
//   - the start button sets the fight up (the caller's job) and counts 3-2-1 before the drive is
//     allowed to swing, so the thumbs are on the pad before the first blade.
//   - the same button comes back when the duel is over, as the rematch.
//   - a fine pointer sees none of this: the lab page is the lab page on a desktop.
export const MOBILE_START_STAGE = 'r24f1-the-phone-starts-the-fight';
export const START_COUNTDOWN_MS = 3000;

export const START_PHASES = Object.freeze({
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  FIGHTING: 'fighting',
  OVER: 'over',
});

export const START_OVERLAY_KINDS = Object.freeze({
  ROTATE: 'rotate',
  START: 'start',
  COUNTDOWN: 'countdown',
  REMATCH: 'rematch',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Pure. What the overlay shows this frame and whether the opponent may swing.
export function planStartOverlay({ coarse = false, portrait = false, phase = START_PHASES.IDLE, remainingMs = 0 } = {}) {
  const verdict = (kind, driveAllowed, extra = {}) => Object.freeze({
    stage: MOBILE_START_STAGE, visible: kind != null, kind, driveAllowed, count: null, ...extra,
  });
  // A desktop never sees the overlay and its drive is the checkbox's business, as before.
  if (coarse !== true) return verdict(null, true);
  if (portrait === true) return verdict(START_OVERLAY_KINDS.ROTATE, false);
  switch (phase) {
    case START_PHASES.COUNTDOWN:
      return verdict(START_OVERLAY_KINDS.COUNTDOWN, false, { count: Math.max(1, Math.ceil(finite(remainingMs) / 1000)) });
    case START_PHASES.FIGHTING:
      return verdict(null, true);
    case START_PHASES.OVER:
      return verdict(START_OVERLAY_KINDS.REMATCH, false);
    default:
      return verdict(START_OVERLAY_KINDS.START, false);
  }
}

// Owns the phase and the countdown clock. The environment (pointer, orientation) is pushed in by
// whoever can read it; the duel's end is pushed in by whoever judges it.
export function createMobileStartRuntime({ countdownMs = START_COUNTDOWN_MS } = {}) {
  let phase = START_PHASES.IDLE;
  let remainingMs = 0;
  let coarse = false;
  let portrait = false;
  let lastPlan = planStartOverlay();

  function plan() {
    lastPlan = planStartOverlay({ coarse, portrait, phase, remainingMs });
    return lastPlan;
  }

  return Object.freeze({
    stage: MOBILE_START_STAGE,
    setEnvironment(next = {}) {
      if (typeof next.coarse === 'boolean') coarse = next.coarse;
      if (typeof next.portrait === 'boolean') portrait = next.portrait;
      return plan();
    },
    // The button. Accepted from idle and from over; ignored mid-countdown and mid-fight, and
    // ignored in portrait because the button is not on screen there.
    press() {
      const accepted = coarse && !portrait && (phase === START_PHASES.IDLE || phase === START_PHASES.OVER);
      if (accepted) { phase = START_PHASES.COUNTDOWN; remainingMs = countdownMs; }
      return Object.freeze({ accepted, plan: plan() });
    },
    advance(deltaMs = 0, { duelOver = false } = {}) {
      if (phase === START_PHASES.COUNTDOWN) {
        remainingMs = Math.max(0, remainingMs - Math.max(0, finite(deltaMs)));
        if (remainingMs === 0) phase = START_PHASES.FIGHTING;
      }
      if (phase === START_PHASES.FIGHTING && duelOver === true) phase = START_PHASES.OVER;
      return plan();
    },
    get phase() { return phase; },
    get remainingMs() { return remainingMs; },
    get report() { return lastPlan; },
  });
}
