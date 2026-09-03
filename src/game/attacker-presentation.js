import { filterPoseToShieldArm } from '../combat/shield-arm-hold.js'; // R24H.1

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
    // R24E.1 (#26): optional. Paints the pose the body will resume in once the recovery hands it
    // back - the held guard, for a fighter whose guard machine is in HOLD - and returns it, or
    // returns null when there is nothing to resume, in which case the recovery settles into the
    // idle as before.
    captureResumePose,
  } = services || {};
  // R24H.1 (#38): the held guard's shield arm, as an overlay. Captured through the same
  // captureResumePose service - which paints the guard onto the rig - so the visible pose is
  // saved first and put back after, exactly as createRecovery does.
  function captureShieldArmPose() {
    if (typeof captureResumePose !== 'function') return null;
    const visiblePose = captureRigPose(attacker.rig);
    const resumePose = captureResumePose();
    if (!resumePose) return null;
    applyRigPose(attacker.rig, visiblePose);
    attacker.update(0, camera);
    return filterPoseToShieldArm(resumePose);
  }
  // The overlay itself: the last writer on these five bones before the caller's repaint. A partial
  // pose only writes the bones it names, so the swing keeps the torso it turned.
  function overlayShieldArm(shieldArmPose) {
    if (!shieldArmPose) return false;
    applyRigPose(attacker.rig, shieldArmPose);
    attacker.update(0, camera);
    return true;
  }

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

  function sampleFrozenContactPose(interruption, { ownsLiveContact = false, shieldArmPose = null } = {}) {
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
    // R24H.1: the frozen contact pose froze the shield arm wherever the swing had flung it, for
    // 18-41 frames. A held shield holds through the contact too.
    overlayShieldArm(shieldArmPose);
  }

  function createRecovery(direction) {
    const sourcePose = captureRigPose(attacker.rig);
    // R24E.1 (#26): the recovery blends toward where the body is GOING, not toward the idle it
    // will never show. Measured before: an opponent holding their guard recovered into Sword_Idle
    // over 0.5s and then, on the first frame the guard painted again, jumped 24cm at the chest and
    // 45/56cm at the hands - the whole guard, in one frame, right after a blend whose only purpose
    // was to avoid exactly that. The player's held block did the same on their own swing.
    const resumePose = typeof captureResumePose === 'function' ? captureResumePose() : null;
    if (!resumePose) {
      attacker.sampleAnimation('UAL1/Sword_Idle', 0, {
        loop: true,
        inPlace: true,
        rootRotationPolicy: 'lock',
      });
      attacker.update(0, camera);
    }
    const targetPose = resumePose || captureRigPose(attacker.rig);
    applyRigPose(attacker.rig, sourcePose);
    attacker.update(0, camera);
    return { direction, elapsedMs: 0, sourcePose, targetPose, resumes: resumePose ? 'guard' : 'idle' };
  }

  function sampleBase({ snapshot, deltaMs, recovery, idleClockSeconds, idleDuration, walkSample, shieldArmPose = null }) {
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
      overlayShieldArm(shieldArmPose); // R24H.1: the swing owns the sword arm and the body, not the shield
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
      // R24H.1: with the arm already at the guard, the recovery has nothing to whip - the blend
      // still moves the body, and the overlay pins the arm where it stayed.
      overlayShieldArm(shieldArmPose);
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
    captureShieldArmPose,
    sampleFrozenContactPose,
    createRecovery,
    sampleBase,
  });
}
