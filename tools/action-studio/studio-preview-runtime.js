function createPreviewDummy(THREE) {
  const group = new THREE.Group();
  group.name = 'PREVIEW_DUMMY';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.32, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x7b314d, roughness: 0.82, metalness: 0 }),
  );
  body.position.y = 0.82;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.52, 0.52),
    new THREE.MeshStandardMaterial({ color: 0xb74a68, roughness: 0.7 }),
  );
  head.position.y = 1.72;
  group.add(head);
  group.position.z = 2.15;
  return group;
}

const COMBAT_FEEL_PROFILES = Object.freeze({
  light: Object.freeze({
    label: 'Light Slash',
    hitstop: 0.03,
    shake: 0.18,
    knockback: 0.22,
    attackerRecoil: 0.035,
    cameraKick: 0.045,
    cameraSide: 0.25,
    cameraDown: 0.12,
    flash: 0.22,
    sparkScale: 0.42,
    reactionDuration: 0.22,
  }),
  heavy: Object.freeze({
    label: 'Heavy Slash',
    hitstop: 0.065,
    shake: 0.38,
    knockback: 0.68,
    attackerRecoil: 0.075,
    cameraKick: 0.105,
    cameraSide: 0.18,
    cameraDown: 0.42,
    flash: 0.44,
    sparkScale: 0.85,
    reactionDuration: 0.38,
  }),
  block: Object.freeze({
    label: 'Block',
    hitstop: 0.04,
    shake: 0.24,
    knockback: 0.08,
    attackerRecoil: 0.11,
    cameraKick: 0.075,
    cameraSide: 0.72,
    cameraDown: 0.08,
    flash: 0.34,
    sparkScale: 0.62,
    reactionDuration: 0.2,
  }),
  parry: Object.freeze({
    label: 'Perfect Parry',
    hitstop: 0.085,
    shake: 0.46,
    knockback: 0.14,
    attackerRecoil: 0.19,
    cameraKick: 0.13,
    cameraSide: 0.9,
    cameraDown: 0.12,
    flash: 0.62,
    sparkScale: 1.15,
    reactionDuration: 0.3,
  }),
});

function createSparkBurst(THREE) {
  const positions = [];
  const rayCount = 18;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * Math.PI * 2;
    const tilt = ((index % 5) - 2) * 0.12;
    const length = 0.12 + (index % 4) * 0.035;
    positions.push(0, 0, 0);
    positions.push(
      Math.cos(angle) * length,
      Math.sin(angle) * length * 0.72 + tilt,
      Math.sin(angle * 1.7) * length * 0.45,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xffd36b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const burst = new THREE.LineSegments(geometry, material);
  burst.visible = false;
  burst.frustumCulled = false;
  return burst;
}

export function createStudioPreviewRuntime(THREE, options) {
  const {
    canvas,
    character,
    sword,
    impactFlash,
    isDummyEnabled,
  } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f19);
  scene.fog = new THREE.Fog(0x0a0f19, 7, 16);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  const cameraTarget = new THREE.Vector3(0, 1.05, 0);
  let cameraTheta = 0.45;
  let cameraPhi = 1.12;
  let cameraRadius = 5.1;
  let gameCameraOn = false;
  let savedCamera = null;

  scene.add(new THREE.HemisphereLight(0xb9d2ff, 0x11131d, 1.15));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(4, 7, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x55e6c1, 0.7);
  rimLight.position.set(-4, 3, -4);
  scene.add(rimLight);
  scene.add(new THREE.GridHelper(18, 18, 0x33425f, 0x1b263a));
  scene.add(character.object3d);

  const dummy = createPreviewDummy(THREE);
  scene.add(dummy);
  const sparkBurst = createSparkBurst(THREE);
  scene.add(sparkBurst);
  const weaponTrail = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x55e6c1, transparent: true, opacity: 0.92 }),
  );
  weaponTrail.frustumCulled = false;
  scene.add(weaponTrail);
  const trailPoint = new THREE.Vector3();
  let trailPoints = [];

  const feel = { ...COMBAT_FEEL_PROFILES.light };
  let activeFeelProfile = 'light';
  let impactFeel = { ...feel };
  let hitstopRemaining = 0;
  let releasePending = false;
  let shakeRemaining = 0;
  let cameraImpulseRemaining = 0;
  let reactionElapsed = 0;
  let attackerReactionElapsed = 0;
  let sparkRemaining = 0;
  const cameraImpulseDuration = 0.18;
  const sparkDuration = 0.16;
  const dummyBaseZ = 2.15;
  const attackerBasePosition = character.object3d.position.clone();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();

  function placeCamera() {
    camera.position.set(
      cameraTarget.x + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta),
      cameraTarget.y + cameraRadius * Math.cos(cameraPhi),
      cameraTarget.z + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta),
    );
    camera.lookAt(cameraTarget);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }

  function clearWeaponTrail() {
    trailPoints = [];
    weaponTrail.geometry.dispose();
    weaponTrail.geometry = new THREE.BufferGeometry();
  }

  function recordWeaponTrail(enabled) {
    if (!enabled) return;
    sword.trailTip.getWorldPosition(trailPoint);
    if (!trailPoints.length || trailPoints[trailPoints.length - 1].distanceToSquared(trailPoint) > 0.0002) {
      trailPoints.push(trailPoint.clone());
      if (trailPoints.length > 70) trailPoints.shift();
      weaponTrail.geometry.dispose();
      weaponTrail.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
    }
  }

  function applyFeelProfile(profileName) {
    const key = String(profileName || '').toLowerCase();
    const profile = COMBAT_FEEL_PROFILES[key];
    if (!profile) throw new Error(`Unknown combat feel profile: ${profileName}`);
    activeFeelProfile = key;
    Object.assign(feel, profile);
    return { name: key, ...feel };
  }

  function releaseImpact() {
    releasePending = false;
    shakeRemaining = cameraImpulseDuration;
    cameraImpulseRemaining = cameraImpulseDuration;
    reactionElapsed = 0.000001;
    attackerReactionElapsed = 0.000001;
    sparkRemaining = sparkDuration;
    sparkBurst.visible = isDummyEnabled();
    sparkBurst.position.set(0, 1.13, dummyBaseZ - 0.18);
    sparkBurst.scale.setScalar(0.15);
    sparkBurst.material.opacity = 1;
    if (isDummyEnabled()) {
      impactFlash.style.transition = 'none';
      impactFlash.style.opacity = String(impactFeel.flash);
      requestAnimationFrame(() => {
        impactFlash.style.transition = 'opacity .14s ease-out';
        impactFlash.style.opacity = '0';
      });
    }
  }

  function triggerImpact() {
    impactFeel = { ...feel };
    hitstopRemaining = Math.max(0, impactFeel.hitstop);
    releasePending = true;
    reactionElapsed = 0;
    attackerReactionElapsed = 0;
    shakeRemaining = 0;
    cameraImpulseRemaining = 0;
    sparkRemaining = 0;
    sparkBurst.visible = false;
    dummy.position.z = dummyBaseZ;
    dummy.rotation.x = 0;
    character.object3d.position.copy(attackerBasePosition);
    if (hitstopRemaining <= 0) releaseImpact();
  }

  function consumeHitstop(deltaSeconds) {
    if (hitstopRemaining > 0) {
      hitstopRemaining = Math.max(0, hitstopRemaining - deltaSeconds);
      return true;
    }
    if (releasePending) releaseImpact();
    return false;
  }

  function reactionCurve(elapsed, duration) {
    if (elapsed <= 0 || duration <= 0) return 0;
    const t = Math.min(1, elapsed / duration);
    return Math.pow(Math.sin(Math.PI * t), 0.72);
  }

  function update(deltaSeconds) {
    dummy.visible = isDummyEnabled();
    if (reactionElapsed > 0) {
      reactionElapsed += deltaSeconds;
      const amount = reactionCurve(reactionElapsed, impactFeel.reactionDuration);
      dummy.position.z = dummyBaseZ + impactFeel.knockback * 0.72 * amount;
      dummy.rotation.x = -impactFeel.knockback * 0.18 * amount;
      if (reactionElapsed >= impactFeel.reactionDuration) {
        reactionElapsed = 0;
        dummy.position.z = dummyBaseZ;
        dummy.rotation.x = 0;
      }
    } else {
      dummy.position.z = dummyBaseZ;
      dummy.rotation.x = 0;
    }

    if (attackerReactionElapsed > 0) {
      attackerReactionElapsed += deltaSeconds;
      const duration = Math.max(0.16, impactFeel.reactionDuration * 0.72);
      const amount = reactionCurve(attackerReactionElapsed, duration);
      character.object3d.position.copy(attackerBasePosition);
      character.object3d.position.z -= impactFeel.attackerRecoil * amount;
      if (attackerReactionElapsed >= duration) {
        attackerReactionElapsed = 0;
        character.object3d.position.copy(attackerBasePosition);
      }
    } else {
      character.object3d.position.copy(attackerBasePosition);
    }

    if (sparkRemaining > 0) {
      sparkRemaining = Math.max(0, sparkRemaining - deltaSeconds);
      const t = 1 - sparkRemaining / sparkDuration;
      const scale = impactFeel.sparkScale * (0.2 + t * 1.1);
      sparkBurst.scale.setScalar(scale);
      sparkBurst.material.opacity = Math.pow(1 - t, 1.8);
      if (sparkRemaining <= 0) sparkBurst.visible = false;
    }
  }

  function render() {
    cameraOffset.set(0, 0, 0);
    if (cameraImpulseRemaining > 0) {
      const t = cameraImpulseRemaining / cameraImpulseDuration;
      const kick = impactFeel.cameraKick * t * t;
      cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      cameraOffset
        .addScaledVector(cameraRight, kick * impactFeel.cameraSide)
        .addScaledVector(cameraUp, -kick * impactFeel.cameraDown)
        .addScaledVector(cameraForward, -kick * 0.55);
    }
    if (shakeRemaining > 0) {
      const amount = impactFeel.shake * 0.022 * (shakeRemaining / cameraImpulseDuration);
      cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      cameraOffset
        .addScaledVector(cameraRight, (Math.random() * 2 - 1) * amount)
        .addScaledVector(cameraUp, (Math.random() * 2 - 1) * amount);
    }
    camera.position.add(cameraOffset);
    renderer.render(scene, camera);
    camera.position.sub(cameraOffset);
  }

  function advanceShake(deltaSeconds) {
    shakeRemaining = Math.max(0, shakeRemaining - deltaSeconds);
    cameraImpulseRemaining = Math.max(0, cameraImpulseRemaining - deltaSeconds);
  }

  function toggleGameCamera() {
    gameCameraOn = !gameCameraOn;
    if (gameCameraOn) {
      savedCamera = { cameraTheta, cameraPhi, cameraRadius, fov: camera.fov };
      cameraTheta = Math.PI;
      cameraPhi = 0.82;
      cameraRadius = 5.35;
      camera.fov = 34;
    } else if (savedCamera) {
      ({ cameraTheta, cameraPhi, cameraRadius } = savedCamera);
      camera.fov = savedCamera.fov;
    }
    camera.updateProjectionMatrix();
    placeCamera();
    return gameCameraOn;
  }

  function setFeel(key, value) {
    if (!(key in feel)) throw new Error(`Unknown preview feel control: ${key}`);
    feel[key] = Number(value);
    return feel[key];
  }

  function handleFeelProfileEvent(event) {
    const profileName = event?.detail?.profile;
    if (!profileName) return;
    try {
      const applied = applyFeelProfile(profileName);
      window.dispatchEvent(new CustomEvent('action-studio-feel-profile-applied', {
        detail: applied,
      }));
    } catch (_error) {
      // UI validation owns invalid profile names; ignore unrelated custom events.
    }
  }
  window.addEventListener('action-studio-feel-profile', handleFeelProfileEvent);

  let orbiting = false;
  let pointerX = 0;
  let pointerY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    orbiting = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', () => { orbiting = false; });
  canvas.addEventListener('pointercancel', () => { orbiting = false; });
  canvas.addEventListener('pointermove', (event) => {
    if (!orbiting || gameCameraOn) return;
    cameraTheta -= (event.clientX - pointerX) * 0.008;
    cameraPhi = Math.max(0.3, Math.min(1.48, cameraPhi - (event.clientY - pointerY) * 0.008));
    pointerX = event.clientX;
    pointerY = event.clientY;
    placeCamera();
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraRadius = Math.max(3.2, Math.min(10, cameraRadius + event.deltaY * 0.008));
    placeCamera();
  }, { passive: false });

  placeCamera();
  return {
    scene,
    camera,
    renderer,
    feel,
    get activeFeelProfile() { return activeFeelProfile; },
    get feelProfiles() { return COMBAT_FEEL_PROFILES; },
    resize,
    render,
    update,
    advanceShake,
    toggleGameCamera,
    clearWeaponTrail,
    recordWeaponTrail,
    triggerImpact,
    consumeHitstop,
    setFeel,
    applyFeelProfile,
  };
}
