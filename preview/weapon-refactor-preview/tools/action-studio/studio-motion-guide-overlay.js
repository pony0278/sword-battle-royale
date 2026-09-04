import { normalizeMotionGuide } from '../../src/animation/motion-guide-schema.js';

const GUIDE_COLORS = Object.freeze({
  hand: 0xffc857,
  windup: 0xff985c,
  head: 0x59d8ff,
  body: 0xff72a6,
  foot: 0x65e6a5,
  grip: 0xb99aff,
  linkage: 0xa5b5d6,
});

function createMarker(THREE, name, color, radius = 0.045, target = false, dragTarget = '') {
  const geometry = target
    ? new THREE.TorusGeometry(radius * 1.55, radius * 0.32, 7, 20)
    : new THREE.SphereGeometry(radius, 10, 8);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: target ? 0.98 : 0.82,
    depthTest: false,
    depthWrite: false,
  });
  const marker = new THREE.Mesh(geometry, material);
  marker.name = name;
  marker.renderOrder = 90;
  marker.userData.motionGuideTarget = dragTarget;
  return marker;
}

function createLink(THREE, name, color, opacity = 0.55) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  }));
  line.name = name;
  line.frustumCulled = false;
  line.renderOrder = 89;
  return line;
}

function setLink(line, start, end) {
  const position = line.geometry.attributes.position;
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

export function createWholeBodyMotionGuideOverlay(THREE, {
  scene,
  camera,
  canvas,
  character,
  sword,
}) {
  const group = new THREE.Group();
  group.name = 'WHOLE_BODY_MOTION_GUIDES';
  group.visible = false;
  scene.add(group);

  const markers = {
    head: createMarker(THREE, 'GUIDE_HEAD_LINK', GUIDE_COLORS.head),
    hand: createMarker(THREE, 'GUIDE_SWORD_HAND_LINK', GUIDE_COLORS.hand),
    offHand: createMarker(THREE, 'GUIDE_OFF_HAND_LINK', GUIDE_COLORS.grip),
    secondaryGrip: createMarker(THREE, 'GUIDE_SECONDARY_GRIP', GUIDE_COLORS.grip, 0.04, true),
    hips: createMarker(THREE, 'GUIDE_BODY_LINK', GUIDE_COLORS.body, 0.055),
    footL: createMarker(THREE, 'GUIDE_FOOT_L_LINK', GUIDE_COLORS.foot),
    footR: createMarker(THREE, 'GUIDE_FOOT_R_LINK', GUIDE_COLORS.foot),
    impactTarget: createMarker(THREE, 'GUIDE_IMPACT_TARGET', GUIDE_COLORS.hand, 0.09, true, 'impact'),
    comTarget: createMarker(THREE, 'GUIDE_COM_TARGET', GUIDE_COLORS.body, 0.075, true, 'com'),
    plantTarget: createMarker(THREE, 'GUIDE_PLANT_TARGET', GUIDE_COLORS.foot, 0.08, true, 'plant'),
    windupTarget: createMarker(THREE, 'GUIDE_WINDUP_TARGET', GUIDE_COLORS.windup, 0.085, true, 'windup'),
  };
  markers.comTarget.rotation.y = Math.PI / 2;
  markers.plantTarget.rotation.x = Math.PI / 2;
  markers.windupTarget.rotation.y = Math.PI / 2;
  const draggableMarkers = [markers.windupTarget, markers.impactTarget, markers.comTarget, markers.plantTarget];

  const links = {
    headBody: createLink(THREE, 'GUIDE_HEAD_BODY_LINK', GUIDE_COLORS.linkage, 0.32),
    bodyHand: createLink(THREE, 'GUIDE_BODY_HAND_LINK', GUIDE_COLORS.linkage, 0.32),
    bodyFootL: createLink(THREE, 'GUIDE_BODY_FOOT_L_LINK', GUIDE_COLORS.linkage, 0.26),
    bodyFootR: createLink(THREE, 'GUIDE_BODY_FOOT_R_LINK', GUIDE_COLORS.linkage, 0.26),
    headTarget: createLink(THREE, 'GUIDE_HEAD_TARGET_LINK', GUIDE_COLORS.head),
    handTarget: createLink(THREE, 'GUIDE_HAND_TARGET_LINK', GUIDE_COLORS.hand, 0.72),
    handWindup: createLink(THREE, 'GUIDE_HAND_WINDUP_LINK', GUIDE_COLORS.windup, 0.78),
    bodyTarget: createLink(THREE, 'GUIDE_BODY_TARGET_LINK', GUIDE_COLORS.body),
    footTarget: createLink(THREE, 'GUIDE_FOOT_TARGET_LINK', GUIDE_COLORS.foot, 0.72),
    offHandGrip: createLink(THREE, 'GUIDE_OFF_HAND_GRIP_LINK', GUIDE_COLORS.grip, 0.82),
  };
  Object.values(markers).forEach((marker) => group.add(marker));
  Object.values(links).forEach((line) => group.add(line));

  const points = Object.fromEntries([
    'origin', 'head', 'hand', 'offHand', 'secondaryGrip', 'hips', 'chest',
    'footL', 'footR', 'windup', 'impact', 'com', 'plant',
  ].map((key) => [key, new THREE.Vector3()]));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const planeNormal = new THREE.Vector3();
  let guide = null;
  let onGuideChange = null;
  let dragging = null;
  let hovered = null;
  const diagnostics = { windupTargetError: 0, secondaryGripError: 0, draggingTarget: '' };

  function setGuide(nextGuide) {
    guide = nextGuide ? normalizeMotionGuide(nextGuide) : null;
    group.visible = Boolean(guide?.visible);
  }

  function updateTargetPoints() {
    const planeX = guide.cutPlaneOffset * 0.008;
    points.windup.copy(points.origin).add(new THREE.Vector3(
      planeX,
      guide.windupHeight,
      -guide.windupPullback,
    ));
    points.impact.copy(points.origin).add(new THREE.Vector3(
      planeX,
      guide.impactHeight,
      Math.max(0.9, guide.stepDistance + 0.82),
    ));
    points.com.copy(points.origin).add(new THREE.Vector3(
      planeX * 0.35,
      0.93 - guide.crouchDepth * 0.003,
      guide.stepDistance * (0.32 + guide.coupling * 0.42),
    ));
    points.plant.copy(points.origin).add(new THREE.Vector3(
      guide.leadFoot === 'L' ? 0.18 : -0.18,
      0.035,
      guide.stepDistance,
    ));
  }

  function update() {
    group.visible = Boolean(guide?.visible);
    if (!group.visible) return;
    character.object3d.updateMatrixWorld(true);
    character.object3d.getWorldPosition(points.origin);
    character.rig.bones.head.getWorldPosition(points.head);
    character.rig.bones['handslot.r'].getWorldPosition(points.hand);
    character.rig.bones['handslot.l'].getWorldPosition(points.offHand);
    character.rig.bones.hips.getWorldPosition(points.hips);
    character.rig.bones.chest.getWorldPosition(points.chest);
    character.rig.bones['foot.l'].getWorldPosition(points.footL);
    character.rig.bones['foot.r'].getWorldPosition(points.footR);
    sword.secondaryGrip.getWorldPosition(points.secondaryGrip);
    updateTargetPoints();

    markers.head.position.copy(points.head);
    markers.hand.position.copy(points.hand);
    markers.offHand.position.copy(points.offHand);
    markers.secondaryGrip.position.copy(points.secondaryGrip);
    markers.hips.position.copy(points.hips);
    markers.footL.position.copy(points.footL);
    markers.footR.position.copy(points.footR);
    markers.windupTarget.position.copy(points.windup);
    markers.impactTarget.position.copy(points.impact);
    markers.comTarget.position.copy(points.com);
    markers.plantTarget.position.copy(points.plant);

    setLink(links.headBody, points.head, points.chest);
    setLink(links.bodyHand, points.chest, points.hand);
    setLink(links.bodyFootL, points.hips, points.footL);
    setLink(links.bodyFootR, points.hips, points.footR);
    setLink(links.headTarget, points.head, points.impact);
    setLink(links.handTarget, points.hand, points.impact);
    setLink(links.handWindup, points.hand, points.windup);
    setLink(links.bodyTarget, points.hips, points.com);
    setLink(links.footTarget, guide.leadFoot === 'L' ? points.footL : points.footR, points.plant);
    setLink(links.offHandGrip, points.offHand, points.secondaryGrip);
    diagnostics.windupTargetError = points.hand.distanceTo(points.windup);
    diagnostics.secondaryGripError = points.offHand.distanceTo(points.secondaryGrip);
    const showGrip = guide.twoHandGrip;
    markers.offHand.visible = showGrip;
    markers.secondaryGrip.visible = showGrip;
    links.offHandGrip.visible = showGrip;
    markers.windupTarget.visible = guide.windupTarget;
    links.handWindup.visible = guide.windupTarget;
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function pickTarget(event) {
    if (!group.visible) return null;
    setPointer(event);
    return raycaster.intersectObjects(draggableMarkers, false)[0]?.object || null;
  }

  function setDragPlane(target) {
    if (target === 'impact') planeNormal.set(0, 0, 1);
    else if (target === 'com' || target === 'windup') planeNormal.set(1, 0, 0);
    else planeNormal.set(0, 1, 0);
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, markers[`${target}Target`].position);
  }

  function applyDrag(event) {
    setPointer(event);
    if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
    const next = { ...guide };
    if (dragging === 'windup') {
      next.windupHeight = dragPoint.y - points.origin.y;
      next.windupPullback = points.origin.z - dragPoint.z;
    } else if (dragging === 'impact') {
      next.impactHeight = dragPoint.y - points.origin.y;
      next.cutPlaneOffset = (dragPoint.x - points.origin.x) / 0.008;
    } else if (dragging === 'plant') {
      next.stepDistance = dragPoint.z - points.origin.z;
      next.leadFoot = dragPoint.x >= points.origin.x ? 'L' : 'R';
    } else if (dragging === 'com') {
      next.crouchDepth = (0.93 - (dragPoint.y - points.origin.y)) / 0.003;
      if (next.stepDistance > 0.05) {
        next.coupling = (((dragPoint.z - points.origin.z) / next.stepDistance) - 0.32) / 0.42;
      }
    }
    guide = normalizeMotionGuide(next);
    updateTargetPoints();
    onGuideChange?.({ ...guide }, { source: 'stage-drag', target: dragging });
  }

  canvas.addEventListener('pointerdown', (event) => {
    const marker = pickTarget(event);
    if (!marker) return;
    dragging = marker.userData.motionGuideTarget;
    diagnostics.draggingTarget = dragging;
    setDragPlane(dragging);
    marker.scale.setScalar(1.25);
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  canvas.addEventListener('pointermove', (event) => {
    if (dragging) {
      applyDrag(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const marker = pickTarget(event);
    if (hovered && hovered !== marker) hovered.scale.setScalar(1);
    hovered = marker;
    if (hovered) hovered.scale.setScalar(1.12);
    canvas.style.cursor = hovered ? 'grab' : '';
  }, true);

  function endDrag(event) {
    if (!dragging) return;
    draggableMarkers.forEach((marker) => marker.scale.setScalar(1));
    dragging = null;
    diagnostics.draggingTarget = '';
    canvas.style.cursor = '';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  canvas.addEventListener('pointerup', endDrag, true);
  canvas.addEventListener('pointercancel', endDrag, true);

  return {
    group,
    markers,
    setGuide,
    update,
    setGuideChangeHandler(handler) { onGuideChange = typeof handler === 'function' ? handler : null; },
    get guide() { return guide ? { ...guide } : null; },
    get diagnostics() { return { ...diagnostics }; },
  };
}
