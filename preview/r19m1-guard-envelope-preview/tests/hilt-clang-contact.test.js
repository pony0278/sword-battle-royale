import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  HILT_CLANG_CONTACT_STAGE,
  HILT_CLANG_CONTACT_AUTHORITY,
  HILT_CLANG_ZONE_RADIUS_METERS,
  buildHiltPolyline,
  probeHiltClangContact,
} from '../src/combat/hilt-clang-contact.js';

const surface = { center: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.26, thickness: 0.075 };

function hiltAt(z, x = 0) {
  // wrist below, blade base above - a vertical hilt at depth z
  return buildHiltPolyline({ x, y: 0.8, z }, { x, y: 1.1, z });
}

test('R19P.1 a hilt sweeping through the zone is a contact; one passing wide is not', () => {
  assert.equal(HILT_CLANG_CONTACT_STAGE, 'R19P.1');
  const clang = probeHiltClangContact({
    previousHilt: hiltAt(-0.2), currentHilt: hiltAt(0.2), bucklerSurface: surface, deltaSeconds: 1 / 60,
  });
  assert.equal(clang.hiltClang, true);
  assert.equal(clang.geometricContact, true);
  assert.equal(clang.authority, HILT_CLANG_CONTACT_AUTHORITY);
  assert.equal(clang.clangZoneRadiusMeters, HILT_CLANG_ZONE_RADIUS_METERS);
  assert.equal(clang.physicalDiscRadiusMeters, 0.26, 'the physical disc is reported, not overwritten');

  const wide = probeHiltClangContact({
    previousHilt: hiltAt(-0.2, HILT_CLANG_ZONE_RADIUS_METERS + 0.5),
    currentHilt: hiltAt(0.2, HILT_CLANG_ZONE_RADIUS_METERS + 0.5),
    bucklerSurface: surface, deltaSeconds: 1 / 60,
  });
  assert.equal(wide.hiltClang, false, 'outside the zone the swing passes');

  const short = probeHiltClangContact({
    previousHilt: hiltAt(-0.5), currentHilt: hiltAt(-0.2), bucklerSurface: surface, deltaSeconds: 1 / 60,
  });
  assert.equal(short.hiltClang, false, 'a hilt that never reaches the plane clangs nothing');

  assert.equal(probeHiltClangContact({ currentHilt: hiltAt(0), bucklerSurface: surface }), null);
  assert.equal(buildHiltPolyline(null, { x: 0, y: 0, z: 0 }), null);
});

test('R19P.1 the zone covers the measured arm corridors and no more than that', () => {
  // TOP's corridor crosses at 0.52-0.66m from the resting shield centre and RIGHT's horizontal
  // sweep at about 0.85m; the zone must reach past RIGHT's with margin. The upper bound keeps a
  // later "just make it bigger" from silently turning the clang into an everywhere-contact - at
  // that point the zone stops describing the defender's braced frontal area at all.
  assert.ok(HILT_CLANG_ZONE_RADIUS_METERS > 0.86);
  assert.ok(HILT_CLANG_ZONE_RADIUS_METERS <= 1.0);
});

test('R19P.1 the clang is hold-posture block-mode only, asked after the blade and before the body', async () => {
  const director = await readFile(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
  // Parry keeps its own contract; the clang must never hand it a contact.
  assert.match(director, /selectedMode !== 'parry'/);
  assert.match(director, /readCloseRangePosture\?\.\(\)\?\.posture === 'hold-at-neutral'/);
  // Ordering is the design: the real blade contact is asked first, the clang second, the body
  // last - so a clang can save the body, and a true blade block is never displaced by one.
  const blade = director.indexOf('let contactEvaluation = evaluateSweptContactTemporalEligibility({');
  const clang = director.indexOf('probeHiltClangContact({', blade);
  const body = director.indexOf('readDefenderHurtbox?.()', clang);
  assert.ok(blade >= 0 && clang > blade && body > clang, 'blade, then clang, then body');
  // On a clang the evaluation is replaced wholesale so the ordinary block path runs unchanged.
  assert.match(director, /if \(clangEvaluation\.contact\) contactEvaluation = clangEvaluation;/);
});
