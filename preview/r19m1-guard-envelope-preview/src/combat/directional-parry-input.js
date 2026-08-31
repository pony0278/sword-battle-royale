import { GUARD_SECTORS } from './guard-sector.js';

export const DIRECTIONAL_PARRY_INPUT_STAGE = 'R21N.1';

// R21N.1 - one press says both things.
//
// R21C.1 made a parry answer the direction, and left the answering to the pointer: the sector is
// whichever of three angular wedges the cursor sits in, measured from the middle of the view, and
// F is the timed press. Two devices, two actions, one 120ms window. The tally measured what a
// player actually does with that:
//
//   50 presses, 48 of them with the sector UNCHANGED between the swing starting and the key going
//   down. Of 22 wrong-direction misses, 20 had never moved the aim at all - only 2 were a pointer
//   sent somewhere and sent wrong.
//
// So the direction was not being misread. It was not being answered. The cursor sat where the last
// exchange left it - on RIGHT, the direction being parried 11 times in 17 - and TOP and LEFT went
// 0 for 36 between them.
//
// The cost is worse than it looks, and invisible while you pay it. The sector is decided by ANGLE
// about the screen centre, so the distance a direction change costs depends on how far out the
// cursor happens to be: about 70px from 50px out, about 280px from 200px out. Four times the work
// for the same decision, and nothing on screen says which you are about to pay.
//
// Trying to pay it is measurable too. On the run where the player began attempting the pointer
// move, presses landing too EARLY went from 8% to 30% and the parry rate fell from 37% to 21%:
// aiming and timing were taking the same budget from each other.
//
// A discrete input removes the travel rather than shortening it. One press names the direction AND
// is the timed input, so the only thing left to get right is when.
//
// Mobile decided the shape. On touch there is no cursor at all - pointermove fires only while a
// finger is down - so the pointer scheme needs a drag on the canvas, which is where free look
// already lives. Both remedies translate (keys become buttons, a mouse flick becomes a swipe), but
// a deliberate swipe takes 150-250ms against a 120ms window, while a button is instantaneous and
// carries no distance threshold to retune per screen. This is the same reason R19W.1 made every
// touch button a virtual key: one intent pipeline that cannot drift between devices.
export const DIRECTIONAL_PARRY_KEYS = Object.freeze({
  KeyI: 'top',
  KeyJ: 'left',
  KeyL: 'right',
});

// Why these three and not the arrows: the arrows already drive the lane, WASD already drives free
// movement, and Tab/Shift/Space/F/H are taken. I-J-L is an inverted T - up, left, right - so the
// mapping is legible without a legend, and the hand it wants is free: locked on, which is the mode
// this fight happens in, the mouse has nothing to do.
export const DIRECTIONAL_PARRY_INPUT_NOTES = Object.freeze({
  pressesWithTheAimUnchanged: Object.freeze({ unchanged: 48, of: 50 }),
  misreadsThatNeverMovedTheAim: Object.freeze({ unmoved: 20, of: 22 }),
  tooEarlyShareBefore: 0.08,
  tooEarlyShareWhileAiming: 0.3,
  parryRateBefore: 0.37,
  parryRateWhileAiming: 0.21,
  swipeMsOnTouch: Object.freeze({ minimum: 150, maximum: 250 }),
  parryWindowMs: 120,
  authority: 'input-mapping-only-no-contact-authority',
});

// The token may be a keyboard code or a sector name, because the same verb arrives from a key, an
// on-screen button and a probe, and none of them should need to know about the others.
export function directionalParryFor(token) {
  const raw = String(token || '');
  if (DIRECTIONAL_PARRY_KEYS[raw]) return DIRECTIONAL_PARRY_KEYS[raw];
  const lower = raw.toLowerCase();
  return GUARD_SECTORS.includes(lower) ? lower : null;
}
