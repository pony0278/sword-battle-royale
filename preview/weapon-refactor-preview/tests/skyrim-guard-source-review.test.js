import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_MOTION_SOURCES,
  animationTimeAtFrame,
  normalizeAnimationBinding,
} from '../src/animation/animation-binding.js';
import {
  SKYRIM_GUARD_REVIEW_CLIPS,
  SKYRIM_GUARD_SOURCE_REVIEW,
  getSkyrimGuardReviewClip,
  getSkyrimGuardReviewSourceFile,
} from '../src/combat/skyrim-guard-source-review.js';

test('Skyrim is a first-class external motion source without changing authored fallback behavior', () => {
  assert.ok(ACTION_MOTION_SOURCES.includes('skyrim'));
  assert.deepEqual(normalizeAnimationBinding({
    source: 'skyrim',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    loop: true,
  }), {
    source: 'skyrim',
    clipId: 'SKYRIM_GUARD/shd_blockidle',
    speed: 1,
    startOffsetSeconds: 0,
    inPlace: true,
    loop: true,
    blendInSeconds: 0.08,
    blendOutSeconds: 0.12,
  });
  assert.equal(normalizeAnimationBinding({ source: 'not-real' }, 'guard').source, 'authored');
});

test('Skyrim guard manifest maps the uploaded shield-block family to combat roles', () => {
  assert.equal(SKYRIM_GUARD_REVIEW_CLIPS.length, 10);
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.enter.sourceFile, 'shd_blockanticipate.hkx');
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.hold.sourceFile, 'shd_blockidle.hkx');
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.hold.defaultPreviewMode, 'loop');
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.perfectGuard.sourceFile, 'shd_blocktimed.hkx');
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.counter.sourceFile, 'shd_blockbash.hkx');
  assert.equal(SKYRIM_GUARD_SOURCE_REVIEW.heavyCounter.sourceFile, 'shd_blockbashpower.hkx');
});

test('Skyrim guard source filenames and runtime clip ids remain unique and reversible', () => {
  const files = SKYRIM_GUARD_REVIEW_CLIPS.map((entry) => entry.sourceFile);
  const clipIds = SKYRIM_GUARD_REVIEW_CLIPS.map((entry) => entry.clipId);
  assert.equal(new Set(files).size, files.length);
  assert.equal(new Set(clipIds).size, clipIds.length);
  for (const entry of SKYRIM_GUARD_REVIEW_CLIPS) {
    assert.match(entry.sourceFile, /^shd_.*\.hkx$/);
    assert.match(entry.clipId, /^SKYRIM_GUARD\/shd_/);
    assert.equal(entry.source, 'skyrim');
    assert.equal(getSkyrimGuardReviewClip(entry.clipId), entry);
    assert.equal(getSkyrimGuardReviewSourceFile(entry.sourceFile), entry);
  }
});

test('looped Skyrim guard bindings use the existing shared external animation clock', () => {
  const binding = normalizeAnimationBinding({
    source: 'skyrim',
    clipId: SKYRIM_GUARD_SOURCE_REVIEW.hold.clipId,
    loop: true,
    speed: 1,
  });
  assert.equal(animationTimeAtFrame(binding, 75, 30, 2), 0.5);
});
