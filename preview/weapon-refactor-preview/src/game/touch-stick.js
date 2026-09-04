// R24J.1 (#40) - the left thumb steers and names the direction; the right thumb acts.
//
// Measured on the build before this one (a person's phone log, 52 exchanges): the player blocked
// ZERO of nine opponent swings and 45% of their attack presses did nothing at all. The cause was
// the layout, not the fight: seven 50px buttons in one 180px pad under a single thumb, movement on
// the right hand and aiming on the left, and a shield that must be held by the same thumb that
// taps the sword. Measured on the same screens: the fighters occupy x 266-604 of 844, so both
// bottom corners are free, and a 45mm thumb arc reaches 259px - both clusters fit comfortably.
//
// This module is the stick's arithmetic and nothing else: given where a thumb went down and where
// it is now, what does the fighter do. It holds no DOM and no combat rule, so the dead zones and
// the sector mapping can be tested frame by frame without a browser.
//
// The one rule worth stating: the stick names a DIRECTION only past a larger dead zone than the
// one that starts it WALKING. A thumb pushed forward to close the distance must not silently
// restate the guard's sector, and the caller only asks for the aim while an action button is held
// (the person driving asked for exactly that: hold the action, the stick says where).
export const TOUCH_STICK_STAGE = 'r24j1-the-left-thumb-steers-the-right-thumb-acts';

export const TOUCH_STICK_PROFILE = Object.freeze({
  // 180px across. Measured: 5.65-5.90 CSS px per mm across four phone sizes - a 4% spread - so a
  // fixed pixel size is the same physical size everywhere, and 180px is 31mm, a thumb's sweep.
  radiusPx: 90,
  // Past this the feet move. Small, because walking should feel immediate.
  moveDeadZonePx: 16,
  // Past this the thumb is naming a sector. Deliberately more than twice the walking dead zone:
  // the sector is sticky (it survives the exchange, R21A.2), so a nudge must not restate it.
  aimDeadZonePx: 36,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function planTouchStick(input = {}) {
  const profile = Object.freeze({ ...TOUCH_STICK_PROFILE, ...(input.profile || {}) });
  const deltaX = finite(input.pointerX) - finite(input.originX);
  const deltaY = finite(input.pointerY) - finite(input.originY);
  const distancePx = Math.hypot(deltaX, deltaY);
  const clamp = distancePx > profile.radiusPx && distancePx > 0 ? profile.radiusPx / distancePx : 1;
  const walking = distancePx >= profile.moveDeadZonePx;
  // Screen y grows downward and the lane's forward is ArrowUp, which is -1 (R19V.1), so the sign
  // of dy IS the lane intent - no flip. Lateral matches ArrowLeft/-1, ArrowRight/+1 the same way.
  const laneIntent = walking && Math.abs(deltaY) >= profile.moveDeadZonePx ? Math.sign(deltaY) : 0;
  const lateralIntent = walking && Math.abs(deltaX) >= profile.moveDeadZonePx ? Math.sign(deltaX) : 0;
  // Pushing back is a retreat, not a stance: there is no downward sector (R21A.2 has three), and
  // letting a retreat pick whichever lateral sector the hysteresis happened to hold would restate
  // the guard for a thumb that never meant to.
  const retreating = Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0;
  const naming = distancePx >= profile.aimDeadZonePx && !retreating;
  return Object.freeze({
    stage: TOUCH_STICK_STAGE,
    profile,
    distancePx,
    // Where to draw the knob: clamped to the ring, so a thumb that slides off still reads as a
    // full push rather than flying away from the base.
    knob: Object.freeze({ x: deltaX * clamp, y: deltaY * clamp }),
    walking,
    laneIntent,
    lateralIntent,
    naming,
    retreating,
    // Handed to the same aim planner the mouse uses (R21A.2), in the stick's own frame: the
    // viewport it is told about is the stick, so the planner's dead zone and its 12 degrees of
    // hysteresis mean the same thing here as they do across a monitor.
    aim: naming
      ? Object.freeze({
          offsetX: deltaX,
          offsetY: deltaY,
          viewportWidth: profile.radiusPx * 2,
          viewportHeight: profile.radiusPx * 2,
        })
      : null,
    // The same expression the keyboard's Space uses, so a dodge means one thing in this game.
    dodgeDirection: lateralIntent > 0 ? 'right'
      : lateralIntent < 0 ? 'left'
        : laneIntent < 0 ? 'forward' : 'back',
  });
}
