import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKLER_CALIBRATION_STAGE,
  DEFAULT_OFFHAND_BUCKLER_MOUNT,
  OFFHAND_BUCKLER_STAGE,
  OFFHAND_SOCKET_ID,
  createBucklerDefinition,
  mountOffhandBuckler,
} from '../src/character/offhand-buckler.js';

test('G4.2.2 defines a compact HAND_L buckler with a slightly forgiving parry disc', () => {
  const definition = createBucklerDefinition();
  assert.equal(definition.stage, OFFHAND_BUCKLER_STAGE);
  assert.equal(OFFHAND_BUCKLER_STAGE, 'G4.2.2');
  assert.equal(definition.socketId, 'HAND_L');
  assert.equal(definition.equipmentType, 'buckler');
  assert.equal(definition.radius, 0.24);
  assert.equal(definition.thickness, 0.055);
  assert.equal(definition.parrySurface.shape, 'oriented-disc');
  assert.deepEqual(definition.parrySurface.localNormal, [0, 0, 1]);
  assert.equal(definition.parrySurface.visualRadius, 0.24);
  assert.equal(definition.parrySurface.radius, 0.26);
  assert.ok(definition.parrySurface.radius > definition.parrySurface.visualRadius);
  assert.match(definition.parrySurface.authority, /G4\.3A/);
});

test('G4.2.3 keeps calibration as a new authoring stage without rewriting the G4.2.2 equipment contract', () => {
  assert.equal(BUCKLER_CALIBRATION_STAGE, 'G4.2.3');
  assert.equal(OFFHAND_BUCKLER_STAGE, 'G4.2.2');
  assert.equal(OFFHAND_SOCKET_ID, 'HAND_L');
});

test('G4.2.2 normalizes custom buckler dimensions without changing the parry-surface contract', () => {
  const definition = createBucklerDefinition({
    radius: 0.3,
    thickness: 0.08,
    parryPadding: 0.03,
    parryThickness: 0.09,
  });
  assert.equal(definition.radius, 0.3);
  assert.equal(definition.thickness, 0.08);
  assert.deepEqual(definition.parrySurface.localCenter, [0, 0, 0.04]);
  assert.ok(Math.abs(definition.parrySurface.radius - 0.33) < Number.EPSILON);
  assert.equal(definition.parrySurface.thickness, 0.09);
});

test('G4.2.3 accepts an explicit parry radius while never allowing it inside the visible shield', () => {
  const expanded = createBucklerDefinition({ radius: 0.24, parryRadius: 0.31 });
  assert.equal(expanded.parrySurface.radius, 0.31);
  assert.equal(expanded.parrySurface.gameplayPadding, 0.07);

  const clamped = createBucklerDefinition({ radius: 0.24, parryRadius: 0.1 });
  assert.equal(clamped.parrySurface.radius, 0.24);
  assert.equal(clamped.parrySurface.gameplayPadding, 0);
});

test('G4.2.2 mounts the buckler through the existing HAND_L equipment socket', () => {
  const calls = [];
  const object3d = { userData: {} };
  const buckler = { object3d };
  const character = {
    attach(socketId, object, calibration) {
      calls.push({ socketId, object, calibration });
      object.userData.attachedSocket = socketId;
      return object;
    },
  };
  const result = mountOffhandBuckler(character, buckler);
  assert.equal(result, buckler);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].socketId, OFFHAND_SOCKET_ID);
  assert.equal(calls[0].object, object3d);
  assert.deepEqual(calls[0].calibration, DEFAULT_OFFHAND_BUCKLER_MOUNT);
  assert.equal(object3d.userData.attachedSocket, 'HAND_L');
  assert.equal(object3d.userData.offhandRole, 'parry-buckler');
  assert.equal(object3d.userData.socketLocked, true);
});

test('G4.2.3 routes calibration to the Buckler object while keeping HAND_L as the immutable anchor', () => {
  const calls = [];
  const calibration = {
    position: { x: 0.05, y: -0.02, z: 0.08 },
    rotation: { x: 0.1, y: 0.2, z: -0.3 },
    scale: { x: 1, y: 1, z: 1 },
  };
  const object3d = { userData: {} };
  const buckler = {
    object3d,
    setMountCalibration(value) {
      calls.push({ type: 'buckler-calibration', value });
      return value;
    },
  };
  const character = {
    attach(socketId, object, value) {
      calls.push({ type: 'attach', socketId, object, value });
      object.userData.attachedSocket = socketId;
      return object;
    },
  };

  mountOffhandBuckler(character, buckler, calibration);

  assert.equal(calls[0].type, 'buckler-calibration');
  assert.equal(calls[1].type, 'attach');
  assert.equal(calls[1].socketId, 'HAND_L');
  assert.equal(calls[1].object, object3d);
  assert.equal(calls[1].value, calibration);
  assert.equal(object3d.userData.socketLocked, true);
});

test('G4.2.2 keeps the default mount centered on the hand and offsets only toward the shield face', () => {
  assert.deepEqual(DEFAULT_OFFHAND_BUCKLER_MOUNT.position, { x: 0, y: 0, z: 0.035 });
  assert.deepEqual(DEFAULT_OFFHAND_BUCKLER_MOUNT.rotation, { x: 0, y: 0, z: 0 });
  assert.deepEqual(DEFAULT_OFFHAND_BUCKLER_MOUNT.scale, { x: 1, y: 1, z: 1 });
});
