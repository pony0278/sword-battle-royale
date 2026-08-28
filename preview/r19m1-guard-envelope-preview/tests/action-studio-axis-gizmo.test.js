import test from 'node:test';
import assert from 'node:assert/strict';

import {
  axisConstrainedTarget,
  snapAxisDragDistance,
} from '../tools/action-studio/studio-axis-gizmo.js';

test('axis snapping rounds signed drag distances to five-centimeter increments', () => {
  assert.equal(snapAxisDragDistance(0.123, true), 0.1);
  assert.equal(snapAxisDragDistance(-0.128, true), -0.15);
  assert.equal(snapAxisDragDistance(0.123, false), 0.123);
});

test('world Y axis drag cannot leak into X or Z', () => {
  const result = axisConstrainedTarget(
    { x: 0.4, y: 1.2, z: -0.3 },
    { x: 0, y: 1, z: 0 },
    -0.42,
  );
  assert.deepEqual(result.target, { x: 0.4, y: 0.78, z: -0.3 });
  assert.equal(result.distance, -0.42);
});

test('local axis direction is normalized before applying distance and snap', () => {
  const result = axisConstrainedTarget(
    { x: 1, y: 2, z: 3 },
    { x: 2, y: 0, z: 2 },
    0.124,
    { snap: true, snapStep: 0.05 },
  );
  const expectedOffset = 0.1 / Math.sqrt(2);
  assert.ok(Math.abs(result.target.x - (1 + expectedOffset)) < 1e-10);
  assert.equal(result.target.y, 2);
  assert.ok(Math.abs(result.target.z - (3 + expectedOffset)) < 1e-10);
  assert.equal(result.distance, 0.1);
});
