import {
  planBodyStrikeReaction,
  sampleBodyStrikeReaction,
} from '../combat/body-strike-reaction.js';

// R19K.1 — plays the defender's reaction to a blade that reached them.
//
// The rule half (which clip, how long, that it owns the whole fighter) lives in
// src/combat/body-strike-reaction.js; this owns the clock and the sampling, the same split the
// walk overlay and the neutral stance use.
//
// Sampled LAST among the defender's writers. The guard runtime rebuilds the whole rig every frame
// and the walk overlay lays legs back on top of it, so anything applied earlier would be erased by
// one of them; and the takeover is what the measurement calls for anyway - a blade past the guard
// means the guard's shape is not worth preserving. Sampling last also means the walk needs no
// special case: whatever it wrote is simply replaced while a hit is playing.
export function createBodyStrikeReactionController({ defender, camera }) {
  if (!defender?.sampleAnimation) throw new Error('R19K.1 body strike reaction requires a defender character');
  let plan = null;
  let elapsedMs = 0;
  let lastReport = null;

  function stop() {
    plan = null;
    elapsedMs = 0;
    return lastReport;
  }

  return Object.freeze({
    // Fed the lifecycle's body contact, which is the only thing that knows a strike from a
    // near-miss. A non-strike plans nothing, so a caller cannot start this off the wrong signal.
    start(bodyContact) {
      const planned = planBodyStrikeReaction(bodyContact);
      if (!planned) return null;
      plan = planned;
      elapsedMs = 0;
      lastReport = planned;
      return planned;
    },
    // Returns whether it took the frame, so the caller can tell a reaction from a quiet frame.
    sample(deltaMs) {
      if (!plan) return false;
      elapsedMs += Math.max(0, Number(deltaMs) || 0);
      const sampled = sampleBodyStrikeReaction(plan, elapsedMs);
      defender.sampleAnimation(sampled.clipId, sampled.timeSeconds, {
        loop: false, inPlace: true, rootRotationPolicy: 'lock',
      });
      defender.update(0, camera);
      // Handed back on completion rather than held: the guard rebuilds itself from the next frame,
      // which is the fighter recovering. If that reads as a snap it wants a blend, not a hold.
      if (sampled.complete) stop();
      return true;
    },
    reset: stop,
    get active() { return Boolean(plan); },
    get report() { return lastReport; },
  });
}
