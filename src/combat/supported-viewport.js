export const SUPPORTED_VIEWPORT_STAGE = 'R20R.1';

// R20R.1 — which windows this game is played in, as a stated contract rather than a hope.
//
// The decision is landscape only. It is not a taste call about phones; it is the one place where
// every other rule in this project would have to start lying:
//
//   The lock-on cone. "In front of me" is derived from what is rendered, and in landscape the cone
//   always lands inside the frame - 16:9 renders +-45.2 degrees and the cone is +-40.6, 4:3 renders
//   +-37.0 against +-33.3, even a square window renders +-29.5 against +-26.5. Portrait renders
//   +-17.7 (9:16) or +-14.6 (9:19.5), which is narrower than any cone a player could aim with. The
//   floor that used to paper over that was the only exception clause in the lock rules, and it
//   meant a player could lock somebody they could not see. Declaring the orientation deletes it.
//
//   The camera. The safe-frame fit eases the shoulder until the guard fits the window, and that
//   lever alone suffices down to 0.74:1 - narrower than square, so every landscape device including
//   an iPad at 4:3 is inside it. Portrait runs the lever out and has to spend the look point too,
//   which costs the over-the-shoulder framing, the half-body crop and the pair reading side by
//   side. All three of them at once, on the smaller screen.
//
// So the floor is 1.2:1. FOV 50 needs 1.13:1 for the cone to be fully screen-derived; 1.2 keeps a
// margin and lands cleanly between the widest portrait (9:16 = 0.5625) and the narrowest landscape
// device worth supporting (iPad at 4:3 = 1.333).
export const MINIMUM_SUPPORTED_ASPECT_RATIO = 1.2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function isSupportedViewport(aspectRatio) {
  const aspect = Number(aspectRatio);
  return Number.isFinite(aspect) && aspect >= MINIMUM_SUPPORTED_ASPECT_RATIO;
}

// What to tell the player, and why. The two remedies are different actions - a phone gets rotated,
// a browser window gets widened - so the caller does not have to guess which message to show.
export function describeViewport(aspectRatio) {
  const aspect = finite(aspectRatio, MINIMUM_SUPPORTED_ASPECT_RATIO);
  const supported = isSupportedViewport(aspect);
  return Object.freeze({
    stage: SUPPORTED_VIEWPORT_STAGE,
    aspectRatio: aspect,
    minimumAspectRatio: MINIMUM_SUPPORTED_ASPECT_RATIO,
    supported,
    orientation: aspect < 1 ? 'portrait' : aspect > 1 ? 'landscape' : 'square',
    remedy: supported ? null : aspect < 1 ? 'rotate-to-landscape' : 'widen-the-window',
    // A blocked viewport stops INPUT, never the simulation. In a battle royale, a screen a player
    // can turn sideways to freeze the world with is a cheat, so the world keeps running and only
    // their hands are taken away.
    blocksInput: !supported,
    blocksSimulation: false,
    authority: 'viewport-contract-only-no-combat-authority',
  });
}
