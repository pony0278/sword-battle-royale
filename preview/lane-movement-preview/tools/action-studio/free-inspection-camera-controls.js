export const FREE_INSPECTION_CAMERA_STAGE = 'ACTION_STUDIO_FREE_INSPECTION_CAMERA_V1';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function isEditableTarget(target) {
  const tag = String(target?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable === true;
}

export function createFreeInspectionCameraControls(THREE, options = {}) {
  if (!THREE?.Vector3 || !options.camera || !options.domElement) {
    throw new Error(`${FREE_INSPECTION_CAMERA_STAGE} requires THREE.Vector3 + camera + domElement`);
  }

  const camera = options.camera;
  const domElement = options.domElement;
  const eventTarget = options.eventTarget || globalThis;
  const focus = new THREE.Vector3(
    finite(options.target?.x),
    finite(options.target?.y, 1.05),
    finite(options.target?.z),
  );
  const worldUp = new THREE.Vector3(0, 1, 0);
  const offset = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const pressed = new Set();
  const minimumRadius = clamp(options.minimumRadius ?? 0.7, 0.2, 10);
  const maximumRadius = Math.max(minimumRadius + 0.1, finite(options.maximumRadius, 16));
  const minimumPitch = clamp(options.minimumPitch ?? -1.5, -1.55, 0);
  const maximumPitch = clamp(options.maximumPitch ?? 1.5, 0, 1.55);
  const rotateRadiansPerPixel = clamp(options.rotateRadiansPerPixel ?? 0.006, 0.001, 0.03);
  const panScalePerPixel = clamp(options.panScalePerPixel ?? 0.0018, 0.0002, 0.01);
  const zoomScale = clamp(options.zoomScale ?? 0.0012, 0.0002, 0.01);
  let radius = 5;
  let yaw = 0;
  let pitch = 0;
  let pointer = null;

  domElement.style.touchAction = 'none';

  function applyCamera() {
    const horizontalRadius = Math.cos(pitch) * radius;
    camera.position.set(
      focus.x + Math.sin(yaw) * horizontalRadius,
      focus.y + Math.sin(pitch) * radius,
      focus.z + Math.cos(yaw) * horizontalRadius,
    );
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);
  }

  function syncFromCamera() {
    offset.copy(camera.position).sub(focus);
    radius = clamp(offset.length(), minimumRadius, maximumRadius);
    if (offset.lengthSq() <= 1e-10) offset.set(0, 0, radius);
    pitch = clamp(Math.asin(clamp(offset.y / radius, -1, 1)), minimumPitch, maximumPitch);
    yaw = Math.atan2(offset.x, offset.z);
    applyCamera();
  }

  function setPose(position, target = focus) {
    focus.set(finite(target.x), finite(target.y, 1.05), finite(target.z));
    camera.position.set(finite(position.x), finite(position.y, 1.7), finite(position.z, 5));
    syncFromCamera();
    return snapshot();
  }

  function onPointerDown(event) {
    if (![0, 1, 2].includes(event.button)) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: event.button === 0 && !event.shiftKey ? 'orbit' : 'pan',
    };
    domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.mode === 'orbit') {
      yaw -= deltaX * rotateRadiansPerPixel;
      pitch = clamp(pitch - deltaY * rotateRadiansPerPixel, minimumPitch, maximumPitch);
    } else {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      const scale = radius * panScalePerPixel;
      focus.addScaledVector(right, -deltaX * scale);
      focus.addScaledVector(cameraUp, deltaY * scale);
    }
    applyCamera();
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    domElement.releasePointerCapture?.(event.pointerId);
    pointer = null;
    event.preventDefault();
  }

  function onWheel(event) {
    radius = clamp(radius * Math.exp(event.deltaY * zoomScale), minimumRadius, maximumRadius);
    applyCamera();
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) return;
    pressed.add(event.code);
    event.preventDefault();
  }

  function onKeyUp(event) {
    pressed.delete(event.code);
  }

  function onBlur() {
    pressed.clear();
    pointer = null;
  }

  function update(deltaSeconds = 1 / 60) {
    const dt = clamp(deltaSeconds, 0, 0.1);
    movement.set(0, 0, 0);
    forward.copy(focus).sub(camera.position);
    forward.y = 0;
    if (forward.lengthSq() <= 1e-10) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, worldUp).normalize();
    if (pressed.has('KeyW')) movement.add(forward);
    if (pressed.has('KeyS')) movement.sub(forward);
    if (pressed.has('KeyD')) movement.add(right);
    if (pressed.has('KeyA')) movement.sub(right);
    if (pressed.has('KeyE')) movement.add(worldUp);
    if (pressed.has('KeyQ')) movement.sub(worldUp);
    if (movement.lengthSq() > 1e-10) {
      const speed = Math.max(0.65, radius * 0.55);
      focus.addScaledVector(movement.normalize(), speed * dt);
      applyCamera();
    }
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      stage: FREE_INSPECTION_CAMERA_STAGE,
      target: Object.freeze({ x: focus.x, y: focus.y, z: focus.z }),
      radius,
      yaw,
      pitch,
      pointerMode: pointer?.mode || null,
      keys: Object.freeze([...pressed]),
      authority: 'user-controlled-inspection-camera-only',
    });
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('contextmenu', preventContextMenu);
    eventTarget.removeEventListener?.('keydown', onKeyDown);
    eventTarget.removeEventListener?.('keyup', onKeyUp);
    eventTarget.removeEventListener?.('blur', onBlur);
  }

  function preventContextMenu(event) {
    event.preventDefault();
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', preventContextMenu);
  eventTarget.addEventListener?.('keydown', onKeyDown);
  eventTarget.addEventListener?.('keyup', onKeyUp);
  eventTarget.addEventListener?.('blur', onBlur);
  syncFromCamera();

  return Object.freeze({
    update,
    setPose,
    syncFromCamera,
    snapshot,
    dispose,
    get target() { return focus; },
  });
}
