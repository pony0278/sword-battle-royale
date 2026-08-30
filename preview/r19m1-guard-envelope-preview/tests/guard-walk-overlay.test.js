import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GUARD_WALK_OVERLAY_STAGE,
  WALK_OVERLAY_BONES,
  WALK_OVERLAY_SCOPES,
  canWalkOverlayLegs,
  filterPoseToWalkOverlay,
  planWalkOverlay,
} from '../src/combat/guard-walk-overlay.js';

test('R19E.1 the overlay claims the crouch leg chain, minus the pelvis, deliberately', async () => {
  assert.equal(GUARD_WALK_OVERLAY_STAGE, 'R20W.2');
  // Every overlay bone is one the planted crouch also owns - these are the bones with two
  // would-be owners, verified against the source that declares them rather than restated.
  const stanceSource = await readFile(
    new URL('../src/combat/guard-residual-stance-reach.js', import.meta.url),
    'utf8',
  );
  for (const bone of WALK_OVERLAY_BONES) {
    assert.ok(stanceSource.includes(`'${bone}'`), `${bone} is not a bone the crouch owns`);
  }
  // hips is the deliberate exception, and this assertion is the record of why: the spine chain is
  // parented to it, so overlaying the walk's hips pitched the entire guard torso over -- verified
  // by screenshot, not reasoning. Adding hips back means re-checking that picture.
  assert.ok(!WALK_OVERLAY_BONES.includes('hips'), 'hips takes the guard torso with it');
  assert.equal(WALK_OVERLAY_BONES.length, 6);
});

test('R19E.1 the walk owns the legs only between exchanges', () => {
  assert.equal(canWalkOverlayLegs({}).allowed, true);
  assert.equal(canWalkOverlayLegs({ attackInFlight: false, combatResolving: false }).allowed, true);

  const during = canWalkOverlayLegs({ attackInFlight: true });
  assert.equal(during.allowed, false);
  assert.match(during.reason, /attack-in-flight/);

  const resolving = canWalkOverlayLegs({ combatResolving: true });
  assert.equal(resolving.allowed, false);
  assert.match(resolving.reason, /impact-resolving/);

  assert.match(canWalkOverlayLegs({}).authority, /no-contact-authority/);
});

test('R19E.1 the filter keeps leg bones, drops everything else, and tolerates gaps', () => {
  const capture = {
    'hips': { position: [0, 1, 0] },
    'upperleg.l': { position: [1, 0, 0] },
    'foot.r': { position: [2, 0, 0] },
    'upperarm.r': { position: [9, 9, 9] },
    'head': { position: [8, 8, 8] },
  };
  const subset = filterPoseToWalkOverlay(capture);
  assert.deepEqual(Object.keys(subset).sort(), ['foot.r', 'upperleg.l']);
  assert.equal(subset.hips, undefined, 'the guard keeps its pelvis');
  assert.equal(subset['upperarm.r'], undefined, 'the guard keeps its arms');
  assert.equal(subset.head, undefined);
  // Absent bones stay absent rather than becoming empty entries applyRigPose would zero out.
  assert.deepEqual(filterPoseToWalkOverlay(null), {});
  assert.deepEqual(filterPoseToWalkOverlay({}), {});
});

test('R20W.2 with no guard to hold, the walk takes the whole fighter', () => {
  // R19E.1's legs-only rule exists because the guard IS the upper body. Free movement made a second
  // case: travelling with the guard down, where keeping the torso in a sword idle while the legs
  // stride is a fighter walking from the waist down.
  const between = { attackInFlight: false, combatResolving: false };
  const guarding = planWalkOverlay({ ...between, guardOwnsUpperBody: true });
  assert.equal(guarding.allowed, true);
  assert.equal(guarding.scope, WALK_OVERLAY_SCOPES.LEGS);

  const unguarded = planWalkOverlay({ ...between, guardOwnsUpperBody: false });
  assert.equal(unguarded.allowed, true);
  assert.equal(unguarded.scope, WALK_OVERLAY_SCOPES.WHOLE_BODY);

  // The default stays what it always was, so a caller that says nothing still gets the safe scope.
  assert.equal(planWalkOverlay(between).scope, WALK_OVERLAY_SCOPES.LEGS);
  // And an exchange still takes the fighter back whatever the guard is doing.
  assert.equal(planWalkOverlay({ attackInFlight: true, guardOwnsUpperBody: false }).allowed, false);
  assert.equal(planWalkOverlay({ attackInFlight: true, guardOwnsUpperBody: false }).scope, WALK_OVERLAY_SCOPES.NONE);
});

test('R20W.2 a whole-body clip is never worn from the waist down', () => {
  // A run has no legs-only reading: its torso and arms are the gait. Rather than let it take the
  // upper body from a raised guard, the guard keeps the fighter and the locomotion is dropped.
  const running = planWalkOverlay({
    attackInFlight: false, combatResolving: false, guardOwnsUpperBody: true, wholeBodyClip: true,
  });
  assert.equal(running.allowed, false);
  assert.equal(running.scope, WALK_OVERLAY_SCOPES.NONE);
  assert.match(running.reason, /waist-down/);
  // Guard down, the same clip is exactly what should play.
  assert.equal(planWalkOverlay({
    attackInFlight: false, combatResolving: false, guardOwnsUpperBody: false, wholeBodyClip: true,
  }).scope, WALK_OVERLAY_SCOPES.WHOLE_BODY);
});

test('R20W.2 whole-body scope drops nothing the capture carried', () => {
  const pose = { 'foot.l': { x: 1 }, chest: { x: 2 }, 'upperarm.r': { x: 3 }, hips: { x: 4 } };
  const legs = filterPoseToWalkOverlay(pose, WALK_OVERLAY_SCOPES.LEGS);
  assert.deepEqual(Object.keys(legs), ['foot.l']);
  const whole = filterPoseToWalkOverlay(pose, WALK_OVERLAY_SCOPES.WHOLE_BODY);
  assert.deepEqual(Object.keys(whole).sort(), ['chest', 'foot.l', 'hips', 'upperarm.r']);
  assert.ok(Object.isFrozen(whole));
});
