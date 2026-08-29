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
// The Sekiro upgrade: the RISING EDGE of the guard press is the parry attempt. This module only
// reports the edge (justRaisedGuard, true for exactly one update); whether that edge falls in
// the parry window is the committed-parry gate's existing judgement, unchanged. A press outside
// the window is not a failure - it is simply a guard, standing, which is the whole difference
// from the old parry mode's armed gate.
export function createDefenderStanceRuntime() {
  let guardHeld = false;
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
      authority: 'stance-arbitration-no-contact-authority',
    });
  }

  return Object.freeze({
    // Told the dodge runtime's state each frame rather than owning it: the stance arbitrates,
    // the dodge keeps its own clock (R20F), and neither reaches into the other.
    update({ guardKeyHeld = false, dodgeRunning = false } = {}) {
      const wasGuard = guardHeld;
      const wasDodging = dodging;
      dodging = dodgeRunning === true;
      guardHeld = guardKeyHeld === true && !dodging;
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
      dodging = false;
      justRaisedGuard = false;
    },
  });
}
