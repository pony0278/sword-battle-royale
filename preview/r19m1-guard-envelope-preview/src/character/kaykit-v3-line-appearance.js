export const DEFAULT_KAYKIT_V3_LINE_STYLE = Object.freeze({
  renderStyle: 'v3-rig-line',
  lineColor: 0x96e8ff,
  glowColor: 0x39c7ff,
  contourColor: 0x6fd6ff,
  headColor: 0x9be8ff,
  jointColor: 0xffdd7d,
  lineOpacity: 0.95,
  headOpacity: 0.98,
  glowOpacity: 0.22,
  contourOpacity: 0.76,
  jointOpacity: 0.88,
  jointRadius: 0.045,
  headScale: 1,
  headSides: 8,
  shoulderWidth: 1,
  pelvisWidth: 1,
  armOutset: 0.08,
  legOutset: 0.06,
});

const LIMB_PAIRS = Object.freeze([
  ['hips', 'spine'],
  ['spine', 'chest'],
  ['chest', 'head'],
  ['upperarm.l', 'lowerarm.l'],
  ['lowerarm.l', 'wrist.l'],
  ['wrist.l', 'hand.l'],
  ['upperarm.r', 'lowerarm.r'],
  ['lowerarm.r', 'wrist.r'],
  ['wrist.r', 'hand.r'],
  ['upperleg.l', 'lowerleg.l'],
  ['lowerleg.l', 'foot.l'],
  ['foot.l', 'toes.l'],
  ['upperleg.r', 'lowerleg.r'],
  ['lowerleg.r', 'foot.r'],
  ['foot.r', 'toes.r'],
]);

const JOINT_BONE_IDS = Object.freeze([
  'hips', 'spine', 'chest', 'head',
  'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l',
  'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r',
  'upperleg.l', 'lowerleg.l', 'foot.l',
  'upperleg.r', 'lowerleg.r', 'foot.r',
]);

function finiteOpacity(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

export function createKayKitV3LineStyle(input = {}) {
  return {
    ...DEFAULT_KAYKIT_V3_LINE_STYLE,
    ...input,
    renderStyle: 'v3-rig-line',
    lineOpacity: finiteOpacity(input.lineOpacity, DEFAULT_KAYKIT_V3_LINE_STYLE.lineOpacity),
    headOpacity: finiteOpacity(input.headOpacity, DEFAULT_KAYKIT_V3_LINE_STYLE.headOpacity),
    glowOpacity: finiteOpacity(input.glowOpacity, DEFAULT_KAYKIT_V3_LINE_STYLE.glowOpacity),
    contourOpacity: finiteOpacity(input.contourOpacity, DEFAULT_KAYKIT_V3_LINE_STYLE.contourOpacity),
    jointOpacity: finiteOpacity(input.jointOpacity, DEFAULT_KAYKIT_V3_LINE_STYLE.jointOpacity),
    jointRadius: Math.max(0.005, Number(input.jointRadius) || DEFAULT_KAYKIT_V3_LINE_STYLE.jointRadius),
    headSides: Math.max(3, Math.min(12, Math.round(Number(input.headSides) || DEFAULT_KAYKIT_V3_LINE_STYLE.headSides))),
  };
}

function lineMaterial(THREE, color, opacity, glow = false) {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  if (glow && THREE.AdditiveBlending != null) material.blending = THREE.AdditiveBlending;
  return material;
}

function makeSegments(THREE, segmentCount, color, opacity, name, glow = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  const line = new THREE.LineSegments(geometry, lineMaterial(THREE, color, opacity, glow));
  line.name = name;
  line.frustumCulled = false;
  line.userData.appearanceRole = glow ? 'rig-glow' : 'rig-line';
  return line;
}

function createJointNode(THREE, bone, style, scale) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(style.jointRadius * scale, 8, 6),
    new THREE.MeshBasicMaterial({
      color: style.jointColor,
      transparent: true,
      opacity: style.jointOpacity,
      depthWrite: false,
    }),
  );
  mesh.name = `RIG_NODE_${bone.name}`;
  mesh.userData.appearanceRole = 'rig-node';
  mesh.renderOrder = 2;
  bone.add(mesh);
  return mesh;
}

function setPoint(attribute, index, point) {
  attribute.setXYZ(index, point.x, point.y, point.z);
}

export function canCreateKayKitV3LineAppearance(THREE) {
  return Boolean(
    THREE?.LineSegments
    && THREE?.BufferGeometry
    && THREE?.BufferAttribute
    && THREE?.LineBasicMaterial
    && THREE?.MeshBasicMaterial
    && THREE?.SphereGeometry
    && THREE?.Vector3,
  );
}

export function createKayKitV3LineAppearance(THREE, rig, inputStyle = {}) {
  if (!canCreateKayKitV3LineAppearance(THREE)) {
    throw new Error('KayKit v3 line appearance requires Three.js line geometry support');
  }
  const style = createKayKitV3LineStyle({
    headScale: rig.appearance?.headScale,
    shoulderWidth: rig.appearance?.shoulderScale,
    ...inputStyle,
  });
  const objects = [];
  const limbLine = makeSegments(THREE, LIMB_PAIRS.length, style.lineColor, style.lineOpacity, 'V3_RIG_LINES');
  const glowLine = makeSegments(THREE, LIMB_PAIRS.length, style.glowColor, style.glowOpacity, 'V3_RIG_GLOW', true);
  const contourLine = makeSegments(THREE, 9, style.contourColor, style.contourOpacity, 'V3_BODY_CONTOUR');
  const headLine = makeSegments(THREE, 12, style.headColor, style.headOpacity, 'V3_HEAD_POLYGON');
  [limbLine, glowLine, contourLine, headLine].forEach((line) => {
    rig.motionRoot.add(line);
    objects.push(line);
  });

  const jointScale = Number(rig.appearance?.jointScale) || 1;
  const jointNodes = JOINT_BONE_IDS.map((boneId) => createJointNode(THREE, rig.bones[boneId], style, jointScale));
  objects.push(...jointNodes);

  const localPoints = Object.fromEntries([
    'hips', 'spine', 'chest', 'head',
    'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l',
    'upperarm.r', 'lowerarm.r', 'wrist.r', 'hand.r',
    'upperleg.l', 'lowerleg.l', 'foot.l', 'toes.l',
    'upperleg.r', 'lowerleg.r', 'foot.r', 'toes.r',
  ].map((id) => [id, new THREE.Vector3()]));
  const headCenterWorld = new THREE.Vector3();
  const headCenterLocal = new THREE.Vector3();
  const rightWorld = new THREE.Vector3();
  const upWorld = new THREE.Vector3();
  const polygonFirstWorld = new THREE.Vector3();
  const polygonSecondWorld = new THREE.Vector3();
  const shoulderL = new THREE.Vector3();
  const shoulderR = new THREE.Vector3();
  const chestUpper = new THREE.Vector3();
  const chestLower = new THREE.Vector3();
  const spineBase = new THREE.Vector3();
  const pelvisL = new THREE.Vector3();
  const pelvisR = new THREE.Vector3();
  const localPointEntries = Object.entries(localPoints);
  const contourSegments = [
    [shoulderL, shoulderR],
    [shoulderL, chestUpper],
    [chestUpper, shoulderR],
    [shoulderL, chestLower],
    [chestLower, shoulderR],
    [pelvisL, pelvisR],
    [pelvisL, spineBase],
    [spineBase, pelvisR],
    [chestLower, spineBase],
  ];

  let nodesVisible = true;
  let glowVisible = true;

  function updateLocalBonePoints() {
    rig.root.updateMatrixWorld(true);
    localPointEntries.forEach(([boneId, point]) => {
      rig.bones[boneId].getWorldPosition(point);
      rig.motionRoot.worldToLocal(point);
    });
  }

  function updateLimbs() {
    const limbPosition = limbLine.geometry.attributes.position;
    const glowPosition = glowLine.geometry.attributes.position;
    LIMB_PAIRS.forEach(([startId, endId], index) => {
      const start = localPoints[startId];
      const end = localPoints[endId];
      setPoint(limbPosition, index * 2, start);
      setPoint(limbPosition, index * 2 + 1, end);
      setPoint(glowPosition, index * 2, start);
      setPoint(glowPosition, index * 2 + 1, end);
    });
    limbPosition.needsUpdate = true;
    glowPosition.needsUpdate = true;
  }

  function updateContour() {
    const chest = localPoints.chest;
    const spine = localPoints.spine;
    const hips = localPoints.hips;
    shoulderL.copy(localPoints['upperarm.l']).sub(chest).multiplyScalar(style.shoulderWidth).add(chest);
    shoulderR.copy(localPoints['upperarm.r']).sub(chest).multiplyScalar(style.shoulderWidth).add(chest);
    shoulderL.x -= style.armOutset;
    shoulderR.x += style.armOutset;
    chestUpper.copy(chest).lerp(localPoints.head, 0.12);
    chestLower.copy(spine).lerp(chest, 0.22);
    spineBase.copy(hips).lerp(spine, 0.20);
    pelvisL.copy(localPoints['upperleg.l']).sub(hips).multiplyScalar(style.pelvisWidth).add(hips);
    pelvisR.copy(localPoints['upperleg.r']).sub(hips).multiplyScalar(style.pelvisWidth).add(hips);
    pelvisL.x -= style.legOutset;
    pelvisR.x += style.legOutset;
    const position = contourLine.geometry.attributes.position;
    contourSegments.forEach(([start, end], index) => {
      setPoint(position, index * 2, start);
      setPoint(position, index * 2 + 1, end);
    });
    position.needsUpdate = true;
  }

  function updateHead(camera) {
    rig.bones.head.getWorldPosition(headCenterWorld);
    headCenterLocal.copy(headCenterWorld);
    rig.motionRoot.worldToLocal(headCenterLocal);
    if (camera?.quaternion) {
      rightWorld.set(1, 0, 0).applyQuaternion(camera.quaternion);
      upWorld.set(0, 1, 0).applyQuaternion(camera.quaternion);
    } else {
      rightWorld.set(1, 0, 0);
      upWorld.set(0, 1, 0);
    }
    const radius = 0.27 * style.headScale;
    const sides = style.headSides;
    const headPosition = headLine.geometry.attributes.position;
    for (let index = 0; index < 12; index += 1) {
      if (index < sides) {
        const firstAngle = (index / sides) * Math.PI * 2;
        const secondAngle = ((index + 1) / sides) * Math.PI * 2;
        const first = polygonFirstWorld.copy(headCenterWorld)
          .addScaledVector(rightWorld, Math.cos(firstAngle) * radius)
          .addScaledVector(upWorld, Math.sin(firstAngle) * radius);
        const second = polygonSecondWorld.copy(headCenterWorld)
          .addScaledVector(rightWorld, Math.cos(secondAngle) * radius)
          .addScaledVector(upWorld, Math.sin(secondAngle) * radius);
        rig.motionRoot.worldToLocal(first);
        rig.motionRoot.worldToLocal(second);
        setPoint(headPosition, index * 2, first);
        setPoint(headPosition, index * 2 + 1, second);
      } else {
        setPoint(headPosition, index * 2, headCenterLocal);
        setPoint(headPosition, index * 2 + 1, headCenterLocal);
      }
    }
    headPosition.needsUpdate = true;
    headLine.geometry.setDrawRange(0, sides * 2);
  }

  function update(camera) {
    updateLocalBonePoints();
    updateLimbs();
    updateContour();
    updateHead(camera);
  }

  update();
  return {
    style,
    renderStyle: 'v3-rig-line',
    objects: Object.freeze(objects),
    jointNodes: Object.freeze(jointNodes),
    lines: Object.freeze({ limbs: limbLine, glow: glowLine, contour: contourLine, head: headLine }),
    get nodesVisible() { return nodesVisible; },
    get glowVisible() { return glowVisible; },
    setNodesVisible(value) {
      nodesVisible = value !== false;
      jointNodes.forEach((node) => { node.visible = nodesVisible; });
    },
    setGlowVisible(value) {
      glowVisible = value !== false;
      glowLine.visible = glowVisible;
    },
    update,
  };
}
