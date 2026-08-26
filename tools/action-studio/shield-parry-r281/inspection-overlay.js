export function createShieldParryInspectionOverlay({ THREE, scene } = {}) {
  if (!THREE || !scene) throw new Error('createShieldParryInspectionOverlay requires THREE + scene');

  const liveTargetMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.027, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x54e7f5, depthTest: false }),
  );
  const actualSwordContactMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffdf59, depthTest: false }),
  );
  const contactTravelGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const contactTravelLine = new THREE.Line(
    contactTravelGeometry,
    new THREE.LineBasicMaterial({ color: 0x54e7f5, depthTest: false }),
  );

  liveTargetMarker.renderOrder = 20;
  actualSwordContactMarker.renderOrder = 20;
  contactTravelLine.renderOrder = 19;
  contactTravelLine.frustumCulled = false;
  liveTargetMarker.visible = false;
  actualSwordContactMarker.visible = false;
  contactTravelLine.visible = false;
  scene.add(liveTargetMarker, actualSwordContactMarker, contactTravelLine);

  function createInspectionLine(color) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false }));
    line.visible = false;
    line.frustumCulled = false;
    line.renderOrder = 21;
    scene.add(line);
    return line;
  }

  const originalAttackAxisLine = createInspectionLine(0xff5964);
  const currentSwordAxisLine = createInspectionLine(0x61f59a);
  const currentWristGripLine = createInspectionLine(0xc58cff);

  function setInspectionLine(line, start, end) {
    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
  }

  function update(report) {
    const target = report?.targetContactPoint;
    const actual = report?.actualContactPoint;
    const origin = report?.plan?.contactPoint;
    const visible = Boolean(target && actual && origin);
    const lineVisible = Boolean(report?.initialSwordBasePoint && report?.initialSwordTipPoint
      && report?.currentSwordBasePoint && report?.currentSwordTipPoint
      && report?.actualWristPoint && report?.actualGripPoint);

    liveTargetMarker.visible = visible;
    actualSwordContactMarker.visible = visible;
    contactTravelLine.visible = visible;
    originalAttackAxisLine.visible = lineVisible;
    currentSwordAxisLine.visible = lineVisible;
    currentWristGripLine.visible = lineVisible;

    if (visible) {
      liveTargetMarker.position.set(target.x, target.y, target.z);
      actualSwordContactMarker.position.set(actual.x, actual.y, actual.z);
      const positions = contactTravelGeometry.attributes.position;
      positions.setXYZ(0, origin.x, origin.y, origin.z);
      positions.setXYZ(1, target.x, target.y, target.z);
      positions.needsUpdate = true;
    }

    if (!lineVisible) return;
    setInspectionLine(originalAttackAxisLine, report.initialSwordBasePoint, report.initialSwordTipPoint);
    setInspectionLine(currentSwordAxisLine, report.currentSwordBasePoint, report.currentSwordTipPoint);
    setInspectionLine(currentWristGripLine, report.actualWristPoint, report.actualGripPoint);
    currentSwordAxisLine.material.color.setHex(report.attackLineClearance?.pass ? 0x61f59a : 0xffad55);
  }

  return Object.freeze({
    update,
    clear: () => update(null),
    markers: Object.freeze({
      liveTargetMarker,
      actualSwordContactMarker,
      contactTravelLine,
      originalAttackAxisLine,
      currentSwordAxisLine,
      currentWristGripLine,
    }),
  });
}
