export const DIRECT_POSE_AXES = Object.freeze({
  x: Object.freeze({ color: 0xff4d5e, vector: Object.freeze({ x: 1, y: 0, z: 0 }) }),
  y: Object.freeze({ color: 0x62df76, vector: Object.freeze({ x: 0, y: 1, z: 0 }) }),
  z: Object.freeze({ color: 0x4c8dff, vector: Object.freeze({ x: 0, y: 0, z: 1 }) }),
});

export function snapAxisDragDistance(distance, snapEnabled = false, snapStep = 0.05) {
  const value = Number(distance) || 0;
  const step = Math.max(0.001, Number(snapStep) || 0.05);
  const snapped = Math.round(value / step) * step;
  return snapEnabled ? Number(snapped.toFixed(10)) : value;
}

export function axisConstrainedTarget(origin, axis, distance, options = {}) {
  const length = Math.hypot(Number(axis?.x) || 0, Number(axis?.y) || 0, Number(axis?.z) || 0) || 1;
  const direction = {
    x: (Number(axis?.x) || 0) / length,
    y: (Number(axis?.y) || 0) / length,
    z: (Number(axis?.z) || 0) / length,
  };
  const constrainedDistance = snapAxisDragDistance(distance, options.snap, options.snapStep);
  return {
    distance: constrainedDistance,
    target: {
      x: (Number(origin?.x) || 0) + direction.x * constrainedDistance,
      y: (Number(origin?.y) || 0) + direction.y * constrainedDistance,
      z: (Number(origin?.z) || 0) + direction.z * constrainedDistance,
    },
  };
}

function createAxisHandle(THREE, axis, definition) {
  const root = new THREE.Group();
  root.name = `POSE_AXIS_${axis.toUpperCase()}`;
  const material = new THREE.MeshBasicMaterial({
    color: definition.color,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), material);
  shaft.position.y = 0.16;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 10), material);
  arrow.position.y = 0.385;
  const pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const pickShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 8), pickMaterial);
  pickShaft.position.y = 0.21;
  const pickArrow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), pickMaterial);
  pickArrow.position.y = 0.40;
  const direction = new THREE.Vector3(definition.vector.x, definition.vector.y, definition.vector.z);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  [shaft, arrow, pickShaft, pickArrow].forEach((object) => {
    object.name = `POSE_AXIS_${axis.toUpperCase()}_${object.geometry.type}`;
    object.renderOrder = 101;
    object.userData.poseDragAxis = axis;
    object.userData.poseDragAxisRoot = root;
    root.add(object);
  });
  return { root, material, pickables: [shaft, arrow, pickShaft, pickArrow] };
}

export function createStudioAxisGizmo(THREE, parent) {
  const group = new THREE.Group();
  group.name = 'POSE_AXIS_GIZMO';
  group.visible = false;
  parent.add(group);
  const handles = Object.fromEntries(Object.entries(DIRECT_POSE_AXES).map(([axis, definition]) => [
    axis,
    createAxisHandle(THREE, axis, definition),
  ]));
  Object.values(handles).forEach((handle) => group.add(handle.root));
  const pickables = Object.values(handles).flatMap((handle) => handle.pickables);
  const worldQuaternion = new THREE.Quaternion();
  const basis = new THREE.Vector3();
  let hoveredAxis = null;
  let activeAxis = null;

  function updateAppearance() {
    Object.entries(handles).forEach(([axis, handle]) => {
      const emphasized = axis === activeAxis || axis === hoveredAxis;
      handle.root.scale.setScalar(emphasized ? 1.13 : 1);
      handle.material.opacity = emphasized ? 1 : 0.9;
    });
  }

  return {
    group,
    handles,
    setVisible(value) { group.visible = Boolean(value); },
    setTransform(position, quaternion, space = 'world') {
      group.position.copy(position);
      if (space === 'local' && quaternion) group.quaternion.copy(quaternion);
      else group.quaternion.identity();
      group.updateMatrixWorld(true);
    },
    updateScale(camera) {
      const distance = camera.position.distanceTo(group.position);
      group.scale.setScalar(Math.max(0.72, Math.min(1.8, distance / 5.1)));
    },
    pick(raycaster) {
      if (!group.visible) return null;
      return raycaster.intersectObjects(pickables, false)[0]?.object?.userData?.poseDragAxis || null;
    },
    setHovered(axis) {
      hoveredAxis = axis || null;
      updateAppearance();
    },
    setActive(axis) {
      activeAxis = axis || null;
      updateAppearance();
    },
    getWorldAxis(axis, target) {
      const definition = DIRECT_POSE_AXES[axis];
      if (!definition) return target.set(0, 0, 0);
      group.getWorldQuaternion(worldQuaternion);
      return target.set(definition.vector.x, definition.vector.y, definition.vector.z)
        .applyQuaternion(worldQuaternion)
        .normalize();
    },
  };
}
