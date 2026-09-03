// R24G.2 - the log says how fast the phone ran.
//
// A person reported the opponent's shield arm shaking on a phone and not on a desktop, on the same
// build. Measured in emulation: the same swing at 30fps moves the shield hand up to 23cm in one
// frame where 60fps moves it 12cm, because every per-frame writer scales with dt. Whether the
// phone is at 30 was a guess; the pasted log now carries the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_TIME_SAMPLE_CAPACITY, createFrameTimeSampler, formatFrameTimeLine } from '../src/game/frame-time-sampler.js';
import { formatSwingLedgerReport } from '../src/game/swing-ledger.js';

test('R24G.2 the sampler reports the typical frame, the worst one and how many it saw', () => {
  const sampler = createFrameTimeSampler({ capacity: 5 });
  for (const ms of [16.7, 16.6, 33.4, 16.8, 50]) sampler.push(ms);
  const r = sampler.report;
  assert.equal(r.samples, 5);
  assert.equal(r.medianMs, 16.8);
  assert.equal(r.worstMs, 50);
  assert.ok(Math.abs(r.medianFps - 1000 / 16.8) < 1e-9);
  assert.equal(sampler.push(0), false, 'a clock that did not advance is not a frame');
  assert.equal(sampler.push(-5), false);
  assert.equal(sampler.push('x'), false);
  assert.equal(sampler.report.samples, 5);
});

test('R24G.2 the sampler keeps the fight that was just played, not the loading screen', () => {
  assert.equal(FRAME_TIME_SAMPLE_CAPACITY, 900, '15s at 60fps');
  const sampler = createFrameTimeSampler({ capacity: 3 });
  for (const ms of [100, 100, 100, 16, 16, 16]) sampler.push(ms);
  assert.equal(sampler.report.medianMs, 16, 'the old slow frames have rolled off');
  assert.equal(sampler.report.worstMs, 16);
  assert.equal(sampler.report.pushed, 6);
  sampler.reset();
  assert.equal(sampler.report.samples, 0);
});

test('R24G.2 the line reads as a person would ask it, and says when there is nothing yet', () => {
  assert.equal(formatFrameTimeLine(null), '幀時間 —（尚未取樣）');
  const sampler = createFrameTimeSampler();
  for (let i = 0; i < 100; i += 1) sampler.push(i === 99 ? 48 : 33.3);
  assert.match(formatFrameTimeLine(sampler.report), /^幀時間 中位 33\.3ms（30 fps）· 95% 33\.3ms · 最差 48\.0ms · 樣本 100$/);
});

test('R24G.2 the pasted swing log carries the line', () => {
  const sampler = createFrameTimeSampler();
  for (let i = 0; i < 10; i += 1) sampler.push(16.7);
  const text = formatSwingLedgerReport({ context: { build: 'x', frameTime: sampler.report } });
  assert.match(text, /幀時間 中位 16\.7ms（60 fps）/);
  assert.doesNotMatch(formatSwingLedgerReport({ context: { build: 'x' } }), /幀時間/, 'a log without samples says nothing about them');
});
