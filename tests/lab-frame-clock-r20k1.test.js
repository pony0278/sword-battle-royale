import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLabFrameClock } from '../tools/action-studio/shield-parry-r281/frame-clock.js';

// R20K.1 (B6e) - the golden grid stopped being a safety net because it answered the same question
// differently on different runs: roughly one flipped cell per eleven-cell pass, wandering between
// cells, on main as much as on any branch. The cause was not the lab but the clock. These cells
// clear the shield by as little as 1cm (measured, LEFT@2.0: 0.0-1.3cm at closest approach), and on
// the browser's own frame deltas each run sampled the swing at a different phase. Pinning the step
// makes a cell reproduce bit for bit - measured 8/8 identical to six decimals, and 5/5 identical
// under synthetic main-thread load that misses the block 4 times in 5 on the wall clock.

test('R20K.1 the wall clock clamps a dropped frame instead of teleporting the sim', () => {
  const clock = createLabFrameClock({ now: () => 0 });
  assert.equal(clock.tick(16), 16);
  assert.equal(clock.tick(32), 16);
  assert.equal(clock.tick(500), 50, 'a long frame is worth at most the clamp');
  assert.equal(clock.tick(400), 0, 'time never runs backwards');
  assert.equal(clock.frames, 4);
  assert.equal(clock.fixedStepMs, null);
  assert.equal(clock.report.pinned, false);
});

test('R20K.1 a pinned step is worth the same sim time whatever the browser delivers', () => {
  const clock = createLabFrameClock({ now: () => 0 });
  clock.setFixedStep(1000 / 60);
  for (const timestamp of [16, 33, 900, 901, 5000]) {
    assert.equal(clock.tick(timestamp), 1000 / 60, 'a pinned frame ignores the wall entirely');
  }
  assert.equal(clock.frames, 5, 'frames are the harness unit: 5 frames is exactly 5 steps of sim');
  assert.equal(clock.report.pinned, true);
});

test('R20K.1 hands the clock back to the wall on any non-positive pin', () => {
  const clock = createLabFrameClock({ now: () => 0 });
  clock.setFixedStep(20);
  assert.equal(clock.tick(1000), 20);
  for (const bad of [null, 0, -5, Number.NaN, undefined, 'fast']) {
    assert.equal(clock.setFixedStep(bad), null, `${String(bad)} must not pin`);
  }
  clock.tick(1100);
  assert.equal(clock.tick(1120), 20, 'back on the wall, clamped as before');
});

test('R20K.1 keeps play on the wall clock and lets only a harness pin it', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /const frameClock = createLabFrameClock\(\);/);
  assert.match(entry, /const rawDeltaMs = frameClock\.tick\(timestamp\);/);
  // The entry may not keep its own timestamp any more, or the two clocks would drift apart.
  assert.doesNotMatch(entry, /\blet lastTimestamp\b/);
  assert.match(entry, /setFixedStepMs: \(ms\) => frameClock\.setFixedStep\(ms\)/);
});

test('R20K.1 the golden driver pins the step and counts frames, never milliseconds', () => {
  const driver = readFileSync(new URL('../tools/action-studio/b1-golden/capture-golden-grid.mjs', import.meta.url), 'utf8');
  assert.match(driver, /a\.setFixedStepMs\(1000 \/ 60\)/);
  assert.match(driver, /if \(typeof a\.setFixedStepMs !== 'function'\) throw new Error/, 'a lab without the pin must fail loudly, not silently go back to flaky');
  assert.match(driver, /const SETTLE_FRAMES = 30;/);
  assert.match(driver, /const EXCHANGE_FRAMES = 150;/);
  assert.match(driver, /a\.frameClock\.frames >= target/);
  // The wall-clock waits are what made the grid unreproducible; they may not come back.
  assert.doesNotMatch(driver, /waitForTimeout/);
  assert.doesNotMatch(driver, /setTimeout\(res/);
});
