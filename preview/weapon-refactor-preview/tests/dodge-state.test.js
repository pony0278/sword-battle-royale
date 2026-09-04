import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DODGE_STATE_STAGE,
  DODGE_DURATION_SECONDS,
  DODGE_IFRAME_WINDOW_SECONDS,
  DODGE_COOLDOWN_SECONDS,
  DODGE_TRAVEL_METERS,
  DODGE_CLIP_IDS,
  createDodgeStateRuntime,
} from '../src/combat/dodge-state.js';
import { LONGSWORD_DIRECTIONAL_ATTACKS } from '../src/combat/longsword-directional-metadata.js';
import { createShieldParryLaneController } from '../src/game/lane-controller.js';

function laneHarness(separationMeters = 2.4) {
  const labScene = {
    engagementStance: { separationMeters },
    setLanePositions: () => {},
    setDefenderYawOffset: () => {},
    defender: null,
    camera: null,
  };
  return {
    laneController: createShieldParryLaneController({
      labScene,
      walkClips: { forward: 'Walking_A', backward: 'Walking_Backwards' },
      services: { captureRigPose: () => null, applyRigPose: () => {} },
    }),
  };
}

test('R20F.1 the dodge is the authored 0.4s, and its window sits where the timing game needs it', () => {
  assert.equal(DODGE_STATE_STAGE, 'R20F.1');
  assert.equal(DODGE_DURATION_SECONDS, 0.4);
  const { fromSeconds, toSeconds } = DODGE_IFRAME_WINDOW_SECONDS;
  assert.ok(fromSeconds > 0 && toSeconds < DODGE_DURATION_SECONDS, 'exposed at both ends');
  // The game the window buys, against the authored contacts: a dodge pressed AT commitment
  // covers the fast arcs (prediction rewarded) and misses TOP (panic punished); TOP is
  // covered by a reaction-timed dodge instead.
  assert.ok(LONGSWORD_DIRECTIONAL_ATTACKS.right.contactSeconds >= fromSeconds
    && LONGSWORD_DIRECTIONAL_ATTACKS.right.contactSeconds <= toSeconds);
  assert.ok(LONGSWORD_DIRECTIONAL_ATTACKS.left.contactSeconds >= fromSeconds
    && LONGSWORD_DIRECTIONAL_ATTACKS.left.contactSeconds <= toSeconds);
  assert.ok(LONGSWORD_DIRECTIONAL_ATTACKS.top.contactSeconds > toSeconds);
  // The authored travel table matches the measured clips (0.65/0.5/0.5/0.25 over 0.4s).
  assert.deepEqual(DODGE_TRAVEL_METERS, { back: 0.65, left: 0.5, right: 0.5, forward: 0.25 });
  assert.equal(DODGE_CLIP_IDS.back, 'Dodge_Backward');
});

test('R20F.1 a dodge is a commitment: it runs its length, then owes the cooldown', () => {
  const dodge = createDodgeStateRuntime();
  assert.equal(dodge.report.dodging, false);
  const started = dodge.tryStart({ direction: 'back' });
  assert.equal(started.accepted, true);
  assert.equal(dodge.tryStart({ direction: 'left' }).reason, 'dodge-already-running');

  // Displacement spends the authored travel exactly once, capped at the state's end.
  let travelled = 0;
  for (let i = 0; i < 30; i += 1) travelled += dodge.advance(0.016).displacementMeters;
  assert.ok(Math.abs(travelled - DODGE_TRAVEL_METERS.back) < 1e-9, `spent ${travelled}`);
  assert.equal(dodge.report.dodging, false);
  assert.equal(dodge.tryStart({ direction: 'back' }).reason, 'dodge-on-cooldown');
  dodge.advance(DODGE_COOLDOWN_SECONDS + 0.001);
  assert.equal(dodge.tryStart({ direction: 'forward' }).accepted, true);
  dodge.reset();
  assert.equal(dodge.report.dodging, false);
  assert.equal(dodge.tryStart({ direction: 'right' }).accepted, true, 'reset clears the cooldown');
  assert.equal(dodge.tryStart({ direction: 'up' }).accepted, false);
});

test('R20F.1 the window opens and closes inside the state, guard down for all of it', () => {
  const dodge = createDodgeStateRuntime();
  dodge.tryStart({ direction: 'left' });
  assert.equal(dodge.report.iFramesActive, false, 'exposed at the start');
  assert.equal(dodge.report.guardSuppressed, true);
  dodge.advance(0.15);
  assert.equal(dodge.report.iFramesActive, true, 'inside the window');
  assert.equal(dodge.report.clipId, 'Dodge_Left');
  dodge.advance(0.2);
  assert.equal(dodge.report.iFramesActive, false, 'exposed at the tail');
  assert.equal(dodge.report.guardSuppressed, true, 'and the guard is still down');
});

test('R20F.1 the i-frame veto lets the whole exchange pass, after every question is answered', async () => {
  const director = await readFile(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  // Order: depth intercept (R19Y), then the dodge veto, then the announced evaluation and the
  // body branch - so the veto covers shield, clang AND body with one return.
  const depth = director.indexOf("reason: 'shield-behind-the-body-guards-nothing'");
  const veto = director.indexOf('readDodgeIFramesActive?.() === true', depth);
  const pass = director.indexOf("reason: 'dodge-i-frames-let-it-pass'", veto);
  const bodyBranch = director.indexOf('if (!contactEvaluation.contact) {', pass);
  assert.ok(depth >= 0 && veto > depth && pass > veto && bodyBranch > pass,
    'depth order, then the dodge veto, then the ordinary body path');
});

test('R20F.1 the lane owns the state, the guard pays the cost, the input only asks', async () => {
  const lane = await readFile(
    new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');
  // R23C.1: "a dodge owns the feet" is behaviour, so it is driven rather than grepped. The old
  // pair of regexes went red for a change that moved nothing - the feet gate gained a second
  // reason to hold, the dodge one unaltered - which is exactly the failure mode R22J.1 names.
  const { laneController } = laneHarness();
  laneController.setDefenderIntent(-1); // walking forward, and held throughout
  const walking = laneController.walk(1 / 60, null);
  assert.notEqual(walking.defenderStep.meters, 0, 'the held key walks when nothing owns the feet');
  assert.equal(laneController.tryDodge('back').accepted, true);
  const dodgingFrame = laneController.walk(1 / 60, null);
  assert.equal(dodgingFrame.defenderStep.meters, 0, 'a dodge owns the feet, so the held key waits');
  assert.equal(laneController.dodgeReport.dodging, true);
  // And the intent survives: the key was never released, so the walk resumes on its own.
  for (let i = 0; i < Math.ceil(DODGE_DURATION_SECONDS * 60) + 2; i += 1) laneController.walk(1 / 60, null);
  assert.notEqual(laneController.walk(1 / 60, null).defenderStep.meters, 0,
    'once the burst is spent the held key walks again without being pressed a second time');
  assert.match(lane, /overlayDefenderDodge\(\)/);
  const preContact = await readFile(
    new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  assert.match(preContact, /dodgeReport\?\.guardSuppressed === true/);
  assert.match(preContact, /&& !dodgeGuardDown/);
  const ui = await readFile(
    new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /event\.code === 'Space' && !event\.repeat/);
  const handoff = await readFile(
    new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');
  assert.match(handoff, /readDodgeIFramesActive: \(\) => callbacks\.readDodgeReport\?\.\(\)\?\.iFramesActive === true/);
});
