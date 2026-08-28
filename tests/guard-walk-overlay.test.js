import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  GUARD_WALK_OVERLAY_STAGE,
  WALK_OVERLAY_BONES,
  canWalkOverlayLegs,
  filterPoseToWalkOverlay,
} from '../src/combat/guard-walk-overlay.js';

test('R19E.1 the overlay claims the crouch leg chain, minus the pelvis, deliberately', async () => {
  assert.equal(GUARD_WALK_OVERLAY_STAGE, 'R19E.1');
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
