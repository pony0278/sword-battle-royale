import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GUARD_STATES, LONGSWORD_GUARD_PRESENTATION } from '../src/combat/guard-state-machine.js';

const bootstrap = await readFile(
  new URL('../tools/action-studio/shield-parry-r281/lab-bootstrap.js', import.meta.url),
  'utf8',
);
const stance = await readFile(
  new URL('../tools/action-studio/shield-parry-r281/neutral-stance.js', import.meta.url),
  'utf8',
);
const entry = await readFile(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);

test('R19I.1 the neutral state carries no clip, which is what the stance controller exists to fill', () => {
  // This is the finding the controller is built on rather than a restatement of it: the guard
  // runtime calls stopAnimation once on entering neutral and then leaves the rig alone, so an
  // unattended defender stands in whatever pose was written last. If a clip ever appears here,
  // the controller is redundant and should go rather than fight it.
  assert.equal(LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.NEUTRAL].clipId, null);
  assert.equal(LONGSWORD_GUARD_PRESENTATION[GUARD_STATES.NEUTRAL].authored, false);
});

test('R19I.1 both fighters share one neutral idle, each fitted to its own rig', () => {
  // Measured in the browser: with a defender-fitted copy the two rigs read identically in
  // neutral - hips 0.277, head 1.039, 2.4 degrees off vertical, both hands at 0.54 - so the
  // shared clip really is one stance rather than two approximations of one.
  assert.match(bootstrap, /NEUTRAL_IDLE_CLIP_ID = 'UAL1\/Sword_Idle'/);
  assert.match(stance, /NEUTRAL_IDLE_CLIP_ID/, 'the defender idles on the shared clip');
  // The second fitted load is the cost of sharing it, and the reason is worth keeping visible:
  // the UAL libraries retarget onto the rig they are loaded with, which is exactly why KayKit
  // could be registered on both fighters and these cannot.
  assert.match(bootstrap, /rig: defender\.rig, fps: 30 \}\),\n\s*\]\);/,
    'the defender needs its own fitted UAL1, not the attacker\'s');
  assert.match(bootstrap, /defender\.registerAnimations\(defenderUal1\)/);
});

test('R19I.1 the lab opens on a decision nobody has made yet', () => {
  assert.match(entry, /let selectedMode = null;/, 'no defence is chosen until somebody chooses one');
  assert.doesNotMatch(entry, /startAttack\('right'\);/, 'and no attack fires on its own');
  // Choosing a defence is what raises the guard - before that the defender is not holding one.
  const setMode = entry.indexOf('function setMode(mode)');
  const raises = entry.indexOf('enterGuard();', setMode);
  assert.ok(setMode >= 0 && raises > setMode && raises - setMode < 400,
    'setMode must be what raises the guard');
  // An attack with nothing chosen leaves the defender neutral rather than conjuring a guard.
  // B6c: only parry mode (or a held guard key in block mode) raises the guard for an attack.
  assert.match(entry, /if \(\(selectedMode === 'parry' \|\| \(selectedMode === 'block' && guardKeyHeld\)\) && guardMachine\.state !== GUARD_STATES\.HOLD\) enterGuard\(\);/);
});

test('R19I.1 the neutral idle sits inside the walk sandwich rather than beside it', () => {
  // Ordering, not presence: the guard rebuilds, then this fills a neutral rig, then the walk's
  // legs go back on top - so a neutral defender who is walking still walks. Sampling after the
  // overlay would wipe the legs; sampling before the guard would be wiped by it.
  const guardUpdate = entry.indexOf('guardRuntime.update(deltaMs, camera);');
  const neutral = entry.indexOf('neutralStance.sample(deltaMs)', guardUpdate);
  const overlay = entry.indexOf('laneController.overlayDefenderWalkLegs()', neutral);
  assert.ok(guardUpdate >= 0 && neutral > guardUpdate && overlay > neutral);
});

test('R19I.1 the gate probe no longer waits on a boot attack that no longer happens', async () => {
  const probe = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/parry-gate-probe.js', import.meta.url),
    'utf8',
  );
  // The probe used to treat the boot demo attack as its readiness signal. With the demo gone that
  // wait would have burned its whole timeout before every CI run, so readiness is now asked for
  // directly: restartAttack refuses until the assets are in, so retrying it is the wait.
  assert.doesNotMatch(probe, /api\.attackRuntime\.active \|\| api\.combat\.active/);
  assert.match(probe, /waitFor\(windowRef, \(\) => api\.restartAttack\(direction\)/);
});
