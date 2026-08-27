import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_DIRECTIONAL_ANCHOR_STAGE,
  GUARD_DIRECTIONAL_COVERAGE_ANCHORS,
  buildGuardDirectionalAnchorThreat,
  getGuardDirectionalAnchor,
  resolveGuardDirectionalAnchorPoint,
} from '../src/combat/guard-directional-anchor.js';

const surface = Object.freeze({
  center: Object.freeze({ x: 0, y: 1, z: 0.5 }),
  normal: Object.freeze({ x: 0, y: 0, z: 1 }),
  radius: 0.26,
  thickness: 0.02,
});

test('R18R.5 every attack direction has a measured coverage anchor', () => {
  assert.equal(GUARD_DIRECTIONAL_ANCHOR_STAGE, 'R18R.5');
  assert.deepEqual(Object.keys(GUARD_DIRECTIONAL_COVERAGE_ANCHORS), ['top', 'right', 'left']);
  for (const anchor of Object.values(GUARD_DIRECTIONAL_COVERAGE_ANCHORS)) {
    for (const axis of ['right', 'up', 'forward']) {
      assert.equal(typeof anchor[axis], 'number', `anchor is missing ${axis}`);
    }
  }
  assert.equal(getGuardDirectionalAnchor('LEFT'), GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left);
  assert.equal(getGuardDirectionalAnchor('nonsense'), null);
});

test('R18R.5 LEFT is the low sweep the high guard has to come down for', () => {
  const { top, right, left } = GUARD_DIRECTIONAL_COVERAGE_ANCHORS;
  assert.ok(left.up < right.up, 'LEFT should arrive lower than RIGHT');
  assert.ok(right.up < top.up, 'RIGHT should arrive lower than TOP');
  assert.ok(Math.abs(left.up) > 3 * Math.abs(top.up), 'TOP arrives roughly level with the guard');
});

test('R18R.5 resolves the anchor in the shield frame, depth included', () => {
  // normal = +z, so right = up x normal = (1, 0, 0) and up stays (0, 1, 0).
  const point = resolveGuardDirectionalAnchorPoint({ direction: 'left', bucklerSurface: surface });
  const anchor = GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left;
  assert.ok(Math.abs(point.x - (surface.center.x + anchor.right)) < 1e-9);
  assert.ok(Math.abs(point.y - (surface.center.y + anchor.up)) < 1e-9);
  assert.ok(Math.abs(point.z - (surface.center.z + anchor.forward)) < 1e-9);
  assert.equal(resolveGuardDirectionalAnchorPoint({ direction: 'left' }), null);
  assert.equal(resolveGuardDirectionalAnchorPoint({ direction: 'x', bucklerSurface: surface }), null);
});

test('R18R.5 the anchor threat carries no contact authority', () => {
  const threat = buildGuardDirectionalAnchorThreat({ direction: 'left', bucklerSurface: surface });
  assert.equal(threat.selection, 'directional-anchor');
  assert.equal(threat.direction, 'left');
  assert.equal(threat.futureSeconds, 0);
  assert.equal(threat.surface, surface);
  assert.match(threat.authority, /no-contact-authority/);
  const anchor = GUARD_DIRECTIONAL_COVERAGE_ANCHORS.left;
  const expected = Math.hypot(anchor.right, anchor.up, anchor.forward);
  assert.ok(Math.abs(threat.radialDistance - expected) < 1e-9);
  assert.equal(buildGuardDirectionalAnchorThreat({ direction: 'left' }), null);
});
