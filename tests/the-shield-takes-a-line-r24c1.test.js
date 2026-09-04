// R24C.1 — the shield takes a line instead of hunting for one (#31, second pass).
//
// Playtesters saw the opponent's shield arm "searching" while they swung. Measured on BOTH
// defenders at 2.40m the machinery and the travel were the same (the player's own shield moves
// as much; it is just behind the camera). Three parts of that travel answered nothing:
//   1. a swing thrown while the last blade was still retracting past the shield engaged the
//      measured aim on the receding blade - 34-70mm/frame of lunge toward a sword on its way out;
//   2. once the blade had passed the plane the aim fell back to the direction anchor and the arm
//      turned around at 40mm/frame, one frame after meeting the blade;
//   3. a swing that missed kept the shield chasing the recovering blade, 0.28m at 30mm/frame.
// None of the three is where the shield is when the blade arrives, which is all the swept contact
// test reads - the golden grid, parry gate and defence matrix hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGuardCoverageTargetTracker } from '../src/combat/guard-coverage-target.js';

const bucklerSurface = Object.freeze({ center: { x: 0, y: 1, z: 0.6 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.16 });
const approach = (planeGap, combined = Math.hypot(planeGap, 0.05)) => Object.freeze({
  planeGapMeters: planeGap, radialGapMeters: 0.05, combinedGapMeters: combined, signedDistance: planeGap,
  radialDistanceMeters: 0.2, planePoint: { x: 0.2, y: 1, z: 0.6 }, point: { x: 0.2, y: 1, z: 0.6 + planeGap },
});
const select = (tracker, sequence, gap) => tracker.select({ sequence, deltaSeconds: 1 / 60, direction: 'right', predictedThreat: null, approach: approach(gap), bucklerSurface });

test('R24C.1 a receding blade is not measured: the aim engages only while the plane gap is closing', () => {
  const tracker = createGuardCoverageTargetTracker();
  assert.equal(select(tracker, 1, 0.40).engaged, false, 'a first reading has no trend and waits');
  assert.equal(select(tracker, 1, 0.42).engaged, false, 'opening - the last swing\'s blade on its way out');
  const opening = select(tracker, 1, 0.55);
  assert.equal(opening.engaged, false);
  assert.equal(opening.source, 'directional-anchor', 'the far-blade aim, as if nothing were near');
  assert.equal(select(tracker, 1, 0.55).engaged, false, 'a blade that is not moving is not closing either');
  const closing = select(tracker, 1, 0.50);
  assert.equal(closing.engaged, true, 'closing again - the real swing');
  assert.equal(closing.source, 'measured-swept-approach');
});

test('R24C.1 outside the window in which the blade could still arrive, nothing is measured', () => {
  const tracker = createGuardCoverageTargetTracker();
  select(tracker, 2, 0.30);
  const early = tracker.select({ sequence: 2, deltaSeconds: 1 / 60, direction: 'right', predictedThreat: null, approach: approach(0.10), bucklerSurface, measurable: false });
  assert.equal(early.engaged, false, 'closing, near, and still the last swing\'s blade');
  assert.equal(tracker.held, null, 'and nothing is held from it');
  const late = tracker.select({ sequence: 2, deltaSeconds: 1 / 60, direction: 'right', predictedThreat: null, approach: approach(0.05), bucklerSurface, measurable: true });
  assert.equal(late.engaged, true);
  const controller = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  // Composition: the window is the swing's active start less the guard horizon, handed to the director.
  assert.match(controller, /Number\(snapshot\.elapsedSeconds\) \+ getGuardThreatTrackingProfile\('guard'\)\.horizonSeconds >= activeStartSeconds/);
  assert.match(controller, /committed: engaged,\n\s*measurable,/);
});

test('R24C.1 once measured, the line is held until the sequence ends - no fall back to the anchor after the pass', () => {
  const tracker = createGuardCoverageTargetTracker();
  select(tracker, 3, 0.30); const met = select(tracker, 3, 0.10);
  assert.equal(met.engaged, true);
  const passed = tracker.select({ sequence: 3, deltaSeconds: 1 / 60, direction: 'right', predictedThreat: null, approach: approach(1.5, 1.9), bucklerSurface });
  assert.equal(passed.source, 'measured-held');
  assert.equal(passed.held, true);
  assert.equal(passed.engaged, false, 'held is not measured - the latch does not re-engage on it');
  assert.deepEqual(passed.threat.point, met.threat.point, 'the aim is where the blade was met');
  assert.deepEqual(tracker.held, met.threat);
  const next = tracker.select({ sequence: 4, deltaSeconds: 1 / 60, direction: 'right', predictedThreat: null, approach: approach(1.5, 1.9), bucklerSurface });
  assert.equal(next.source, 'directional-anchor', 'a new swing starts from nothing');
  assert.equal(tracker.held, null);
  tracker.reset();
  assert.equal(tracker.held, null);
});

test('R24C.1 the coverage stands down in the recovery: a blade on its way home is nobody\'s threat', () => {
  const controller = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  // Composition of the engaged gate, read rather than run: the recovery phase joins the interrupted one.
  assert.match(controller, /const engaged = snapshot\.phase !== ATTACK_PHASES\.INTERRUPTED\n\s*&& snapshot\.phase !== ATTACK_PHASES\.RECOVERY\n\s*&& relevance\.relevant/);
});
