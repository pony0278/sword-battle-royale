import {
  applyMountCalibration,
  normalizeMountCalibration,
} from './character-sockets.js';

export const OFFHAND_BUCKLER_STAGE = 'G4.2.2';
export const BUCKLER_CALIBRATION_STAGE = 'G4.2.3';
export const OFFHAND_SOCKET_ID = 'HAND_L';

export const DEFAULT_OFFHAND_BUCKLER_MOUNT = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0.035 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 1, y: 1, z: 1 }),
});

export const DEFAULT_BUCKLER_STYLE = Object.freeze({
  faceColor: 0x354a63,
  rimColor: 0xaab8c8,
  bossColor: 0xd7e0ea,
  debugColor: 0x62e7c6,
  lineColor: 0xf7fbff,
  lineGlowColor: 0x39c7ff,
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampParryRadius(value, visualRadius) {
  return Math.max(visualRadius, finitePositive(value, visualRadius + 0.02));
}

function cloneMount(input = DEFAULT_OFFHAND_BUCKLER_MOUNT) {
  const normalized = normalizeMountCalibration(input);
  return Object.freeze({
    position: Object.freeze({ ...normalized.position }),
    rotation: Object.freeze({ ...normalized.rotation }),
    scale: Object.freeze({ ...normalized.scale }),
  });
}

export function createBucklerDefinition(input = {}) {
  const radius = finitePositive(input.radius, 0.24);
  const thickness = finitePositive(input.thickness, 0.055);
  const explicitParryRadius = Number(input.parryRadius);
  const parryPadding = Math.max(0, Number(input.parryPadding) || 0.02);
  const parryRadius = Number.isFinite(explicitParryRadius)
    ? clampParryRadius(explicitParryRadius, radius)
    : radius + parryPadding;
  return Object.freeze({
    stage: OFFHAND_BUCKLER_STAGE,
    id: 'offhand_buckler_round_v1',
    equipmentType: 'buckler',
    socketId: OFFHAND_SOCKET_ID,
    radius,
    thickness,
    rimTube: finitePositive(input.rimTube, 0.018),
    bossRadius: finitePositive(input.bossRadius, 0.075),
    bossDepth: finitePositive(input.bossDepth, 0.035),
    parrySurface: Object.freeze({
      shape: 'oriented-disc',
      localCenter: Object.freeze([0, 0, thickness * 0.5]),
      localNormal: Object.freeze([0, 0, 1]),
      visualRadius: radius,
      radius: parryRadius,
      thickness: finitePositive(input.parryThickness, 0.075),
      gameplayPadding: Math.max(0, parryRadius - radius),
      authority: 'authoring surface only; G4.3A owns swept sword contact',
    }),
  });
}

function requireThree(THREE) {
  const required = [
    'Group', 'Mesh', 'CylinderGeometry', 'TorusGeometry', 'SphereGeometry',
    'MeshStandardMaterial', 'MeshBasicMaterial', 'LineSegments', 'BufferGeometry',
    'Float32BufferAttribute', 'LineBasicMaterial', 'Vector3', 'Quaternion',
  ];
  const missing = required.filter((name) => !THREE?.[name]);
  if (missing.length) throw new Error(`G4.2.3 Buckler calibration requires THREE: ${missing.join(', ')}`);
}

function style(input = {}) {
  return { ...DEFAULT_BUCKLER_STYLE, ...input };
}

function appendSegment(values, ax, ay, az, bx, by, bz) {
  values.push(ax, ay, az, bx, by, bz);
}

function createBucklerLineGeometry(THREE, definition) {
  const values = [];
  const segments = 32;
  const zFront = definition.thickness * 0.5;
  const zBack = -definition.thickness * 0.5;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    const ax = Math.cos(a) * definition.radius;
    const ay = Math.sin(a) * definition.radius;
    const bx = Math.cos(b) * definition.radius;
    const by = Math.sin(b) * definition.radius;
    appendSegment(values, ax, ay, zFront, bx, by, zFront);
    appendSegment(values, ax, ay, zBack, bx, by, zBack);
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle) * definition.radius;
    const y = Math.sin(angle) * definition.radius;
    appendSegment(values, 0, 0, zFront, x, y, zFront);
  }
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const x = Math.cos(angle) * definition.radius;
    const y = Math.sin(angle) * definition.radius;
    appendSegment(values, x, y, zBack, x, y, zFront);
  }
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const b = ((i + 1) / 20) * Math.PI * 2;
    appendSegment(
      values,
      Math.cos(a) * definition.bossRadius,
      Math.sin(a) * definition.bossRadius,
      zFront + definition.bossDepth * 0.45,
      Math.cos(b) * definition.bossRadius,
      Math.sin(b) * definition.bossRadius,
      zFront + definition.bossDepth * 0.45,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

export function createProceduralBuckler(THREE, options = {}) {
  requireThree(THREE);
  let definition = createBucklerDefinition(options.definition || options);
  const visualStyle = style(options.style);
  const object3d = new THREE.Group();
  object3d.name = 'OFFHAND_BUCKLER';
  object3d.userData.equipmentType = definition.equipmentType;
  object3d.userData.equipmentStage = OFFHAND_BUCKLER_STAGE;
  object3d.userData.definitionId = definition.id;

  const solidRoot = new THREE.Group();
  solidRoot.name = 'BUCKLER_SOLID_ROOT';
  object3d.add(solidRoot);

  const faceGeometry = new THREE.CylinderGeometry(
    definition.radius,
    definition.radius,
    definition.thickness,
    24,
    1,
    false,
  );
  faceGeometry.rotateX(Math.PI * 0.5);
  const face = new THREE.Mesh(
    faceGeometry,
    new THREE.MeshStandardMaterial({ color: visualStyle.faceColor, roughness: 0.68, metalness: 0.32 }),
  );
  face.name = 'BUCKLER_FACE';
  solidRoot.add(face);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(
      Math.max(0.01, definition.radius - definition.rimTube * 0.8),
      definition.rimTube,
      8,
      32,
    ),
    new THREE.MeshStandardMaterial({ color: visualStyle.rimColor, roughness: 0.38, metalness: 0.72 }),
  );
  rim.name = 'BUCKLER_RIM';
  rim.position.z = definition.thickness * 0.5 + definition.rimTube * 0.2;
  solidRoot.add(rim);

  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(definition.bossRadius, 16, 10),
    new THREE.MeshStandardMaterial({ color: visualStyle.bossColor, roughness: 0.32, metalness: 0.78 }),
  );
  boss.name = 'BUCKLER_BOSS';
  boss.scale.set(1, 1, 0.48);
  boss.position.z = definition.thickness * 0.5 + definition.bossDepth * 0.55;
  solidRoot.add(boss);

  const lineRoot = new THREE.Group();
  lineRoot.name = 'BUCKLER_LINE_ROOT';
  object3d.add(lineRoot);
  const lineGeometry = createBucklerLineGeometry(THREE, definition);
  const outline = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: visualStyle.lineColor, transparent: true, opacity: 0.96, depthWrite: false }),
  );
  outline.name = 'BUCKLER_LINE_OUTLINE';
  outline.frustumCulled = false;
  lineRoot.add(outline);
  const glow = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: visualStyle.lineGlowColor, transparent: true, opacity: 0.24, depthWrite: false }),
  );
  glow.name = 'BUCKLER_LINE_GLOW';
  glow.frustumCulled = false;
  glow.scale.setScalar(1.015);
  lineRoot.add(glow);

  const parryAnchor = new THREE.Group();
  parryAnchor.name = 'BUCKLER_PARRY_SURFACE';
  parryAnchor.position.fromArray(definition.parrySurface.localCenter);
  object3d.add(parryAnchor);

  const debugGeometry = new THREE.CylinderGeometry(
    definition.parrySurface.radius,
    definition.parrySurface.radius,
    0.006,
    32,
    1,
    false,
  );
  debugGeometry.rotateX(Math.PI * 0.5);
  const debugSurface = new THREE.Mesh(
    debugGeometry,
    new THREE.MeshBasicMaterial({
      color: visualStyle.debugColor,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  debugSurface.name = 'BUCKLER_PARRY_SURFACE_DEBUG';
  debugSurface.visible = false;
  parryAnchor.add(debugSurface);

  const normalLineGeometry = new THREE.BufferGeometry();
  normalLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 0, 0.32,
  ], 3));
  const normalLine = new THREE.LineSegments(
    normalLineGeometry,
    new THREE.LineBasicMaterial({ color: visualStyle.debugColor, transparent: true, opacity: 0.9 }),
  );
  normalLine.name = 'BUCKLER_NORMAL_DEBUG';
  normalLine.visible = false;
  parryAnchor.add(normalLine);

  let currentMount = cloneMount(DEFAULT_OFFHAND_BUCKLER_MOUNT);
  let lineMode = options.lineMode !== false;
  let solidVisible = options.solidVisible === true;
  solidRoot.visible = solidVisible;
  lineRoot.visible = lineMode;

  const worldCenter = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();

  function setMountCalibration(calibration = DEFAULT_OFFHAND_BUCKLER_MOUNT) {
    currentMount = cloneMount(calibration);
    applyMountCalibration(object3d, currentMount);
    return currentMount;
  }

  function getMountCalibration() {
    return cloneMount(currentMount);
  }

  function setLineMode(value) {
    lineMode = Boolean(value);
    lineRoot.visible = lineMode;
    return lineMode;
  }

  function setSolidVisible(value) {
    solidVisible = Boolean(value);
    solidRoot.visible = solidVisible;
    return solidVisible;
  }

  function setParrySurfaceVisible(value) {
    const visible = Boolean(value);
    debugSurface.visible = visible;
    normalLine.visible = visible;
    return visible;
  }

  function getWorldParrySurface() {
    parryAnchor.updateWorldMatrix?.(true, false);
    parryAnchor.getWorldPosition(worldCenter);
    parryAnchor.getWorldQuaternion(worldQuaternion);
    worldNormal.set(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
    return Object.freeze({
      stage: OFFHAND_BUCKLER_STAGE,
      shape: definition.parrySurface.shape,
      center: Object.freeze({ x: worldCenter.x, y: worldCenter.y, z: worldCenter.z }),
      normal: Object.freeze({ x: worldNormal.x, y: worldNormal.y, z: worldNormal.z }),
      radius: definition.parrySurface.radius,
      visualRadius: definition.parrySurface.visualRadius,
      thickness: definition.parrySurface.thickness,
      authority: definition.parrySurface.authority,
    });
  }

  function exportCalibration() {
    const mount = getMountCalibration();
    const toDegrees = (radians) => radians * 180 / Math.PI;
    return Object.freeze({
      stage: BUCKLER_CALIBRATION_STAGE,
      equipmentStage: OFFHAND_BUCKLER_STAGE,
      socketId: OFFHAND_SOCKET_ID,
      socketLocked: true,
      mount: Object.freeze({
        position: mount.position,
        rotationRadians: mount.rotation,
        rotationDegrees: Object.freeze({
          x: toDegrees(mount.rotation.x),
          y: toDegrees(mount.rotation.y),
          z: toDegrees(mount.rotation.z),
        }),
        scale: mount.scale,
      }),
      buckler: Object.freeze({
        radius: definition.radius,
        thickness: definition.thickness,
        parryRadius: definition.parrySurface.radius,
        parryThickness: definition.parrySurface.thickness,
      }),
      display: Object.freeze({ lineMode, solidVisible }),
    });
  }

  return Object.freeze({
    id: definition.id,
    stage: OFFHAND_BUCKLER_STAGE,
    get definition() { return definition; },
    object3d,
    face,
    rim,
    boss,
    solidRoot,
    lineRoot,
    outline,
    glow,
    parryAnchor,
    debugSurface,
    normalLine,
    setMountCalibration,
    getMountCalibration,
    setLineMode,
    setSolidVisible,
    setParrySurfaceVisible,
    getWorldParrySurface,
    exportCalibration,
  });
}

export function mountOffhandBuckler(character, buckler, calibration = DEFAULT_OFFHAND_BUCKLER_MOUNT) {
  if (!character?.attach) throw new Error('G4.2.2 Buckler mount requires an equipment-capable character');
  if (!buckler?.object3d) throw new Error('G4.2.2 Buckler mount requires a procedural buckler');
  const normalized = buckler.setMountCalibration?.(calibration) || cloneMount(calibration);
  character.attach(OFFHAND_SOCKET_ID, buckler.object3d, normalized);
  buckler.object3d.userData.offhandRole = 'parry-buckler';
  buckler.object3d.userData.socketLocked = true;
  return buckler;
}
