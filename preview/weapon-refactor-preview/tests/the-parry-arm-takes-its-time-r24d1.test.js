// R24D.1 — the parry's first frame is a frame, not a teleport (#32).
//
// Measured on both fighters (the same code): on the frame a parry armed, the shield hand jumped
// 13-24cm. Not the entry blend - lengthening it from 55 to 120ms halved the spine and chest's
// first-frame turn and left the arm's almost untouched (20.4 -> 16.4 and 22.5 -> 22.1 degrees).
// Two writers did it: the bounded shield-arm additive, whose 18/22 degree bound is an angle and
// not a speed, so the first frame wrote the whole of it; and the parry clip's hips translation,
// which the entry blend (rotations only) let through whole - 49mm in one frame, the torso and
// arms riding on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY, createBoundedShieldArmAdditiveRuntime } from '../src/combat/predictive-parry-arm-additive.js';
import { createPredictiveInterceptParryPresentationRuntime } from '../src/combat/predictive-intercept-parry.js';
import { createParryInterceptDirector } from '../src/combat/parry-intercept-director.js';

const identity = () => ({ x: 0, y: 0, z: 0, w: 1 });
const axisAngleZ = (degrees) => { const r = degrees * Math.PI / 180; return { x: 0, y: 0, z: Math.sin(r / 2), w: Math.cos(r / 2) }; };
const angleDegrees = (q) => { const n = Math.hypot(q.x, q.y, q.z, q.w) || 1; return 2 * Math.acos(Math.min(1, Math.abs(q.w / n))) * 180 / Math.PI; };
const authored = (upper, lower) => ({ deltas: { 'upperarm.l': { quaternion: axisAngleZ(upper), angleDegrees: upper }, 'lowerarm.l': { quaternion: axisAngleZ(lower), angleDegrees: lower }, 'wrist.l': { quaternion: identity(), angleDegrees: 0 } } });
const rig = () => ({ bones: { 'upperarm.l': { quaternion: identity() }, 'lowerarm.l': { quaternion: identity() }, 'wrist.l': { quaternion: identity() } } });

test('R24D.1 with a clock, the additive paces its bound: six degrees a frame at 60Hz, the cap in three to four', () => {
  assert.equal(R18N_BOUNDED_SHIELD_ARM_ADDITIVE_POLICY.maxStepDegreesPerSecond, 360);
  const r = rig(); const runtime = createBoundedShieldArmAdditiveRuntime();
  const frames = [];
  for (let i = 0; i < 5; i += 1) {
    const report = runtime.update({ rig: r, authoredDelta: authored(60, 60), sequence: 1, enabled: true, deltaSeconds: 1 / 60 });
    frames.push([+angleDegrees(r.bones['upperarm.l'].quaternion).toFixed(2), +angleDegrees(r.bones['lowerarm.l'].quaternion).toFixed(2), report.bones['upperarm.l'].rateLimited]);
  }
  assert.deepEqual(frames, [[6, 6, true], [12, 12, true], [18, 18, false], [18, 22, false], [18, 22, false]], JSON.stringify(frames));
});

test('R24D.1 without a clock the bound alone applies - the behaviour every earlier measurement was taken against', () => {
  const r = rig(); const runtime = createBoundedShieldArmAdditiveRuntime();
  const report = runtime.update({ rig: r, authoredDelta: authored(60, 60), sequence: 1, enabled: true });
  assert.ok(Math.abs(angleDegrees(r.bones['upperarm.l'].quaternion) - 18) < 1e-6);
  assert.equal(report.bones['upperarm.l'].rateLimited, false);
  const controller = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
  // Composition: the lab's controller hands the additive its frame.
  assert.match(controller, /enabled: Boolean\(activeIntentPlan\),\n\s*deltaSeconds, \/\/ R24D\.1/);
});

class Q { constructor(x = 0, y = 0, z = 0, w = 1) { this.set(x, y, z, w); } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } clone() { return new Q(this.x, this.y, this.z, this.w); } copy(o) { return this.set(o.x, o.y, o.z, o.w); } normalize() { const n = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= n; this.y /= n; this.z /= n; this.w /= n; return this; } slerp(o, a) { return this.set(this.x + (o.x - this.x) * a, this.y + (o.y - this.y) * a, this.z + (o.z - this.z) * a, this.w + (o.w - this.w) * a).normalize(); } }

test('R24D.1 the hips translation the clip animates is eased in on the entry blend, like the rotations', () => {
  const names = ['spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hips'];
  const bones = Object.fromEntries(names.map((n) => [n, { quaternion: new Q(), position: { x: 0, y: 0.30, z: 0 } }]));
  const character = { rig: { bones }, sampleAnimation() { bones.hips.position.y = 0.25; bones.hips.position.z = 0.04; }, getAnimationDuration() { return 1; }, update() {} };
  const runtime = createPredictiveInterceptParryPresentationRuntime({ Quaternion: Q }, { character, guardOffsets: {} });
  assert.equal(runtime.start({ sequence: 1, requestedGrade: 'parry', triggerTtcSeconds: 0.12 }).accepted, true);
  const first = runtime.update({ deltaSeconds: 1 / 60, timeToContactSeconds: 0.11 });
  const alpha = first.entryBlendProgress;
  assert.ok(alpha > 0 && alpha < 1);
  assert.ok(Math.abs(bones.hips.position.y - (0.30 + (0.25 - 0.30) * alpha)) < 1e-9, `hips y eased, got ${bones.hips.position.y} at alpha ${alpha}`);
  assert.ok(Math.abs(bones.hips.position.z - 0.04 * alpha) < 1e-9);
  for (let i = 0; i < 6; i += 1) runtime.update({ deltaSeconds: 1 / 60, timeToContactSeconds: 0.09 - i * 0.01 });
  assert.ok(Math.abs(bones.hips.position.y - 0.25) < 1e-9, 'and lands on the clip once the blend is done');
});

test('R24D.1 the active intercept\'s final closure is paced the same way, and yields to the clock: seven degrees a frame with time, its budget alone with three frames or fewer', () => {
  const calls = [];
  const surface = () => ({ center: { x: 0, y: 1, z: 0.5 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.26, thickness: 0.075 });
  const director = createParryInterceptDirector({
    trackingRuntime: { update() { return {}; }, refineMeasuredContact() { return {}; }, refineWorldTarget(target, options) { calls.push(options); return { achievedDistance: 0 }; } },
    bodyReachRuntime: { update() { return {}; }, trackWorldTarget() { return {}; }, reset() {} },
    stanceRuntime: { update() { return {}; }, reset() {} },
    readShieldSurface: surface,
  });
  const activeIntent = { plan: { mode: 'parry' }, targetCenter: { x: 0.2, y: 1, z: 0.4 } };
  director.finalClosure({ activeIntent, deltaSeconds: 1 / 60, timeToContactSeconds: 0.12 });
  assert.deepEqual(calls[0], { jointBudgetScale: 0.6, iterations: 2, paceDegreesPerSecond: 420, deltaSeconds: 1 / 60, timeToContactSeconds: 0.12 });
  director.finalClosure({ activeIntent });
  assert.deepEqual(calls[1], { jointBudgetScale: 0.6, iterations: 2 }, 'no clock, no pace - the harness every earlier measurement used');
  const tracking = readFileSync(new URL('../src/combat/guard-threat-tracking.js', import.meta.url), 'utf8');
  // Composition: the pace caps each joint's budget inside the solve, and yields to the clock.
  assert.match(tracking, /const lowerBudget = stepDegrees\['lowerarm\.l'\];/);
  assert.match(tracking, /framesToContact <= 3\n\s*\? budget\n\s*: Math\.min\(budget, Math\.max\(paceDegreesPerSecond \* paceDeltaSeconds, \(3 \* budget\) \/ framesToContact\)\)/);
});

test('R24D.1 the primary parry tracking is paced too - the arm is paced whoever drives it', () => {
  const updates = [];
  const surface = () => ({ center: { x: 0, y: 1, z: 0.5 }, normal: { x: 0, y: 0, z: 1 }, radius: 0.26, thickness: 0.075 });
  const director = createParryInterceptDirector({
    trackingRuntime: { update(plan, dt, options) { updates.push({ dt, options }); return { achievedDistance: 0.02, carriedResidualOffset: { x: 0, y: 0, z: 0 } }; }, refineMeasuredContact() { return { achievedDistance: 0 }; }, refineWorldTarget() { return { achievedDistance: 0 }; }, get offset() { return { x: 0, y: 0, z: 0 }; } },
    bodyReachRuntime: { update() { return { armExtensionRatio: 0 }; }, trackWorldTarget() { return { armExtensionRatio: 0 }; }, reset() {} },
    stanceRuntime: { update() { return { crouchMeters: 0 }; }, reset() {} },
    readShieldSurface: surface,
  });
  const blade = [{ x: 0, y: 1, z: -1 }, { x: 0, y: 1.2, z: -1.4 }, { x: 0, y: 1.4, z: -1.8 }];
  director.reach({ previousBlade: blade, currentBlade: blade, deltaSeconds: 1 / 60, continuitySurface: surface(), predictiveAnalysis: { timeToContactSeconds: 0.1, threat: null, trackingPlan: null }, activeIntent: null });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].options, { paceDegreesPerSecond: 420, timeToContactSeconds: 0.1 });
  const tracking = readFileSync(new URL('../src/combat/guard-threat-tracking.js', import.meta.url), 'utf8');
  // Composition: the paced step is what the solve spends, in place of the raw per-frame budget.
  assert.match(tracking, /const lowerRemaining = Math\.max\(0, lowerArmStepDegrees - appliedDegrees\['lowerarm\.l'\]\);/);
});
