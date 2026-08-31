// R18V.3 — geometry scratch for the R281 lab entry. No authority of any kind: nothing here decides
// whether a contact happened, only how a shape or a blade is read out of the scene this frame.

export function cloneSurface(surface = {}) {
  return {
    center: {
      x: Number(surface.center?.x) || 0,
      y: Number(surface.center?.y) || 0,
      z: Number(surface.center?.z) || 0,
    },
    normal: {
      x: Number(surface.normal?.x) || 0,
      y: Number(surface.normal?.y) || 0,
      z: Number(surface.normal?.z) || -1,
    },
    radius: Number(surface.radius) || 0,
    thickness: Number(surface.thickness) || 0,
  };
}

export function magnitude(v) {
  return v ? Math.hypot(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0) : 0;
}

// Samples the three blade nodes into world space, alternating between two buffers so the caller
// still holds the previous frame's polyline while it reads the current one. The swept contact test
// needs both, and allocating a fresh pair every frame would be the one allocation in the loop.
export function createBladePolylineSampler(THREE, attackerSword) {
  const bladeNodes = [attackerSword.bladeBase, attackerSword.bladeMid, attackerSword.tip];
  const bladeScratch = bladeNodes.map(() => new THREE.Vector3());
  const bladeBuffers = [0, 1].map(() => bladeNodes.map(() => ({ x: 0, y: 0, z: 0 })));
  let bladeBufferIndex = 0;

  return function captureBladePolyline() {
    attackerSword.object3d.updateMatrixWorld(true);
    const buffer = bladeBuffers[bladeBufferIndex];
    bladeBufferIndex = 1 - bladeBufferIndex;
    for (let i = 0; i < bladeNodes.length; i += 1) {
      bladeNodes[i].getWorldPosition(bladeScratch[i]);
      buffer[i].x = bladeScratch[i].x;
      buffer[i].y = bladeScratch[i].y;
      buffer[i].z = bladeScratch[i].z;
    }
    return buffer;
  };
}
