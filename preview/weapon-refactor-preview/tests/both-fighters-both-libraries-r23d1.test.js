import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultCharacter } from '../src/character/default-character.js';
import {
  RETARGETED_LIBRARY_SHARING_STAGE,
  retargetedLibraryMayBeShared,
} from '../src/animation/retargeted-library-sharing.js';
import {
  MIRROR_DUEL_REQUIRED_CLIPS,
  clipInventory,
  createShieldParryDebugApi,
} from '../tools/action-studio/shield-parry-r281/debug-api.js';

// R23D.1 - both fighters get both clip families, and the rule that says they may.
//
// The asset split was by ROLE: swings on the attacker's rig, guard on the defender's. Correct for
// a lab where one attacks and the other defends; fatal for a mirror duel. What made it invisible is
// that it was justified by a comment - "the UAL libraries are retargeted onto the rig they are
// loaded with" - which is true of the maths and was false of these two rigs, and no test had ever
// asked. This file asks.
//
// The heavy half of the proof cannot live here: loading a GLB needs a browser. What CAN live here
// is the rule the sharing rests on, driven rather than described, and the inventory the live page
// reports so a probe can see the registration happened at all.

test('R23D.1 two fighters built the same way may share a retargeted pack', () => {
  const a = createDefaultCharacter(THREE);
  const b = createDefaultCharacter(THREE);
  const verdict = retargetedLibraryMayBeShared(a.rig, b.rig);
  assert.equal(verdict.shareable, true);
  assert.equal(verdict.reason, 'one-definition-built-both-rigs');
  assert.equal(verdict.stage, RETARGETED_LIBRARY_SHARING_STAGE);
  // The mechanism is part of the answer: a track finds its bone by NAME, which is why a clip
  // fitted to one rig lands correctly on another built from the same definition.
  assert.equal(verdict.mechanism, 'retargeted-tracks-are-addressed-by-bone-name');
  // And the premise that makes it true, measured here rather than assumed by the module: the two
  // rigs really are the same body.
  assert.equal(a.rig.definition, b.rig.definition);
  assert.deepEqual(Object.keys(a.rig.bones).sort(), Object.keys(b.rig.bones).sort());
  for (const id of Object.keys(a.rig.restTransforms)) {
    assert.deepEqual(a.rig.restTransforms[id], b.rig.restTransforms[id], `${id} rest transform`);
  }
});

test('R23D.1 an equal-but-separate definition is allowed, and a different body is refused', () => {
  const a = createDefaultCharacter(THREE);
  // A structural copy describes the same body, so refusing it would be a false alarm.
  const clone = JSON.parse(JSON.stringify(a.rig.definition));
  const twin = retargetedLibraryMayBeShared(a.rig, { definition: clone });
  assert.equal(twin.shareable, true);
  assert.equal(twin.reason, 'two-definitions-describing-the-same-body');

  // A different body is exactly what this exists to catch: one longer bone and the retarget's
  // baked motion scale no longer describes this rig.
  const taller = JSON.parse(JSON.stringify(a.rig.definition));
  taller.bones[3].position = [taller.bones[3].position[0], taller.bones[3].position[1] + 0.2, taller.bones[3].position[2]];
  const mismatch = retargetedLibraryMayBeShared(a.rig, { definition: taller });
  assert.equal(mismatch.shareable, false);
  assert.equal(mismatch.reason, 'the-two-rigs-were-built-from-different-definitions');

  // A missing definition is not a pass by default.
  assert.equal(retargetedLibraryMayBeShared(a.rig, {}).shareable, false);
  assert.equal(retargetedLibraryMayBeShared(null, a.rig).reason, 'a-rig-is-missing-its-definition');
});

test('R23D.1 key order is not a difference, and a changed value is', () => {
  const a = createDefaultCharacter(THREE);
  // Written down in another order, the same body. A JSON.stringify comparison would call these
  // two different, which is why the module compares structurally.
  const reordered = JSON.parse(JSON.stringify(a.rig.definition));
  reordered.bones = reordered.bones.map((bone) => Object.fromEntries(Object.entries(bone).reverse()));
  assert.equal(retargetedLibraryMayBeShared(a.rig, { definition: reordered }).shareable, true);
  // A dropped bone is a different body.
  const short = JSON.parse(JSON.stringify(a.rig.definition));
  short.bones = short.bones.slice(0, -1);
  assert.equal(retargetedLibraryMayBeShared(a.rig, { definition: short }).shareable, false);
});

test('R23D.1 the inventory reports what a fighter can actually play', () => {
  // The four clips a mirror duel needs: three swings and the guard hold.
  assert.deepEqual(Object.keys(MIRROR_DUEL_REQUIRED_CLIPS).sort(), ['guardHold', 'left', 'right', 'top']);
  const character = (registered) => ({ hasAnimation: (id) => registered.includes(id) });

  // The split this stage removed, described by its inventory: each fighter had half.
  const oldAttacker = clipInventory(character(['UAL1/Sword_Attack', 'UAL2/Sword_Regular_A', 'UAL2/Sword_Regular_B']));
  assert.deepEqual(oldAttacker, { top: true, right: true, left: true, guardHold: false });
  const oldDefender = clipInventory(character(['SKYRIM_GUARD/shd_blockidle', 'UAL1/Sword_Attack']));
  assert.deepEqual(oldDefender, { top: true, right: false, left: false, guardHold: true });

  const whole = clipInventory(character(Object.values(MIRROR_DUEL_REQUIRED_CLIPS)));
  assert.deepEqual(whole, { top: true, right: true, left: true, guardHold: true });
  assert.equal(clipInventory(null), null, 'a fighter that is not there reports nothing, not a lie');
});

test('R23D.1 the live page reports each fighter\'s reach, not just that it assembled', () => {
  const fighter = (stage, registered) => ({ stage, character: { hasAnimation: (id) => registered.includes(id) } });
  const all = Object.values(MIRROR_DUEL_REQUIRED_CLIPS);
  const api = createShieldParryDebugApi({
    actions: {},
    runtimes: {
      defenderFighter: fighter('R23A.1', all),
      attackerFighter: fighter('R23A.1', all),
    },
    debugMode: false,
    getDebugStanceProfile: () => ({}),
    getExchangeState: () => ({}),
  });
  assert.equal(api.fighters.defender, 'R23A.1');
  assert.equal(api.fighters.attacker, 'R23A.1');
  // The claim this stage exists to make, readable from the page a person is playing.
  assert.deepEqual(api.fighters.canPlay.attacker, { top: true, right: true, left: true, guardHold: true });
  assert.deepEqual(api.fighters.canPlay.defender, { top: true, right: true, left: true, guardHold: true });

  // And it reports a gap as a gap rather than throwing or reading as fine.
  const half = createShieldParryDebugApi({
    actions: {},
    runtimes: { defenderFighter: fighter('R23A.1', ['SKYRIM_GUARD/shd_blockidle']), attackerFighter: null },
    debugMode: false,
    getDebugStanceProfile: () => ({}),
    getExchangeState: () => ({}),
  });
  assert.equal(half.fighters.canPlay.defender.right, false);
  assert.equal(half.fighters.canPlay.attacker, null);
});
