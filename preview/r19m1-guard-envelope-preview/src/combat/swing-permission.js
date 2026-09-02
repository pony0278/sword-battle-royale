export const SWING_PERMISSION_STAGE = 'R23J.1';

// R23J.1 — whether a fighter may throw a swing right now, and the reason when they may not.
//
// Every clause here was already a silent `return false` in the entry, which is how R23G.1's second
// swing came to be refused for a whole session with every visible guard reading clear: the reason
// existed but nothing could say it. A refusal a player cannot see is a bug they cannot report.
//
// ORDER IS THE MESSAGE. The reasons are checked from the least to the most surprising, so what a
// player is told is the thing they would have noticed themselves: "the opponent is mid-exchange"
// before "your last exchange has not cleared", because one of those is a fight and the other is
// plumbing.
export function planSwingPermission({
  ready = false,
  opponentMidExchange = false,
  ownExchangeUncleared = false,
  alreadySwinging = false,
  stillRecovering = false,
  canAct = true,
} = {}) {
  const reason = !ready ? 'not-ready'
    : opponentMidExchange ? 'the-opponent-is-mid-exchange'
      : alreadySwinging ? 'already-swinging'
        : stillRecovering ? 'still-recovering'
          : !canAct ? 'staggered-or-down'
            : ownExchangeUncleared ? 'your-last-exchange-has-not-cleared'
              : null;
  return Object.freeze({
    stage: SWING_PERMISSION_STAGE,
    allowed: reason == null,
    reason,
    authority: 'input-gate-only-no-contact-authority',
  });
}
