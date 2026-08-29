export const DODGE_STATE_STAGE = 'R20F.1';

// R20F.1: the dodge is a state, not a place. Stage B5's core rule.
//
// The dash investigation measured every geometric escape this system permits and closed them
// all: lateral motion is an orbit by the ledger's own construction (the engagement rotates and
// the resting shield rotates with it), a retreat is eaten by the attacker's authored lunge
// (0.65m of backdash against 0.663m of RIGHT advance is a wash), and with the guard stood
// down a displaced defender's resting shield or body still sits on the arc's path - 3 m/s of
// burst in any direction, at any timing, changed no outcome (18/18 blocked; guard-down runs
// became body hits, never whiffs). A defence model whose guard catches everything reachable
// leaves no geometric room to be somewhere else.
//
// So the dodge escapes through TIME instead: a committed 0.4-second state (the authored length
// of every KayKit Dodge_* clip) carrying an invulnerability window. During i-frames the
// exchange does not touch the defender at all - shield, clang, and body alike - and outside
// them the dodge is pure exposure, because the guard stands down for the state's whole length.
// Displacement rides along at the clips' authored root-motion rates for position and readability,
// but it is not the escape mechanism; the window is. The window is also what multiplayer can
// reconcile honestly - a time comparison survives latency in a way live geometry never will.
//
// The timing game, against the measured attack timeline (contacts: RIGHT 0.23s, LEFT 0.26s,
// TOP 0.43s; windups 0.19-0.375s):
//   - fast arcs cannot be dodged on reaction (windup shorter than human reaction time): a dodge
//     pressed AT the attacker's commitment puts contact inside the window - prediction rewarded;
//   - TOP is dodged on reaction (~0.13-0.33s after commitment keeps 0.43 inside the window),
//     while a panic dodge at commitment leaves the window before contact - and the guard is
//     already down;
//   - a dodge with no attack coming buys nothing and owes the cooldown.
export const DODGE_DURATION_SECONDS = 0.4;
export const DODGE_IFRAME_WINDOW_SECONDS = Object.freeze({ fromSeconds: 0.1, toSeconds: 0.3 });
export const DODGE_COOLDOWN_SECONDS = 1.0;

// Authored root motion, measured off the clips themselves (0.4s each): the ledger spends these
// linearly over the state's length; the clip carries the true easing on the rig.
export const DODGE_TRAVEL_METERS = Object.freeze({
  back: 0.65,
  left: 0.5,
  right: 0.5,
  forward: 0.25,
});

export const DODGE_CLIP_IDS = Object.freeze({
  back: 'Dodge_Backward',
  left: 'Dodge_Left',
  right: 'Dodge_Right',
  forward: 'Dodge_Forward',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createDodgeStateRuntime() {
  let dodging = false;
  let direction = null;
  let elapsedSeconds = 0;
  let cooldownRemainingSeconds = 0;

  function report() {
    const iFramesActive = dodging
      && elapsedSeconds >= DODGE_IFRAME_WINDOW_SECONDS.fromSeconds
      && elapsedSeconds <= DODGE_IFRAME_WINDOW_SECONDS.toSeconds;
    return Object.freeze({
      stage: DODGE_STATE_STAGE,
      dodging,
      direction,
      elapsedSeconds,
      iFramesActive,
      // The guard is down for the state's whole length: the dodge's cost is the dodge.
      guardSuppressed: dodging,
      cooldownRemainingSeconds,
      clipId: dodging ? DODGE_CLIP_IDS[direction] : null,
      authority: 'dodge-window-and-cost-i-frames-veto-contact',
    });
  }

  return Object.freeze({
    // Accepted only from open ground: not mid-dodge, not on cooldown. Doubt refuses - a dodge
    // is a commitment, and commitments are never entered by accident.
    tryStart(input = {}) {
      const requested = String(input.direction || '').toLowerCase();
      if (!DODGE_TRAVEL_METERS[requested]) {
        return Object.freeze({ accepted: false, reason: `unknown-dodge-direction-${requested || 'none'}` });
      }
      if (dodging) return Object.freeze({ accepted: false, reason: 'dodge-already-running' });
      if (cooldownRemainingSeconds > 0) {
        return Object.freeze({ accepted: false, reason: 'dodge-on-cooldown' });
      }
      dodging = true;
      direction = requested;
      elapsedSeconds = 0;
      return Object.freeze({ accepted: true, reason: 'dodge-committed', direction: requested });
    },
    // Advances the state and returns this frame's ledger displacement. The metres are capped to
    // the state's remaining length so the authored travel is spent exactly once.
    advance(deltaSeconds) {
      const dt = Math.max(0, finite(deltaSeconds));
      if (!dodging) {
        cooldownRemainingSeconds = Math.max(0, cooldownRemainingSeconds - dt);
        return Object.freeze({ displacementMeters: 0, direction: null });
      }
      const step = Math.min(dt, DODGE_DURATION_SECONDS - elapsedSeconds);
      const speed = DODGE_TRAVEL_METERS[direction] / DODGE_DURATION_SECONDS;
      const displacementMeters = speed * step;
      const stepDirection = direction;
      elapsedSeconds += dt;
      if (elapsedSeconds >= DODGE_DURATION_SECONDS) {
        dodging = false;
        direction = null;
        cooldownRemainingSeconds = DODGE_COOLDOWN_SECONDS;
      }
      return Object.freeze({ displacementMeters, direction: stepDirection });
    },
    // A lane reset teleports the world back to stance; a dodge in flight goes with it.
    reset() {
      dodging = false;
      direction = null;
      elapsedSeconds = 0;
      cooldownRemainingSeconds = 0;
    },
    get report() { return report(); },
  });
}
