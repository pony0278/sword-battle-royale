// The studio's off-hand grip toggle: two hands on one haft, on the stage figure.
//
// The solving is src/animation/off-hand-grip-ik.js; this is only the page's half - the checkbox,
// when it defaults on, and saying in one line what happened. It lives here rather than in
// action-studio.js because that entry is held to a line budget as a composition root, and this is
// a control with its own state and its own vocabulary of refusals.
import { OFF_HAND_GRIP_SCOPE, applyOffHandGripIk } from '../../src/animation/off-hand-grip-ik.js';

// Said in the terms an author can act on. "out-of-reach" is the honest answer for the authored
// poses this page opens with - the seven-key chop leaves gaps up to 1.26 (handoff/44) - and it is
// not a fault to fix, it is a pose the off hand cannot hold.
const REFUSALS = Object.freeze({
  'out-of-reach': 'the hilt is beyond the off arm in this pose · play a two-handed clip',
  'off-hand-occupied': 'the off hand is holding something · a shield keeps the arm',
  'over-budget': `the reach needs more than ${OFF_HAND_GRIP_SCOPE.maxCorrectionDegrees}° at a joint`,
});

// Defaulted per weapon rather than remembered, because it is a property of what is being held: a
// longsword's off hand is free, a greatsword's is not. The checkbox is still there to argue with.
export function defaultOffHandGrip(weaponId) {
  return weaponId === 'greatsword';
}

export function createStudioOffHandGripController(THREE, { getCharacter, getWeapon, stageWeaponId }) {
  const toggle = document.getElementById('offHandGrip');
  const status = document.getElementById('offHandGripStatus');
  // The last solve, kept so something outside the page can read whether the hand actually arrived.
  // The status line is prose for an author; this is the number, and the reason the first version of
  // the stale-weapon bug was invisible was that no such number existed.
  let lastSolve = null;
  if (toggle) {
    toggle.checked = defaultOffHandGrip(stageWeaponId);
    toggle.addEventListener('change', () => {
      if (!toggle.checked && status) {
        status.textContent = 'off-hand grip · off · the arm plays as the clip retargeted it';
      }
    });
  }

  return {
    get lastSolve() { return lastSolve; },
    // Called on the posed rig, after the weapon has followed the right hand: the target is the
    // weapon's own SECONDARY_GRIP, so it has to be where it will be drawn before the arm is solved.
    update() {
      if (!toggle?.checked) { lastSolve = { applied: false, reason: 'switched-off' }; return null; }
      const result = applyOffHandGripIk(THREE, { character: getCharacter(), weapon: getWeapon() });
      lastSolve = result;
      if (status) {
        status.textContent = result.applied
          ? `off-hand grip · reached · shoulder ${result.rootDegrees.toFixed(1)}° `
            + `elbow ${result.midDegrees.toFixed(1)}° · closed ${result.gapBefore.toFixed(3)} `
            + `(budget ${OFF_HAND_GRIP_SCOPE.maxCorrectionDegrees}°)`
          : `off-hand grip · not applied · ${REFUSALS[result.reason] || result.reason}`;
      }
      return result;
    },
    syncToWeapon(weaponId) {
      if (toggle) toggle.checked = defaultOffHandGrip(weaponId);
    },
  };
}
