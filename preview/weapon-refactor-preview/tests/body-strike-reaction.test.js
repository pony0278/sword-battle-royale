import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BODY_STRIKE_REACTION_STAGE,
  BODY_STRIKE_REACTION_CLIP_ID,
  BODY_STRIKE_REACTION_DURATION_SECONDS,
  BODY_STRIKE_REACTION_BY_BAND,
  planBodyStrikeReaction,
  sampleBodyStrikeReaction,
} from '../src/combat/body-strike-reaction.js';

test('R19K.1 only a real strike plans a reaction - a near miss plans nothing', () => {
  assert.equal(BODY_STRIKE_REACTION_STAGE, 'R19K.1');
  // The gate that keeps the R19J.1 trap out of the feature. body-hurtbox returns the same shape
  // for "landed" and "came closest", and only `contact` tells them apart; measured in the browser,
  // all six successful block and parry exchanges carry a near-miss reading, so a reaction driven
  // off the reading rather than the flag would flinch on every one of them.
  const nearMiss = { contact: false, band: 'chest', reason: 'blade-missed-the-body', gapMeters: 0.04 };
  assert.equal(planBodyStrikeReaction(nearMiss), null);
  assert.equal(planBodyStrikeReaction(null), null);
  assert.equal(planBodyStrikeReaction({ band: 'chest' }), null, 'a missing flag is not a strike');

  const struck = planBodyStrikeReaction({ contact: true, band: 'chest' });
  assert.equal(struck.clipId, BODY_STRIKE_REACTION_CLIP_ID);
  assert.equal(struck.band, 'chest');
  assert.equal(struck.ownsWholeFighter, true);
  assert.match(struck.authority, /no-contact-authority/);
});

test('R19K.1 every hurtbox band has a reaction, and an unknown one still gets the default', () => {
  // The map exists so a per-band flinch is a data change later; today they share one clip, and
  // that sameness should be visible rather than hidden behind a constant.
  for (const band of ['head', 'chest', 'belly', 'waist', 'knees']) {
    assert.equal(BODY_STRIKE_REACTION_BY_BAND[band], BODY_STRIKE_REACTION_CLIP_ID, band);
  }
  const odd = planBodyStrikeReaction({ contact: true, band: 'shoulder' });
  assert.equal(odd.clipId, BODY_STRIKE_REACTION_CLIP_ID, 'an unmapped band still reacts');
});

test('R19K.1 the clock plays once and holds its last frame rather than looping', () => {
  const plan = planBodyStrikeReaction({ contact: true, band: 'head' });
  assert.equal(sampleBodyStrikeReaction(null, 100), null);

  const start = sampleBodyStrikeReaction(plan, 0);
  assert.equal(start.timeSeconds, 0);
  assert.equal(start.complete, false);

  const mid = sampleBodyStrikeReaction(plan, BODY_STRIKE_REACTION_DURATION_SECONDS * 500);
  assert.ok(Math.abs(mid.progress - 0.5) < 1e-6);
  assert.equal(mid.complete, false);

  // Past the end it clamps instead of wrapping: a wrapped clip would restart a stagger nobody was
  // hit a second time for.
  const past = sampleBodyStrikeReaction(plan, BODY_STRIKE_REACTION_DURATION_SECONDS * 3000);
  assert.equal(past.timeSeconds, BODY_STRIKE_REACTION_DURATION_SECONDS);
  assert.equal(past.progress, 1);
  assert.equal(past.complete, true);
});

test('R19K.1 the clip is the measured one and the pack that holds it is loaded', async () => {
  // Hit_B lives in KayKit's `general` pack, which basic+advanced does not include - loading it is
  // what makes the clip resolvable, and an unresolvable clip id throws on the first sampled frame
  // and takes the whole requestAnimationFrame loop with it (R19E).
  const bootstrap = await readFile(
    new URL('../src/game/bootstrap.js', import.meta.url),
    'utf8',
  );
  assert.match(bootstrap, /packIds: \['basic', 'advanced', 'general'\]/);
  assert.equal(BODY_STRIKE_REACTION_CLIP_ID, 'Hit_B');
  assert.ok(Math.abs(BODY_STRIKE_REACTION_DURATION_SECONDS - 0.867) < 1e-9,
    'the duration is read off the clip, not authored');
});

test('R19K.1 the reaction is driven by the event and applied after every other defender writer', async () => {
  const handoff = await readFile(
    new URL('../src/game/contact-handoff-controller.js', import.meta.url),
    'utf8',
  );
  // Fired from the body-struck branch, which the lifecycle reaches only on contact === true.
  const branch = handoff.indexOf("result.event?.type !== 'body-struck'");
  const fire = handoff.indexOf('callbacks.onBodyStruck?.(result.bodyContact)', branch);
  assert.ok(branch >= 0 && fire > branch, 'the callback must sit inside the body-struck branch');

  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(entry, /bodyStrikeReaction\.start\(exchangeState\.latestBodyHit/,
    'the near-miss field must never be the trigger');
  // Ordering is the whole implementation: the guard rebuilds the rig and the walk lays legs over
  // it, so a takeover applied before either would simply be erased.
  const guard = entry.indexOf('guardRuntime.update(deltaMs, camera);');
  const walk = entry.indexOf('laneController.overlayDefenderWalkLegs()', guard);
  const react = entry.indexOf('bodyStrikeReaction.sample(deltaMs)', walk);
  assert.ok(guard >= 0 && walk > guard && react > walk);
});
