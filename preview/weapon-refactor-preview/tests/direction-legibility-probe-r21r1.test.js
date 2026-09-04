import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tool = await readFile(new URL('../tools/action-studio/measure-direction-legibility.mjs', import.meta.url), 'utf8');

test('R21R.1 the probe reads pixels, never the answer', () => {
  // The whole point: a probe that asks the API which way the swing went already knows, and
  // measures nothing about whether the picture says so. This one may only look.
  assert.doesNotMatch(tool, /attackRuntime\.snapshot\?\.action\?\.direction/);
  assert.doesNotMatch(tool, /defendedSectorFor|aimedSector|guardSector/);
  assert.match(tool, /getImageData/);
  // The HUD and the sector indicator are the answer written down.
  assert.match(tool, /classList\.add\('overlays-off'\)/);
  // And the review aid rescales the very thing being timed.
  assert.match(tool, /slowReview\.checked = false/);
});

test('R21R.1 it states that it is an upper bound, and why', () => {
  // A one-sided result is only useful if nobody reads it as the other side. A pixel comparison has
  // no attention and no reaction time, so "distinguishable" never means "a player will read it".
  assert.match(tool, /UPPER BOUND/);
  assert.match(tool, /no attention and no reaction time/);
  assert.match(tool, /if even this cannot separate the three at time T, no human can/);
});

test('R21R.1 it asks where the difference is, not only whether there is one', () => {
  // "The frames differ" is necessary and nowhere near enough - two swings can differ over a lot of
  // the screen and both read as "a man swinging".
  assert.match(tool, /distinctiveCentre/);
  assert.match(tool, /const GRID = 384;/);
  // 128 was tried first and averaged the blade away; the note is kept so nobody re-tries it.
  assert.match(tool, /128 was too coarse/);
  // Two thresholds, because "noticeably different" is not one number.
  assert.match(tool, /const THRESHOLDS = \[8, 24\];/);
});

test('R21R.1 the comparison runs in the page, not across the wire', () => {
  // At 384x384 a frame is megabytes; only the summary is worth carrying.
  assert.match(tool, /The comparison runs HERE, not in node/);
  assert.match(tool, /return \{ contactMs, table \};/);
});
