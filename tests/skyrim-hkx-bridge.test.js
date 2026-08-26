import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKYRIM_LE_HKX_MARKERS,
  inspectSkyrimAnimationHkx,
} from '../tools/skyrim-hkx-bridge/inspect-hkx.mjs';

test('G2.2 raw probe accepts the expected Skyrim LE spline animation marker family', () => {
  const bytes = Buffer.from(`prefix\0${SKYRIM_LE_HKX_MARKERS.join('\0')}\0suffix`, 'ascii');
  const report = inspectSkyrimAnimationHkx(bytes, { filename: 'shd_blockidle.hkx' });
  assert.equal(report.filename, 'shd_blockidle.hkx');
  assert.equal(report.format, 'hk_2010.2.0-r1');
  assert.equal(report.animationClass, 'hkaSplineCompressedAnimation');
  assert.equal(report.bindingClass, 'hkaAnimationBinding');
  assert.equal(report.rootMarker, 'NPC Root [Root]');
  assert.equal(report.acceptedForG22Bridge, true);
  assert.deepEqual(report.missingMarkers, []);
});

test('G2.2 raw probe rejects a file that is not the expected Skyrim skeletal animation container', () => {
  const report = inspectSkyrimAnimationHkx(Buffer.from('not a havok animation'));
  assert.equal(report.acceptedForG22Bridge, false);
  assert.ok(report.missingMarkers.includes('hk_2010.2.0-r1'));
  assert.ok(report.missingMarkers.includes('hkaSplineCompressedAnimation'));
});
