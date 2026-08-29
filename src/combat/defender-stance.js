export const DEFENDER_STANCE_STAGE = 'R20G.1';

// R20G.1: defence becomes a choice. Stage B6's core rule.
//
// Until now the lab's defender guarded by existing: coverage ran on every swing, and the only
// player verbs were direction and (in parry mode) timing. B6 makes the guard itself the verb:
//
//   NEUTRAL - the resting stance. No coverage, no guard turn; an unanswered attack lands on the
//             body. Movement and the dodge live here.
//   GUARD   - held, not toggled: the guard key down IS the stance, and releasing it is leaving.
//             Inside it the entire measured defence runs exactly as the 27-cell grid and every
//             band since describe - those measurements were all taken guard-up, and this stance
//             is where they keep their meaning.
//   DODGE   - the committed 0.4s state (R20F). Enterable from neutral only.
//
// The exclusions are the design, decided and named:
//   guard -> dodge: REFUSED. Raising the shield commits the exchange to blocking; there is no
//             cancel into i-frames (the user's call, and what makes the choice a read).
//   dodge -> guard: a key held through a dodge raises the guard the moment the dodge ends -
//             holding block is intent enough, and refusing it would punish past the design -
//             but that rise is NOT a parry attempt: the edge is dropped, because a buffered
//             press would turn every dodge into a free Sekiro attempt on wake-up, and a timed
//             verb's input must be the player's own timing. Only a fresh press from neutral
//             parries.
//
// R20H.2 - a committed defence plays out. Sekiro's deflect is a TAP, and a human tap is 80-150ms
// long: shorter than the 190-430ms it takes the incoming sword to arrive. If the key release were
// obeyed literally the shield would be yanked out of its own parry mid-flight - measured, the
// sword then slips off the shield after the deflection peak (direction agreement 0.18 vs the 0.50
// floor) and both fighters end up in garbage poses. So while the defence is COMMITTED - an armed
// parry attempt awaiting its contact, or a live deflect in progress - a released key cannot lower
// the guard; the release is remembered and lands the moment the commitment ends. A release before
// any commitment still drops the guard instantly, which is the B6c rule that makes an early raise
// cost something.
//
// The Sekiro upgrade: the RISING EDGE of the guard press is the parry attempt. This module only
// reports the edge (justRaisedGuard, true for exactly one update); whether that edge falls in
// the parry window is the committed-parry gate's existing judgement, unchanged. A press outside
// the window is not a failure - it is simply a guard, standing, which is the whole difference
// from the old parry mode's armed gate.
export function createDefenderStanceRuntime() {
  let guardHeld = false;
  let keyDown = false;
  let dodging = false;
  let justRaisedGuard = false;

  function stance() {
    if (dodging) return 'dodge';
    return guardHeld ? 'guard' : 'neutral';
  }

  function report() {
    return Object.freeze({
      stage: DEFENDER_STANCE_STAGE,
      stance: stance(),
      guardActive: stance() === 'guard',
      justRaisedGuard,
      heldByCommitment: guardHeld && !keyDown,
      authority: 'stance-arbitration-no-contact-authority',
    });
  }

  return Object.freeze({
    // Told the dodge runtime's state each frame rather than owning it: the stance arbitrates,
    // the dodge keeps its own clock (R20F), and neither reaches into the other.
    update({ guardKeyHeld = false, dodgeRunning = false, defenceCommitted = false } = {}) {
      const wasGuard = guardHeld;
      const wasDodging = dodging;
      dodging = dodgeRunning === true;
      // A commitment holds a guard that is already up; it can never raise one that is not.
      const wantsGuard = guardKeyHeld === true || (wasGuard && defenceCommitted === true);
      guardHeld = wantsGuard && !dodging;
      keyDown = guardKeyHeld === true;
      // The parry edge fires only on a fresh press from neutral: a key carried through a dodge
      // raises the guard (wasDodging suppresses the edge), a held key never re-fires it.
      justRaisedGuard = guardHeld && !wasGuard && !wasDodging;
      return report();
    },
    // The dodge asks here first; the stance refuses it out of guard. The dodge runtime's own
    // refusals (mid-dodge, cooldown) still apply after this one.
    mayDodge() {
      return stance() === 'neutral';
    },
    get report() { return report(); },
    reset() {
      guardHeld = false;
      keyDown = false;
      dodging = false;
      justRaisedGuard = false;
    },
  });
}
