export const SUPPORTED_VIEWPORT_STAGE = 'R20R.1';

// R20R.1 — which windows this game is played in, as a stated contract rather than a hope.
//
// The decision is landscape only, and it is a recommendation to the player rather than a gate.
// What the number is FOR is verification: it is the narrowest window a framing has to be tuned
// against and the narrowest one the lock rules are guaranteed honest in. It is not a taste call
// about phones; portrait is the one place where every other rule in this project would have to
// start lying:
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

// R20R.2: the posture is ADVICE, not a gate. The platform asks for a prompt about the best
// experience rather than a lock-out, and once we are not blocking, the reason to block evaporates
// too - a rotate gate that freezes input is only needed if freezing is possible, and nothing here
// freezes anything. Below the contract the game still plays: the camera's secondary lever holds the
// framing, the lock cone stays honestly narrow instead of reaching off screen, and the player is
// told plainly what they are missing. Nothing lies; it is just worse, and we say so.
export const VIEWPORT_DEGRADES_BELOW_CONTRACT = Object.freeze([
  'the lock cone narrows to what the frame actually renders, so aiming a lock takes more turning',
  'the camera gives up the over-the-shoulder offset, and then the look point, to keep your guard on screen',
]);

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
    // Advice, never a gate: play continues in any window. See the note above the constant.
    recommend: !supported,
    degrades: supported ? Object.freeze([]) : VIEWPORT_DEGRADES_BELOW_CONTRACT,
    blocksInput: false,
    blocksSimulation: false,
    authority: 'viewport-contract-only-no-combat-authority',
  });
}
