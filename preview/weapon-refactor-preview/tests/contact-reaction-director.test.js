import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CONTACT_REACTION_DIRECTOR_STAGE,
  createContactReactionDirector,
  sanitizeIncomingVelocity,
} from '../src/combat/contact-reaction-director.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(other) { return this.set(other.x, other.y, other.z); }
}
class Quaternion {
  constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
}
const THREE = { Vector3, Quaternion };

function position() {
  return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
}
function bone(x, y, z) {
  const world = { x, y, z };
  return {
    world,
    position: position(),
    getWorldPosition(target) { return target.set(world.x, world.y, world.z); },
  };
}
function rig(offsetX) {
  return {
    bones: {
      hips: bone(offsetX, 0, 0),
      'hand.r': bone(offsetX, 1.2, 0),
      root: { position: position() },
    },
    root: { updateMatrixWorld() {} },
  };
}
function director() {
  const attackerRig = rig(2);
  const defenderRig = rig(0);
  return {
    attackerRig,
    defenderRig,
    subject: createContactReactionDirector(THREE, { attackerRig, defenderRig }),
  };
}
const FRAME = 1 / 60;

test('R18S.1 takes the actor axis from hips to hips, and falls back when it cannot', () => {
  assert.equal(CONTACT_REACTION_DIRECTOR_STAGE, 'R18S.1');
  const { subject } = director();
  assert.deepEqual(subject.backwardDirection({ fallbackDirection: null }), { x: 1, y: 0, z: 0 });

  const fallback = { x: 0, y: 0, z: -1 };
  const rigless = createContactReactionDirector(THREE, {});
  assert.equal(rigless.backwardDirection({ fallbackDirection: fallback }), fallback);
  assert.equal(rigless.backwardDirection(), null);
});

test('R18S.1 excitation keeps the peak of the sweep, not the last frame', () => {
  // By the release frame the grip constraint has parked the hand against the shield, so the
  // last frame is the one value that is certainly not the excitation.
  const { subject } = director();
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0, z: 0 } }, deltaSeconds: FRAME });
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0.05, z: 0 } }, deltaSeconds: FRAME });
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0.051, z: 0 } }, deltaSeconds: FRAME });
  assert.ok(Math.abs(subject.excitation.shieldSweepVelocity.y - 3) < 1e-9,
    'the 5cm frame is the peak, the 1mm frame that follows it is not');
});

test('R18S.1 excitation rejects a reading a rebuild or a teleport produced', () => {
  const { subject } = director();
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0, z: 0 } }, deltaSeconds: FRAME });
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 4, z: 0 } }, deltaSeconds: FRAME });
  assert.equal(subject.excitation.shieldSweepVelocity, null, '240 m/s is a bone jumping');

  assert.equal(sanitizeIncomingVelocity({ x: 0.01, y: 0, z: 0 }), null);
  assert.equal(sanitizeIncomingVelocity({ x: 40, y: 0, z: 0 }), null);
  assert.equal(sanitizeIncomingVelocity(null), null);
  const real = { x: -6, y: 0, z: 0 };
  assert.equal(sanitizeIncomingVelocity(real), real);
});

test('R18S.1 arms both actors off one axis, mirrored, and marks when the reaction starts', () => {
  const { subject } = director();
  const axis = { x: 1, y: 0, z: 0 };
  const blocked = subject.arm({
    outcome: 'block',
    backwardDirection: axis,
    contactPoint: { x: 1, y: 1, z: 0 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    incomingVelocity: { x: -6, y: 0, z: 0 },
  });
  const root = blocked.reports.rootDisplacement;
  assert.equal(root.outcome, 'block');
  assert.ok(root.attacker.peakMeters > 0 && root.defender.peakMeters > 0);
  assert.ok(root.defender.peakMeters !== root.attacker.peakMeters,
    'the defender absorbs, it does not take the same shove');
  // A held shield never takes the blade hostage, so a block has no DEFLECT_IMPULSE to wait for.
  assert.equal(root.startsAfterDeflectImpulse, false);
  assert.equal(blocked.reports.armFling.startsAfterDeflectImpulse ?? false, false);

  const { subject: parrying } = director();
  const parried = parrying.arm({
    outcome: 'parry',
    backwardDirection: axis,
    contactPoint: { x: 1, y: 1, z: 0 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    incomingVelocity: { x: -6, y: 0, z: 0 },
  });
  assert.equal(parried.reports.rootDisplacement.startsAfterDeflectImpulse, true);
});

test('R18S.1 with no axis the reaction has nothing to push along and says so', () => {
  const { subject } = director();
  const armed = subject.arm({
    outcome: 'parry',
    backwardDirection: null,
    contactPoint: { x: 1, y: 1, z: 0 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    incomingVelocity: { x: -6, y: 0, z: 0 },
  });
  assert.equal(armed.reports.torsoLean.accepted, false);
  assert.equal(armed.reports.rootDisplacement.defender, null);
  assert.equal(subject.defenderActive, false);
});

test('R18S.1 asks for a repaint exactly while a writer is still moving a bone', () => {
  // The line avatar is rebuilt inside the character's appearance update, which runs before these
  // writers. The repaint signal is the whole reason the avatar is not one authority behind.
  const { subject } = director();
  assert.equal(subject.advanceAttacker(16.7).repaintRequired, false);
  assert.equal(subject.advanceDefender(16.7).repaintRequired, false);

  subject.arm({
    outcome: 'block',
    backwardDirection: { x: 1, y: 0, z: 0 },
    contactPoint: { x: 1, y: 1, z: 0 },
    surfaceNormal: { x: 0, y: 0, z: 1 },
    incomingVelocity: { x: -6, y: 0, z: 0 },
  });
  assert.equal(subject.advanceAttacker(16.7).repaintRequired, true);
  assert.equal(subject.advanceDefender(16.7).repaintRequired, true);

  subject.settle();
  assert.equal(subject.attackerActive, false);
  assert.equal(subject.defenderActive, false);
  assert.equal(subject.advanceAttacker(16.7).repaintRequired, false);
});

test('R18S.1 reset drops the excitation, settle does not', () => {
  const { subject } = director();
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0, z: 0 } }, deltaSeconds: FRAME });
  subject.trackExcitation({ bucklerSurface: { center: { x: 0, y: 0.05, z: 0 } }, deltaSeconds: FRAME });
  assert.ok(subject.excitation.shieldSweepVelocity);
  subject.settle();
  assert.ok(subject.excitation.shieldSweepVelocity, 'settling the pose is not the end of the exchange');
  subject.reset();
  assert.equal(subject.excitation.shieldSweepVelocity, null);
});

test('R18S.1 owns the writer order, and it is a dependency order', async () => {
  const source = await readFile(new URL('../src/combat/contact-reaction-director.js', import.meta.url), 'utf8');
  const attackerStart = source.indexOf('function advanceAttacker(');
  const attackerEnd = source.indexOf('function advanceDefender(');
  const body = source.slice(attackerStart, attackerEnd);
  // The world-lean servo re-measures and corrects the torso, which moves the shoulder. The arm
  // fling then rewrites the arm from its own release-time base, replacing rather than stacking on
  // the presentation's arm aim. The root translates last, under both of them.
  const torso = body.indexOf('attackerTorsoLean.apply');
  const fling = body.indexOf('attackerArmFling.apply');
  const root = body.indexOf('attackerRootDisplacement.apply');
  assert.ok(torso >= 0 && fling > torso && root > fling, 'torso lean, then arm fling, then root');
  // Both roots run on this one clock; only the attacker's lands here, because the defender's
  // guard presentation has not rebuilt its pose yet this frame.
  assert.ok(body.includes('defenderRootDisplacement.advance('));
  assert.ok(!body.includes('defenderRootDisplacement.apply('));

  const defenderBody = source.slice(attackerEnd, source.indexOf('function settle('));
  assert.ok(defenderBody.includes('defenderRootDisplacement.apply('));
});

test('R18S.1 the lab wires the director and keeps no reaction runtime of its own', async () => {
  const controller = await readFile(
    new URL('../src/game/contact-handoff-controller.js', import.meta.url),
    'utf8',
  );
  assert.match(controller, /createContactReactionDirector/);
  // The orchestration is the thing that moved; the lab may not keep a private copy of it.
  for (const escaped of [
    'createParryArmFlingRuntime',
    'createParriedTorsoWorldLeanRuntime',
    'createParryRootDisplacementRuntime',
  ]) {
    assert.doesNotMatch(controller, new RegExp(escaped), `lab should not build ${escaped} itself`);
  }
  // What the lab keeps is its own: the repaint call, because that is a lab character API.
  assert.match(controller, /repaintRequired\) attacker\.update\(0, camera\)/);
  assert.match(controller, /repaintRequired\) defender\?\.update\?\.\(0, camera\)/);
});
