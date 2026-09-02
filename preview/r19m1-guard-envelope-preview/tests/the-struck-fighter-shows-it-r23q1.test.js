import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSwingPermission } from '../src/combat/swing-permission.js';

// R23Q.1 - the struck fighter shows it.
//
// Measured before: after a blow, the player's bones moved 0.7m relative to their root (Hit_B
// playing) and the opponent's moved 0.05m (nothing playing). R23J.1 started the opponent's
// reaction on every landed blow and no frame ever sampled it - the controller is a clock that only
// advances when asked. This stage asks, last among the opponent's writers, and makes being struck
// a reason neither fighter may swing until the reaction has run.


test('R23Q.1 a fighter being struck may not swing, and is told so by name', () => {
  const struck = planSwingPermission({ ready: true, beingStruck: true });
  assert.equal(struck.allowed, false);
  assert.equal(struck.reason, 'still-being-struck');
  // It sits after recovery and before the stagger in the order of reasons: a fighter both
  // recovering and struck is told about the swing they threw, one struck and staggered about
  // the blow.
  assert.equal(planSwingPermission({ ready: true, stillRecovering: true, beingStruck: true }).reason, 'still-recovering');
  assert.equal(planSwingPermission({ ready: true, beingStruck: true, canAct: false }).reason, 'still-being-struck');
  assert.equal(planSwingPermission({ ready: true }).allowed, true, 'absent means not struck');
});

test('R23Q.1 the opponent\'s reaction is sampled after their base pose, and both attack gates read the reaction', () => {
  // Composition of the browser entry, read rather than run.
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  // R23S.1 put the opponent's shield between the base pose and the reaction: base, then guard, then
  // the blow - the same order the player's writers have run in since R19K.1.
  assert.match(entry, /sampleAttackerBase\(snapshot, deltaMs\);\n\s*sampleOpponentGuard\(deltaMs\);[^\n]*\n\s*attackerFighter\.bodyStrikeReaction\.sample\(deltaMs\);/);
  assert.match(entry, /!attackerFighter\.condition\.report\.canAct \|\| attackerFighter\.bodyStrikeReaction\.active\) return false;/);
  // R23R.1 moved the player's swing into its own controller; the gate moved with it.
  const playerAttack = readFileSync(new URL('../tools/action-studio/shield-parry-r281/player-attack-controller.js', import.meta.url), 'utf8');
  assert.match(playerAttack, /beingStruck: playerFighter\.bodyStrikeReaction\.active, canAct: playerFighter\.condition\.report\.canAct/);
});
