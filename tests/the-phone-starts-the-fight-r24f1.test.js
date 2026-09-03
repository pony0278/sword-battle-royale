// R24F.1 - the phone starts the fight (#35).
//
// Measured before (Playwright, iPhone and Android sizes): a phone opened with no defence chosen,
// no lock and no drive, on a 58vh scene under a 207px HUD with six thousand pixels of lab text
// below it; an Android in landscape is over 900 CSS px wide and got the desktop layout, whose HUD
// covered the fighters completely. The overlay planner below is the decision; the lab UI paints it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_COUNTDOWN_MS, START_OVERLAY_KINDS, START_PHASES, createMobileStartRuntime, planStartOverlay,
} from '../src/game/mobile-start.js';
import { SHIELD_PARRY_LAB_REQUIRED_DOM_IDS } from '../tools/action-studio/shield-parry-r281/lab-dom.js';

test('R24F.1 a fine pointer sees no overlay and keeps its drive', () => {
  for (const phase of Object.values(START_PHASES)) {
    const plan = planStartOverlay({ coarse: false, portrait: true, phase });
    assert.equal(plan.visible, false);
    assert.equal(plan.driveAllowed, true, 'the desktop drive is the checkbox\'s business');
  }
});

test('R24F.1 a coarse pointer in portrait is asked to rotate, whatever the phase, and the drive waits', () => {
  for (const phase of Object.values(START_PHASES)) {
    const plan = planStartOverlay({ coarse: true, portrait: true, phase, remainingMs: 1500 });
    assert.equal(plan.kind, START_OVERLAY_KINDS.ROTATE, phase);
    assert.equal(plan.driveAllowed, false, phase);
  }
});

test('R24F.1 landscape: start, then 3-2-1, then the fight, then the rematch', () => {
  const rt = createMobileStartRuntime();
  rt.setEnvironment({ coarse: true, portrait: false });
  assert.equal(rt.report.kind, START_OVERLAY_KINDS.START);
  assert.equal(rt.report.driveAllowed, false);
  assert.equal(rt.press().accepted, true);
  assert.equal(rt.phase, START_PHASES.COUNTDOWN);
  assert.equal(rt.press().accepted, false, 'a second press mid-countdown is ignored');
  const counts = [];
  for (let i = 0; i < 200; i += 1) {
    const plan = rt.advance(1000 / 60);
    if (plan.kind === START_OVERLAY_KINDS.COUNTDOWN) counts.push(plan.count);
    if (plan.driveAllowed) break;
  }
  assert.deepEqual([...new Set(counts)], [3, 2, 1], 'the count reads 3, 2, 1 and never 0');
  assert.equal(rt.phase, START_PHASES.FIGHTING);
  assert.ok(Math.abs(counts.length * 1000 / 60 - START_COUNTDOWN_MS) < 1000 / 60 + 1e-9, 'three seconds at 60Hz');
  assert.equal(rt.report.visible, false, 'nothing over the fight');
  assert.equal(rt.report.driveAllowed, true);
  rt.advance(16, { duelOver: true });
  assert.equal(rt.report.kind, START_OVERLAY_KINDS.REMATCH);
  assert.equal(rt.report.driveAllowed, false, 'a finished duel swings at nobody');
  assert.equal(rt.press().accepted, true, 'the same button is the rematch');
  assert.equal(rt.phase, START_PHASES.COUNTDOWN);
});

test('R24F.1 rotating back to portrait mid-fight pauses the drive and rotating again resumes it without a restart', () => {
  const rt = createMobileStartRuntime({ countdownMs: 100 });
  rt.setEnvironment({ coarse: true, portrait: false });
  rt.press();
  rt.advance(100);
  assert.equal(rt.phase, START_PHASES.FIGHTING);
  assert.equal(rt.setEnvironment({ portrait: true }).driveAllowed, false);
  assert.equal(rt.report.kind, START_OVERLAY_KINDS.ROTATE);
  assert.equal(rt.press().accepted, false, 'there is no button in portrait');
  const back = rt.setEnvironment({ portrait: false });
  assert.equal(back.driveAllowed, true);
  assert.equal(back.visible, false);
  assert.equal(rt.phase, START_PHASES.FIGHTING, 'the fight it was in, not a new one');
});

test('R24F.1 the page has to carry the overlay: the DOM registry demands it', () => {
  for (const id of ['startOverlay', 'startButton', 'startCount', 'labToggle']) {
    assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes(id), id);
  }
});
