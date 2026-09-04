import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  SWING_WINDUP_TRACKING_STAGE,
  SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND,
  planSwingFacingPolicy,
} from '../src/combat/swing-windup-tracking.js';
import { ATTACK_PHASES } from '../src/combat/attack-phases.js';
import { BASE_FACING_TURN_RATE_RADIANS_PER_SECOND, createBaseFacingRuntime } from '../src/combat/base-facing.js';
import { GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND } from '../src/combat/guard-facing-turn.js';

test('R20B.1 the rate is 45 deg/s: inside the rate-insensitive band, under every free rate', () => {
  assert.equal(SWING_WINDUP_TRACKING_STAGE, 'R20B.1');
  const degrees = (SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND * 180) / Math.PI;
  assert.ok(Math.abs(degrees - 45) < 1e-9);
  // Outcomes were identical at 20, 45 and 90 deg/s on every measured cell; 45 sits inside
  // that band with margin above its floor.
  assert.ok(degrees >= 20);
  // And the hierarchy stays readable: a committed body turns slower than a free one, far
  // slower than the guard turn - and slower than the ~95 deg/s a dash-grade burst produces,
  // so the future dodge verb can out-run it.
  assert.ok(SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND < BASE_FACING_TURN_RATE_RADIANS_PER_SECOND);
  assert.ok(SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND < GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND);
  assert.ok(degrees < 95);
});

test('R20B.1 track through the windup, freeze from the active window, free otherwise', () => {
  const free = planSwingFacingPolicy({ swingLive: false, phase: ATTACK_PHASES.WINDUP });
  assert.equal(free.mode, 'free');
  assert.equal(free.rateRadiansPerSecond, null);
  const track = planSwingFacingPolicy({ swingLive: true, phase: ATTACK_PHASES.WINDUP });
  assert.equal(track.mode, 'track');
  assert.equal(track.rateRadiansPerSecond, SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND);
  assert.equal(planSwingFacingPolicy({ swingLive: true, phase: ATTACK_PHASES.ACTIVE }).mode, 'frozen');
  // Doubt resolves to the freeze - a live swing in a nameless phase keeps the measured
  // legacy behaviour, so a caller that never learned to pass the phase changes nothing.
  assert.equal(planSwingFacingPolicy({ swingLive: true, phase: null }).mode, 'frozen');
  assert.equal(planSwingFacingPolicy({ swingLive: true }).mode, 'frozen');
});

test('R20B.1 the per-update rate override can only slow a facing, never hurry it', () => {
  const facing = createBaseFacingRuntime();
  facing.snapTo(0);
  // Capped: a quarter-second at 45 deg/s is 11.25 degrees, not the free rate's 45.
  const capped = facing.update(Math.PI / 2, 0.25, {
    rateRadiansPerSecond: SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND,
  });
  assert.ok(Math.abs(capped - SWING_WINDUP_TRACKING_RATE_RADIANS_PER_SECOND * 0.25) < 1e-12);
  // An override above the runtime's own rate clamps to it.
  facing.snapTo(0);
  const clamped = facing.update(Math.PI, 0.1, { rateRadiansPerSecond: 100 });
  assert.ok(Math.abs(clamped - BASE_FACING_TURN_RATE_RADIANS_PER_SECOND * 0.1) < 1e-12);
  // And a null override is exactly the legacy path.
  facing.snapTo(0);
  const legacy = facing.update(Math.PI, 0.1, { rateRadiansPerSecond: null });
  assert.ok(Math.abs(legacy - BASE_FACING_TURN_RATE_RADIANS_PER_SECOND * 0.1) < 1e-12);
});

test('R20B.1 the lane wires the policy and the entry hands the phase down', async () => {
  const lane = await readFile(
    new URL('../src/game/lane-controller.js', import.meta.url), 'utf8');
  assert.match(lane, /planSwingFacingPolicy\(\{ swingLive, phase: swingPhase \}\)/);
  assert.match(lane, /frozen: facingPolicy\.mode === 'frozen'/);
  assert.match(lane, /rateRadiansPerSecond: facingPolicy\.rateRadiansPerSecond/);
  // The phase is the attack runtime's word, told alongside swingLive rather than re-derived.
  assert.match(lane, /swingPhase = swingLive \? phase : null/);
  const entry = await readFile(
    new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  // R23G.1: still one snapshot's elapsed, action and phase handed down together - but the entry
  // now picks WHICH swing that is, because either fighter can be the one throwing it and the
  // ledger underneath holds exactly one advance runtime.
  assert.match(entry, /laneController\.update\(laneSwing\.elapsedSeconds, Boolean\(laneSwing\.action\), laneSwing\.phase\)/);
});
