export function createAttackerPresentationAdapter({
  THREE,
  attacker,
  camera,
  exchangeState,
  services,
}) {
  if (!THREE?.Vector3) throw new Error('Attacker presentation requires THREE.Vector3');
  if (!attacker?.rig || typeof attacker.sampleAnimation !== 'function') {
    throw new Error('Attacker presentation requires an attacker character');
  }
  if (!exchangeState) throw new Error('Attacker presentation requires exchange state');

  const {
    captureRigPose,
    applyRigPose,
    blendRecoveryPose,
    sampleLongswordAttackRecovery,
    sampleLiveParryOldB3ReleaseBlend,
  } = services || {};

  for (const [name, fn] of Object.entries({
    captureRigPose,
    applyRigPose,
    blendRecoveryPose,
    sampleLongswordAttackRecovery,
    sampleLiveParryOldB3ReleaseBlend,
  })) {
    if (typeof fn !== 'function') throw new Error(`Attacker presentation requires ${name}`);
  }

  function captureWorldSilhouette() {
    attacker.rig.root?.updateMatrixWorld?.(true);
    const read = (boneName) => {
      const position = new THREE.Vector3();
      attacker.rig.bones[boneName]?.getWorldPosition(position);
      return Object.freeze({ x: position.x, y: position.y, z: position.z });
    };
    const leftShoulder = read('upperarm.l');
    const rightShoulder = read('upperarm.r');
    return Object.freeze({
      hips: read('hips'),
      chest: read('chest'),
      head: read('head'),
      shoulders: Object.freeze({
        x: (leftShoulder.x + rightShoulder.x) * 0.5,
        y: (leftShoulder.y + rightShoulder.y) * 0.5,
        z: (leftShoulder.z + rightShoulder.z) * 0.5,
      }),
    });
  }

  function sampleCanonicalInterruptionPose(interruption) {
    attacker.sampleAnimation(interruption.clipId, interruption.sourceTimeSeconds, {
      loop: false,
      inPlace: interruption.inPlace !== false,
      rootRotationPolicy: interruption.rootRotationPolicy,
    });
    attacker.update(0, camera);
  }

  function captureCanonicalOldB3Base(interruption) {
    if (!interruption) return false;
    const visiblePose = captureRigPose(attacker.rig);
    sampleCanonicalInterruptionPose(interruption);
    exchangeState.canonicalAttackerOldB3Pose = captureRigPose(attacker.rig);
    exchangeState.canonicalAttackerOldB3WorldSilhouette = captureWorldSilhouette();
    applyRigPose(attacker.rig, visiblePose);
    attacker.update(0, camera);
    return true;
  }

  function sampleFrozenContactPose(interruption, { ownsLiveContact = false } = {}) {
    if (ownsLiveContact && exchangeState.frozenAttackerContactPose) {
      applyRigPose(attacker.rig, exchangeState.frozenAttackerContactPose);
    } else if (exchangeState.step3AReleaseBlend?.sourcePose && exchangeState.step3AReleaseBlend?.targetPose) {
      const releaseSample = sampleLiveParryOldB3ReleaseBlend(
        exchangeState.step3AReleaseBlend.elapsedMs,
        exchangeState.step3AReleaseBlend.durationMs,
      );
      applyRigPose(attacker.rig, blendRecoveryPose(
        exchangeState.step3AReleaseBlend.sourcePose,
        exchangeState.step3AReleaseBlend.sourcePose,
        exchangeState.step3AReleaseBlend.targetPose,
        releaseSample.progress,
        { durationMs: exchangeState.step3AReleaseBlend.durationMs, sampleDeltaMs: 0, momentumScale: 0 },
      ));
      exchangeState.step3AReleaseBlend.sample = releaseSample;
    } else if (exchangeState.canonicalAttackerOldB3Pose) {
      applyRigPose(attacker.rig, exchangeState.canonicalAttackerOldB3Pose);
    } else {
      sampleCanonicalInterruptionPose(interruption);
    }
    attacker.update(0, camera);
  }

  function createRecovery(direction) {
    const sourcePose = captureRigPose(attacker.rig);
    attacker.sampleAnimation('UAL1/Sword_Idle', 0, {
      loop: true,
      inPlace: true,
      rootRotationPolicy: 'lock',
    });
    attacker.update(0, camera);
    const targetPose = captureRigPose(attacker.rig);
    applyRigPose(attacker.rig, sourcePose);
    attacker.update(0, camera);
    return { direction, elapsedMs: 0, sourcePose, targetPose };
  }

  function sampleBase({ snapshot, deltaMs, recovery, idleClockSeconds, idleDuration, walkSample }) {
    // R19C.2: walking replaces the idle as the base clip rather than layering over it. Sampling a
    // clip restores the whole rig to rest first, so two clips cannot be mixed here - but the
    // procedural corrections that run after this still compose on top either way, which is what
    // makes a base-clip swap the right seam for locomotion.
    //
    // Which clip and at what time is decided upstream: this module is a presentation adapter and
    // deliberately imports no combat rule, so it is handed a sample rather than a gait to reason
    // about.
    if (!snapshot.action && !recovery && walkSample) {
      attacker.sampleAnimation(walkSample.clipId, walkSample.timeSeconds, {
        loop: true,
        inPlace: true,
        rootRotationPolicy: 'lock',
      });
      attacker.update(0, camera);
      return { recovery, idleClockSeconds };
    }
    if (snapshot.action) {
      const profile = snapshot.action.runtime;
      // R20M.1: sample where the clip is, not where the exchange is. For TOP and RIGHT the two are
      // the same number; LEFT's burst is stretched, so the snapshot carries the conversion and this
      // adapter keeps reasoning about neither.
      attacker.sampleAnimation(
        profile.clipId,
        Math.min(profile.sourceDurationSeconds ?? profile.durationSeconds, snapshot.sourceTimeSeconds ?? snapshot.elapsedSeconds),
        { loop: false, inPlace: true, rootRotationPolicy: 'lock' },
      );
      attacker.update(0, camera);
      return { recovery, idleClockSeconds };
    }

    if (recovery) {
      recovery.elapsedMs += deltaMs;
      const recoverySample = sampleLongswordAttackRecovery(recovery.direction, recovery.elapsedMs);
      applyRigPose(attacker.rig, blendRecoveryPose(
        recovery.sourcePose,
        recovery.sourcePose,
        recovery.targetPose,
        recoverySample.progress,
        {
          durationMs: recoverySample.profile.attackRecoveryDurationMs,
          sampleDeltaMs: 0,
          momentumScale: 0,
        },
      ));
      attacker.update(0, camera);
      return {
        recovery: recoverySample.complete ? null : recovery,
        idleClockSeconds,
      };
    }

    const nextIdleClockSeconds = idleClockSeconds + deltaMs / 1000;
    attacker.sampleAnimation(
      'UAL1/Sword_Idle',
      nextIdleClockSeconds % Math.max(0.001, idleDuration),
      { loop: true, inPlace: true, rootRotationPolicy: 'lock' },
    );
    attacker.update(0, camera);
    return { recovery: null, idleClockSeconds: nextIdleClockSeconds };
  }

  return Object.freeze({
    captureWorldSilhouette,
    captureCanonicalOldB3Base,
    sampleFrozenContactPose,
    createRecovery,
    sampleBase,
  });
}
