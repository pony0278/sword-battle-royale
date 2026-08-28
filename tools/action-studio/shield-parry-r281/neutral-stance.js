import { GUARD_STATES } from '../../../src/combat/guard-state-machine.js';
import { NEUTRAL_IDLE_CLIP_ID } from './lab-bootstrap.js';

// R19I.1 — what the defender does when nobody has chosen anything yet.
//
// The lab used to open mid-decision: the defender snapped into Guard HOLD, a demo attack fired
// itself, and the mode was already PARRY, so the first thing the page said was "press F". Opening
// on a neutral stance instead means the first decision in a session belongs to the person making
// it.
//
// The attacker needed nothing for this - it already idles on UAL1/Sword_Idle out of combat. The
// defender did, because GUARD_STATES.NEUTRAL carries clipId: null: the guard runtime calls
// stopAnimation once on entering neutral and then leaves the rig entirely alone, so an unattended
// defender stands in whatever pose was last written rather than in a stance. That silence is the
// opening this fills, and it is also why sampling here cannot fight the guard: in every other
// state this does nothing at all.
//
// Called between the guard's rebuild and the walk overlay, so the R19E sandwich still closes over
// it: a neutral defender who is walking gets this idle for the upper body and the walk's legs laid
// back on top, exactly as a guarding one does.
export function createNeutralStanceController({ defender, camera, readGuardState }) {
  if (!defender?.sampleAnimation) throw new Error('R19I.1 neutral stance requires a defender character');
  if (typeof readGuardState !== 'function') throw new Error('R19I.1 neutral stance requires a guard state reader');
  let idleDurationSeconds = 1;
  let clockSeconds = 0;

  function neutral() {
    return readGuardState() === GUARD_STATES.NEUTRAL;
  }

  return Object.freeze({
    setIdleDuration(seconds) {
      const value = Number(seconds);
      idleDurationSeconds = Number.isFinite(value) && value > 0 ? value : 1;
      return idleDurationSeconds;
    },
    get neutral() { return neutral(); },
    // Returns whether it took the frame, so a caller can tell "stood there" from "guard owns it".
    sample(deltaMs) {
      if (!neutral()) {
        // The clock restarts with the next neutral spell rather than carrying a stale phase into
        // it: nothing reads across the boundary, and a fresh loop is the readable choice.
        clockSeconds = 0;
        return false;
      }
      clockSeconds += Math.max(0, Number(deltaMs) || 0) / 1000;
      defender.sampleAnimation(
        NEUTRAL_IDLE_CLIP_ID,
        clockSeconds % Math.max(0.001, idleDurationSeconds),
        { loop: true, inPlace: true, rootRotationPolicy: 'lock' },
      );
      defender.update(0, camera);
      return true;
    },
  });
}
