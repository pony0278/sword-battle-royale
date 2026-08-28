import { createBlockSpec } from './block-spec.js';

function material(THREE, color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.65,
    metalness: options.metalness ?? 0.02,
    flatShading: options.flatShading ?? true,
  });
}

function box(THREE, width, height, depth, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(THREE, color));
}

function joint(THREE, radius, color) {
  return new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material(THREE, color));
}

function buildArm(THREE, spine, spec, side, colors) {
  const key = side < 0 ? 'L' : 'R';
  const lengthMultiplier = key === 'L' ? spec.armLenL : spec.armLenR;
  const upperLength = spec.armUpper * lengthMultiplier;
  const lowerLength = spec.armLower * lengthMultiplier;
  const thickness = spec.armThick;

  const shoulder = new THREE.Group();
  shoulder.name = `SHOULDER_${key}`;
  shoulder.position.set(side * (spec.bodyW / 2 + 0.04), spec.bodyH - spec.shoulderDrop, 0);
  spine.add(shoulder);
  const shoulderMesh = joint(THREE, 0.16 * thickness, colors.cloth);
  shoulderMesh.scale.set(1.08, 0.82, 1);
  shoulder.add(shoulderMesh);
  const upperArm = box(THREE, 0.24 * thickness, upperLength, 0.26 * thickness, colors.cloth);
  upperArm.position.y = -upperLength / 2;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.name = `ELBOW_${key}`;
  elbow.position.y = -upperLength;
  shoulder.add(elbow);
  elbow.add(joint(THREE, 0.13 * thickness, colors.joint));
  const forearm = box(THREE, 0.22 * thickness, lowerLength, 0.24 * thickness, colors.cloth);
  forearm.position.y = -lowerLength / 2;
  elbow.add(forearm);

  const wrist = new THREE.Group();
  wrist.name = `WRIST_${key}`;
  wrist.position.y = -lowerLength;
  elbow.add(wrist);
  const cuff = box(THREE, 0.27 * thickness, 0.10, 0.29 * thickness, colors.cuff);
  wrist.add(cuff);
  const hand = box(THREE, 0.42 * spec.fist, 0.40 * spec.fist, 0.46 * spec.fist, colors.skin);
  hand.name = `HAND_MESH_${key}`;
  hand.position.set(0, -0.18 * spec.fist, 0.02);
  wrist.add(hand);

  return { side, shoulder, elbow, wrist, upperArm, forearm, hand };
}

function buildLeg(THREE, pelvis, spec, side, hipY, colors) {
  const key = side < 0 ? 'L' : 'R';
  const thickness = spec.legThick;

  const hip = new THREE.Group();
  hip.name = `HIP_${key}`;
  hip.position.set(side * spec.legSpread, hipY, 0);
  pelvis.add(hip);
  const thigh = box(THREE, 0.28 * thickness, spec.legUpper, 0.30 * thickness, colors.pants);
  thigh.position.y = -spec.legUpper / 2;
  hip.add(thigh);

  const knee = new THREE.Group();
  knee.name = `KNEE_${key}`;
  knee.position.y = -spec.legUpper;
  hip.add(knee);
  knee.add(joint(THREE, 0.13 * thickness, colors.joint));
  const shin = box(THREE, 0.25 * thickness, spec.legLower, 0.27 * thickness, colors.pants);
  shin.position.y = -spec.legLower / 2;
  knee.add(shin);

  const ankle = new THREE.Group();
  ankle.name = `ANKLE_${key}`;
  ankle.position.y = -spec.legLower;
  knee.add(ankle);
  const foot = box(THREE, 0.36 * spec.shoe, 0.20 * spec.shoe, 0.52 * spec.shoe, colors.shoe);
  foot.name = `FOOT_${key}`;
  foot.position.set(0, -0.07 * spec.shoe, 0.11);
  ankle.add(foot);
  const toe = box(THREE, 0.30 * spec.shoe, 0.10, 0.08, colors.accent);
  toe.position.set(0, -0.07 * spec.shoe, 0.11 + 0.25 * spec.shoe);
  ankle.add(toe);

  return { side, hip, knee, ankle, thigh, shin, foot };
}

export function createBlockRig(THREE, options = {}) {
  if (!THREE?.Group || !THREE?.Mesh) throw new Error('createBlockRig requires a Three.js-compatible namespace');
  const spec = createBlockSpec(options.spec);
  const colors = {
    cloth: options.colors?.cloth ?? 0x3763d8,
    pants: options.colors?.pants ?? 0x253463,
    cuff: options.colors?.cuff ?? 0xf0f2ff,
    skin: options.colors?.skin ?? 0xe2b986,
    shoe: options.colors?.shoe ?? 0x121622,
    joint: options.colors?.joint ?? 0x244aa8,
    accent: options.colors?.accent ?? 0x55e6c1,
  };
  const hipY = spec.legUpper + spec.legLower;
  const bodyTop = hipY + spec.bodyH;

  const root = new THREE.Group();
  root.name = 'ROOT';
  const pelvis = new THREE.Group();
  pelvis.name = 'PELVIS';
  root.add(pelvis);
  const spine = new THREE.Group();
  spine.name = 'SPINE';
  spine.position.y = hipY;
  root.add(spine);

  const body = new THREE.Group();
  body.name = 'BODY_MESH';
  body.position.y = spec.bodyH / 2;
  const torso = box(THREE, spec.bodyW, spec.bodyH, spec.bodyD, colors.cloth);
  body.add(torso);
  const chest = box(THREE, spec.bodyW * 0.46, spec.bodyH * 0.14, spec.bodyD * 1.03, colors.accent);
  chest.position.set(0, spec.bodyH * 0.14, 0.01);
  body.add(chest);
  spine.add(body);

  const headPivot = new THREE.Group();
  headPivot.name = 'HEAD';
  headPivot.position.y = spec.bodyH;
  spine.add(headPivot);
  const head = box(THREE, spec.headSize, spec.headSize, spec.headSize * 0.86, colors.skin);
  head.position.y = spec.headSize / 2;
  headPivot.add(head);
  const face = box(THREE, spec.headSize * 0.24, spec.headSize * 0.18, 0.05, colors.accent);
  face.position.set(0, spec.headSize * 0.54, spec.headSize * 0.46);
  headPivot.add(face);

  const arms = {
    L: buildArm(THREE, spine, spec, -1, colors),
    R: buildArm(THREE, spine, spec, 1, colors),
  };
  const legs = {
    L: buildLeg(THREE, pelvis, spec, -1, hipY, colors),
    R: buildLeg(THREE, pelvis, spec, 1, hipY, colors),
  };

  return {
    root,
    pelvis,
    spine,
    headPivot,
    spec,
    arms,
    legs,
    meshes: { body, torso, head },
    measurements: { hipY, bodyTop, baseY: 0 },
    joints: Object.freeze({
      ROOT: root,
      PELVIS: pelvis,
      SPINE: spine,
      HEAD: headPivot,
      SHOULDER_L: arms.L.shoulder,
      ELBOW_L: arms.L.elbow,
      WRIST_L: arms.L.wrist,
      SHOULDER_R: arms.R.shoulder,
      ELBOW_R: arms.R.elbow,
      WRIST_R: arms.R.wrist,
      HIP_L: legs.L.hip,
      KNEE_L: legs.L.knee,
      ANKLE_L: legs.L.ankle,
      HIP_R: legs.R.hip,
      KNEE_R: legs.R.knee,
      ANKLE_R: legs.R.ankle,
    }),
    groundBox: new THREE.Box3(),
  };
}

