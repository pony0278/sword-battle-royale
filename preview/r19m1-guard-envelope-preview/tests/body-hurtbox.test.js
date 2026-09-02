import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BODY_HURTBOX_BANDS,
  BODY_HURTBOX_STAGE,
  buildBodyHurtbox,
  probeBodyHurtboxContact,
} from '../src/combat/body-hurtbox.js';

// A fighter standing at the origin, facing +z toward an attacker.
const BONES = Object.freeze({
  head: { x: 0, y: 1.62, z: 0 },
  chest: { x: 0, y: 1.30, z: 0 },
  spine: { x: 0, y: 1.10, z: 0 }, // R23N.1: the belly band's bone
  hips: { x: 0, y: 0.92, z: 0 },
  'lowerleg.l': { x: 0.17, y: 0.48, z: 0 },
  'lowerleg.r': { x: -0.17, y: 0.46, z: 0 },
});
const readBonePosition = (id) => BONES[id] ?? null;
const hurtbox = buildBodyHurtbox({ readBonePosition, facing: { x: 0, y: 0, z: 1 } });

// A blade sweeping from in front of the fighter to behind them, at a given height and offset.
function sweepAt(y, x = 0) {
  const blade = (z) => [
    { x: x - 0.35, y, z },
    { x, y, z },
    { x: x + 0.35, y, z },
  ];
  return { previousBlade: blade(0.6), currentBlade: blade(-0.6) };
}

test('R18U.1 the body is built from the rig, so it moves with the fighter', () => {
  assert.equal(BODY_HURTBOX_STAGE, 'R23N.1');
  assert.equal(hurtbox.discs.length, BODY_HURTBOX_BANDS.length);
  assert.deepEqual(hurtbox.discs.map((d) => d.id), ['head', 'chest', 'belly', 'waist', 'knees']);
  // The chest band sits on the chest bone, not at an authored height over a root.
  const chest = hurtbox.discs.find((d) => d.id === 'chest');
  assert.equal(chest.center.y, BONES.chest.y);
  // The knee band has no single bone at that height, so it sits between the pair.
  const knees = hurtbox.discs.find((d) => d.id === 'knees');
  assert.ok(Math.abs(knees.center.y - 0.47) < 1e-9);
  assert.ok(Math.abs(knees.center.x) < 1e-9);

  // A crouched fighter is hit lower, with no change to the module.
  const crouched = buildBodyHurtbox({
    readBonePosition: (id) => (BONES[id] ? { ...BONES[id], y: BONES[id].y - 0.15 } : null),
    facing: { x: 0, y: 0, z: 1 },
  });
  assert.ok(Math.abs(crouched.discs.find((d) => d.id === 'chest').center.y - (BONES.chest.y - 0.15)) < 1e-9);
});

test('R18U.1 the bands face the attacker on the horizontal plane, never tilted', () => {
  const fromAbove = buildBodyHurtbox({ readBonePosition, facing: { x: 0, y: 9, z: 1 } });
  // A body does not tilt to meet a blade coming down at it.
  assert.equal(fromAbove.facing.y, 0);
  assert.ok(Math.abs(fromAbove.facing.z - 1) < 1e-9);
  const fromSide = buildBodyHurtbox({ readBonePosition, facing: { x: 3, y: 0, z: 0 } });
  assert.ok(Math.abs(fromSide.facing.x - 1) < 1e-9);
  // A facing that says nothing falls back rather than producing a degenerate disc.
  const degenerate = buildBodyHurtbox({ readBonePosition, facing: { x: 0, y: 1, z: 0 } });
  assert.ok(Math.abs(degenerate.facing.z - 1) < 1e-9);
});

test('R18U.1 a blade through the body is a hit, and it names what it struck', () => {
  const chest = probeBodyHurtboxContact({ ...sweepAt(1.30), hurtbox, deltaSeconds: 1 / 60 });
  assert.equal(chest.contact, true);
  assert.equal(chest.band, 'chest');
  assert.equal(chest.gapMeters, 0);
  assert.match(chest.reason, /struck-body/);

  const knees = probeBodyHurtboxContact({ ...sweepAt(0.47), hurtbox, deltaSeconds: 1 / 60 });
  assert.equal(knees.contact, true);
  assert.equal(knees.band, 'knees');
});

test('R18U.1 a blade past the body is a miss that still reports how close it came', () => {
  // Well above the head.
  const overhead = probeBodyHurtboxContact({ ...sweepAt(2.4), hurtbox, deltaSeconds: 1 / 60 });
  assert.equal(overhead.contact, false);
  assert.equal(overhead.band, 'head', 'the nearest band is still named');
  assert.ok(overhead.gapMeters > 0.5);

  // Beside the body at chest height.
  const wide = probeBodyHurtboxContact({ ...sweepAt(1.30, 1.6), hurtbox, deltaSeconds: 1 / 60 });
  assert.equal(wide.contact, false);
  assert.ok(wide.gapMeters > 0.5);
});

test('R18U.1 no geometry is a miss, not a crash and not a hit', () => {
  assert.equal(buildBodyHurtbox({}), null);
  assert.equal(buildBodyHurtbox({ readBonePosition: () => null }), null);
  const none = probeBodyHurtboxContact({ ...sweepAt(1.3), hurtbox: null, deltaSeconds: 1 / 60 });
  assert.equal(none.contact, false);
  assert.equal(none.reason, 'no-hurtbox-geometry');
});

test('R18U.1 the shield is asked first, always', async () => {
  const lifecycle = await readFile(
    new URL('../src/combat/contact-lifecycle-director.js', import.meta.url),
    'utf8',
  );
  const resolve = lifecycle.slice(
    lifecycle.indexOf('function resolveContact('),
    lifecycle.indexOf('function advanceCombat('),
  );
  const shield = resolve.indexOf('let contactEvaluation = evaluateSweptContactTemporalEligibility({');
  const body = resolve.indexOf('probeBodyHurtboxContact({');
  assert.ok(shield >= 0 && body > shield, 'a blade the guard caught never reaches the body');
  // The body is only offered the sweep inside the branch where the shield was not there.
  const missBranch = resolve.slice(resolve.indexOf('if (!contactEvaluation.contact) {'), body);
  assert.ok(missBranch.length > 0 && !missBranch.includes('gripConstraint.start'));
  assert.match(resolve, /bodyHit = nearerBodyReading\(bodyHit, bodyContact\);/);
});
