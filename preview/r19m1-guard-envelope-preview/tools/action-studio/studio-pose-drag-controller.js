import { normalizePose } from '../../src/animation/pose-utils.js';
import { solveWholeBodyDragPose } from '../../src/animation/whole-body-drag-solver.js';
import { applyPoseToProceduralKayKitRig } from '../../src/animation/kaykit-pose-adapter.js';
import {
  axisConstrainedTarget,
  createStudioAxisGizmo,
} from './studio-axis-gizmo.js';

const EFFECTORS = Object.freeze({
  handL: Object.freeze({ bone: 'handslot.l', label: 'LEFT HAND', color: 0xb99aff, radius: 0.065 }),
  handR: Object.freeze({ bone: 'handslot.r', label: 'RIGHT HAND · WEAPON', color: 0xff3b81, radius: 0.082 }),
  footL: Object.freeze({ bone: 'foot.l', label: 'LEFT FOOT', color: 0x65e6a5, radius: 0.075 }),
  footR: Object.freeze({ bone: 'foot.r', label: 'RIGHT FOOT', color: 0x59d8ff, radius: 0.075 }),
  elbowL: Object.freeze({ bone: 'lowerarm.l', label: 'LEFT ELBOW', color: 0xd9b8ff, radius: 0.052, joint: true, anchor: 'handL' }),
  elbowR: Object.freeze({ bone: 'lowerarm.r', label: 'RIGHT ELBOW', color: 0xff8fb5, radius: 0.052, joint: true, anchor: 'handR' }),
  kneeL: Object.freeze({ bone: 'lowerleg.l', label: 'LEFT KNEE', color: 0xaaffcf, radius: 0.057, joint: true, anchor: 'footL' }),
  kneeR: Object.freeze({ bone: 'lowerleg.r', label: 'RIGHT KNEE', color: 0x9ce9ff, radius: 0.057, joint: true, anchor: 'footR' }),
});

function createEffectorMarker(THREE, effector, definition) {
  const geometry = definition.joint
    ? new THREE.SphereGeometry(definition.radius, 10, 8)
    : new THREE.OctahedronGeometry(definition.radius, 0);
  const marker = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: definition.joint ? 0.78 : 0.95,
      wireframe: Boolean(definition.joint),
      depthTest: false,
      depthWrite: false,
    }),
  );
  marker.name = `POSE_DRAG_${effector.toUpperCase()}`;
  marker.renderOrder = 96;
  marker.userData.poseDragEffector = effector;
  return marker;
}

function createPinRing(THREE, name, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.012, 7, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
    }),
  );
  ring.name = name;
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 94;
  return ring;
}

function createTargetRing(THREE) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.105, 0.014, 7, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    }),
  );
  ring.name = 'POSE_DRAG_TARGET';
  ring.renderOrder = 98;
  ring.visible = false;
  return ring;
}

function createLink(THREE) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.68,
    depthTest: false,
    depthWrite: false,
  }));
  line.name = 'POSE_DRAG_ERROR_LINK';
  line.frustumCulled = false;
  line.renderOrder = 97;
  line.visible = false;
  return line;
}

function setLink(line, start, end) {
  const position = line.geometry.attributes.position;
  position.setXYZ(0, start.x, start.y, start.z);
  position.setXYZ(1, end.x, end.y, end.z);
  position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function centimeters(value) {
  return `${Math.round(Math.max(0, value) * 100)}cm`;
}

function signedCentimeters(value) {
  return `${value >= 0 ? '+' : '-'}${Math.round(Math.abs(value) * 100)}cm`;
}

export function createStudioPoseDragController(THREE, options) {
  const {
    scene,
    camera,
    canvas,
    character,
    prepareDrag,
    applyPose,
    finishDrag,
  } = options;
  const enabledControl = document.getElementById('poseDragEnabled');
  const pinLeftControl = document.getElementById('posePinLeftFoot');
  const pinRightControl = document.getElementById('posePinRightFoot');
  const jointControl = document.getElementById('poseJointHandles');
  const planeControl = document.getElementById('poseDragPlane');
  const axisEnabledControl = document.getElementById('poseAxisGizmo');
  const axisSpaceControl = document.getElementById('poseAxisSpace');
  const axisReadout = document.getElementById('poseAxisReadout');
  const couplingControl = document.getElementById('poseDragCoupling');
  const couplingOutput = document.getElementById('poseDragCouplingValue');
  const status = document.getElementById('poseDragStatus');

  const group = new THREE.Group();
  group.name = 'DIRECT_POSE_MANIPULATORS';
  scene.add(group);
  const axisGizmo = createStudioAxisGizmo(THREE, group);
  const markers = Object.fromEntries(Object.entries(EFFECTORS).map(([effector, definition]) => [
    effector,
    createEffectorMarker(THREE, effector, definition),
  ]));
  const pinRings = {
    footL: createPinRing(THREE, 'POSE_PIN_FOOT_L', EFFECTORS.footL.color),
    footR: createPinRing(THREE, 'POSE_PIN_FOOT_R', EFFECTORS.footR.color),
  };
  const targetMarker = createTargetRing(THREE);
  const errorLink = createLink(THREE);
  Object.values(markers).forEach((marker) => group.add(marker));
  Object.values(pinRings).forEach((ring) => group.add(ring));
  group.add(targetMarker, errorLink);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const planeNormal = new THREE.Vector3();
  const ringNormal = new THREE.Vector3(0, 0, 1);
  const dragPoint = new THREE.Vector3();
  const dragAxisWorld = new THREE.Vector3();
  const axisStartPoint = new THREE.Vector3();
  const axisStartTarget = new THREE.Vector3();
  const boneWorldQuaternion = new THREE.Quaternion();
  const dragGizmoQuaternion = new THREE.Quaternion();
  const targetPoint = new THREE.Vector3();
  const rigPoints = Object.fromEntries([
    ...Object.keys(EFFECTORS), 'hips', 'chest',
  ].map((key) => [key, new THREE.Vector3()]));
  let dragging = null;
  let selectedEffector = null;
  let hovered = null;
  let hoveredAxis = null;
  let dragAxis = null;
  let dragAxisSpace = 'world';
  let axisDistance = 0;
  let axisSnap = false;
  let dragContext = null;
  let referencePose = null;
  let workingPose = null;
  let pinnedFeet = {};
  let secondaryTargets = {};
  let lastResult = null;

  function settings() {
    return {
      enabled: enabledControl.checked,
      pinLeftFoot: pinLeftControl.checked,
      pinRightFoot: pinRightControl.checked,
      coupling: Number(couplingControl.value),
      showJointHandles: jointControl.checked,
      dragPlane: planeControl.value,
      showAxisGizmo: axisEnabledControl.checked,
      axisSpace: axisSpaceControl.value,
      maxStretch: 1.05,
    };
  }

  function setStatus(message, pending = false) {
    status.textContent = message;
    status.classList.toggle('pending', pending);
  }

  function readRigPoints() {
    character.object3d.updateMatrixWorld(true);
    Object.entries(EFFECTORS).forEach(([effector, definition]) => {
      character.rig.bones[definition.bone].getWorldPosition(rigPoints[effector]);
    });
    character.rig.bones.hips.getWorldPosition(rigPoints.hips);
    character.rig.bones.chest.getWorldPosition(rigPoints.chest);
    return Object.fromEntries(Object.entries(rigPoints).map(([key, value]) => [
      key,
      { x: value.x, y: value.y, z: value.z },
    ]));
  }

  function evaluatePose(pose) {
    applyPoseToProceduralKayKitRig(character.rig, pose);
    return readRigPoints();
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function pickControl(event) {
    if (!group.visible) return null;
    setPointer(event);
    const axis = selectedEffector && settings().showAxisGizmo ? axisGizmo.pick(raycaster) : null;
    if (axis) return { axis, effector: selectedEffector, marker: null };
    const marker = raycaster.intersectObjects(Object.values(markers).filter((entry) => entry.visible), false)[0]?.object || null;
    return marker ? { axis: null, effector: marker.userData.poseDragEffector, marker } : null;
  }

  function solve(passes) {
    lastResult = solveWholeBodyDragPose({
      pose: referencePose,
      seedPose: workingPose,
      referencePose,
      evaluatePose,
      effector: dragging,
      target: targetPoint,
      pinnedFeet,
      coupling: settings().coupling,
      secondaryTargets,
      allowWholeBody: !EFFECTORS[dragging].joint,
      maxStretch: settings().maxStretch,
      passes,
    });
    workingPose = lastResult.pose;
    applyPose?.(workingPose, dragContext, { ...lastResult, effector: dragging, live: true });
    const pins = Object.values(lastResult.pinErrors);
    const pinError = pins.length ? Math.max(...pins) : 0;
    const anchors = Object.values(lastResult.secondaryErrors || {});
    const anchorError = anchors.length ? Math.max(...anchors) : 0;
    const lift = Math.abs(lastResult.bodyLift) >= 0.005
      ? ` · body ${signedCentimeters(lastResult.bodyLift)}`
      : '';
    const anchor = anchors.length ? ` · anchor ${centimeters(anchorError)}` : '';
    const axis = dragAxis
      ? ` · ${dragAxisSpace.toUpperCase()} ${dragAxis.toUpperCase()} ${signedCentimeters(axisDistance)}${axisSnap ? ' · SNAP' : ''}`
      : '';
    setStatus(`${EFFECTORS[dragging].label} · target ${centimeters(lastResult.targetError)} · pins ${centimeters(pinError)}${anchor}${lift}${axis}`, true);
    axisReadout.textContent = dragAxis
      ? `${dragAxisSpace.toUpperCase()} ${dragAxis.toUpperCase()} · ${signedCentimeters(axisDistance)}${axisSnap ? ' · Shift snap 5cm' : ''}`
      : 'FREE · constrained by the selected drag plane';
  }

  function configureDragPlane() {
    const mode = settings().dragPlane;
    if (mode === 'ground') {
      planeNormal.set(0, 1, 0);
    } else if (mode === 'vertical') {
      camera.getWorldDirection(planeNormal);
      planeNormal.y = 0;
      if (planeNormal.lengthSq() < 0.0001) planeNormal.set(0, 0, 1);
      planeNormal.normalize();
    } else {
      camera.getWorldDirection(planeNormal);
    }
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, targetPoint);
    targetMarker.quaternion.setFromUnitVectors(ringNormal, planeNormal);
    return planeControl.options[planeControl.selectedIndex]?.text || mode;
  }

  function setSelectedGizmoTransform(position, locked = false) {
    const space = locked ? dragAxisSpace : settings().axisSpace;
    const quaternion = locked
      ? dragGizmoQuaternion
      : character.rig.bones[EFFECTORS[selectedEffector].bone].getWorldQuaternion(boneWorldQuaternion);
    axisGizmo.setTransform(position, quaternion, space);
  }

  function configureAxisDrag() {
    dragAxisSpace = settings().axisSpace;
    character.rig.bones[EFFECTORS[dragging].bone].getWorldQuaternion(dragGizmoQuaternion);
    setSelectedGizmoTransform(targetPoint, true);
    axisGizmo.getWorldAxis(dragAxis, dragAxisWorld);
    axisStartTarget.copy(targetPoint);
    camera.getWorldDirection(planeNormal);
    planeNormal.addScaledVector(dragAxisWorld, -planeNormal.dot(dragAxisWorld));
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal.set(0, 1, 0);
      if (Math.abs(planeNormal.dot(dragAxisWorld)) > 0.92) planeNormal.set(1, 0, 0);
      planeNormal.addScaledVector(dragAxisWorld, -planeNormal.dot(dragAxisWorld));
    }
    planeNormal.normalize();
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, targetPoint);
    axisStartPoint.copy(targetPoint);
    raycaster.ray.intersectPlane(dragPlane, axisStartPoint);
    targetMarker.quaternion.setFromUnitVectors(ringNormal, dragAxisWorld);
    axisGizmo.setActive(dragAxis);
    return `${dragAxisSpace.toUpperCase()} ${dragAxis.toUpperCase()} axis`;
  }

  function beginDrag(event, effector, axis = null) {
    dragContext = prepareDrag?.(effector);
    if (!dragContext?.pose) return;
    dragging = effector;
    selectedEffector = effector;
    dragAxis = axis;
    axisDistance = 0;
    axisSnap = false;
    referencePose = normalizePose(dragContext.pose);
    workingPose = { ...referencePose };
    evaluatePose(referencePose);
    readRigPoints();
    targetPoint.copy(rigPoints[dragging]);
    pinnedFeet = {};
    if (pinLeftControl.checked && dragging !== 'footL') pinnedFeet.footL = rigPoints.footL.clone();
    if (pinRightControl.checked && dragging !== 'footR') pinnedFeet.footR = rigPoints.footR.clone();
    secondaryTargets = {};
    const anchorEffector = EFFECTORS[dragging].anchor;
    if (anchorEffector) {
      secondaryTargets[anchorEffector] = { target: rigPoints[anchorEffector].clone(), weight: 2 };
    }
    const planeLabel = dragAxis ? configureAxisDrag() : configureDragPlane();
    markers[dragging].scale.setScalar(1.28);
    targetMarker.visible = true;
    targetMarker.position.copy(targetPoint);
    errorLink.visible = true;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(event.pointerId);
    setStatus(`${EFFECTORS[dragging].label} selected · ${planeLabel} plane`, true);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function moveDrag(event) {
    setPointer(event);
    if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
    if (dragAxis) {
      const rawDistance = dragPoint.sub(axisStartPoint).dot(dragAxisWorld);
      const constrained = axisConstrainedTarget(axisStartTarget, dragAxisWorld, rawDistance, {
        snap: event.shiftKey,
        snapStep: 0.05,
      });
      targetPoint.set(constrained.target.x, constrained.target.y, constrained.target.z);
      axisDistance = constrained.distance;
      axisSnap = event.shiftKey;
    } else {
      targetPoint.copy(dragPoint);
    }
    targetMarker.position.copy(targetPoint);
    solve(2);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function endDrag(event) {
    if (!dragging) return;
    solve(6);
    if (dragging === 'footL' || dragging === 'footR') {
      const contactKey = dragging === 'footL' ? 'lL_contact' : 'lR_contact';
      const startPoint = evaluatePose(referencePose)[dragging];
      workingPose[contactKey] = Math.abs(targetPoint.y - startPoint.y) < 0.05 ? 1 : 0;
    }
    applyPose?.(workingPose, dragContext, { ...lastResult, effector: dragging, live: false });
    finishDrag?.(workingPose, dragContext, { ...lastResult, effector: dragging });
    const finishedLabel = EFFECTORS[dragging].label;
    const finishedError = lastResult?.targetError || 0;
    const finishedAxis = dragAxis ? ` · ${dragAxisSpace.toUpperCase()} ${dragAxis.toUpperCase()} ${signedCentimeters(axisDistance)}` : '';
    Object.values(markers).forEach((marker) => marker.scale.setScalar(1));
    dragging = null;
    dragAxis = null;
    dragContext = null;
    referencePose = null;
    workingPose = null;
    pinnedFeet = {};
    secondaryTargets = {};
    targetMarker.visible = false;
    errorLink.visible = false;
    axisGizmo.setActive(null);
    canvas.style.cursor = '';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    axisReadout.textContent = `${finishedLabel} selected · choose X / Y / Z or drag the center freely`;
    setStatus(`${finishedLabel} baked into the selected Pose Key · error ${centimeters(finishedError)}${finishedAxis}`);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  canvas.addEventListener('pointerdown', (event) => {
    const control = pickControl(event);
    if (control) beginDrag(event, control.effector, control.axis);
  }, true);
  canvas.addEventListener('pointermove', (event) => {
    if (dragging) {
      moveDrag(event);
      return;
    }
    const control = pickControl(event);
    hovered = control?.marker || null;
    hoveredAxis = control?.axis || null;
    axisGizmo.setHovered(hoveredAxis);
    if (hoveredAxis) canvas.style.cursor = 'move';
    else if (hovered) canvas.style.cursor = 'grab';
    else if (canvas.style.cursor === 'grab' || canvas.style.cursor === 'move') canvas.style.cursor = '';
  }, true);
  canvas.addEventListener('pointerup', endDrag, true);
  canvas.addEventListener('pointercancel', endDrag, true);

  enabledControl.addEventListener('change', () => {
    group.visible = enabledControl.checked;
    setStatus(enabledControl.checked
      ? 'Drag a hand or foot control in the stage.'
      : 'Direct Pose controls hidden.');
  });
  axisEnabledControl.addEventListener('change', () => {
    setStatus(axisEnabledControl.checked
      ? 'XYZ axis gizmo enabled · select a pose node.'
      : 'XYZ axis gizmo hidden · free drag remains available.');
  });
  axisSpaceControl.addEventListener('change', () => {
    axisReadout.textContent = `${axisSpaceControl.value.toUpperCase()} axes · select X / Y / Z`;
    setStatus(`Axis space · ${axisSpaceControl.value.toUpperCase()}`);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || dragging) return;
    selectedEffector = null;
    hoveredAxis = null;
    axisGizmo.setHovered(null);
    axisGizmo.setVisible(false);
    axisReadout.textContent = 'No node selected';
    setStatus('Axis selection cleared.');
  });
  couplingControl.addEventListener('input', () => {
    couplingOutput.textContent = Number(couplingControl.value).toFixed(2);
  });
  [pinLeftControl, pinRightControl].forEach((control) => {
    control.addEventListener('change', () => {
      setStatus(`Foot pins · L ${pinLeftControl.checked ? 'ON' : 'OFF'} · R ${pinRightControl.checked ? 'ON' : 'OFF'}`);
    });
  });
  jointControl.addEventListener('change', () => {
    setStatus(jointControl.checked
      ? 'Elbow and knee bend handles visible.'
      : 'Elbow and knee bend handles hidden.');
  });
  planeControl.addEventListener('change', () => {
    setStatus(`Drag plane · ${planeControl.options[planeControl.selectedIndex].text}`);
  });

  function update() {
    group.visible = settings().enabled;
    if (!group.visible) return;
    readRigPoints();
    Object.keys(markers).forEach((effector) => {
      markers[effector].visible = !EFFECTORS[effector].joint || settings().showJointHandles || dragging === effector;
      markers[effector].position.copy(rigPoints[effector]);
      const scale = dragging === effector ? 1.28 : selectedEffector === effector ? 1.17 : hovered === markers[effector] ? 1.14 : 1;
      markers[effector].scale.setScalar(scale);
    });
    const selectedVisible = selectedEffector && markers[selectedEffector]?.visible;
    axisGizmo.setVisible(Boolean(selectedVisible && settings().showAxisGizmo));
    if (selectedVisible && settings().showAxisGizmo) {
      if (dragAxis) setSelectedGizmoTransform(targetPoint, true);
      else setSelectedGizmoTransform(rigPoints[selectedEffector]);
      axisGizmo.updateScale(camera);
    }
    pinRings.footL.position.copy(rigPoints.footL);
    pinRings.footR.position.copy(rigPoints.footR);
    pinRings.footL.visible = settings().pinLeftFoot && dragging !== 'footL';
    pinRings.footR.visible = settings().pinRightFoot && dragging !== 'footR';
    if (dragging) {
      setLink(errorLink, rigPoints[dragging], targetPoint);
    }
  }

  group.visible = settings().enabled;
  couplingOutput.textContent = settings().coupling.toFixed(2);
  axisReadout.textContent = 'Select a hand, foot, elbow, or knee';
  setStatus('Select a pose node, then drag X / Y / Z or drag the node freely.');
  return {
    group,
    markers,
    axisGizmo,
    update,
    get dragging() { return dragging; },
    get selected() { return selectedEffector; },
    get axis() { return dragAxis; },
    get diagnostics() {
      return { selectedEffector, dragAxis, axisSpace: settings().axisSpace, axisDistance, axisSnap, ...(lastResult || {}) };
    },
  };
}
