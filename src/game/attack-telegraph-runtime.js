import {
  ATTACK_TELEGRAPH_STAGE,
  planAttackTelegraph,
  telegraphDurationMs,
} from '../combat/attack-telegraph.js';

// R21F.1: the stance, written onto the attacker's rig.
//
// Presentation only, and structurally so: it samples the attack's own clip at one source time,
// mixes that pose over whatever the attacker was already showing, and puts the visible pose back.
// It starts no attack, resolves no contact and touches no clock but its own - the caller asks
// whether the stance has finished and decides for itself what to do about it.
export function createAttackTelegraphRuntime({ attacker, camera = null, services, profile } = {}) {
  const { captureRigPose, applyRigPose, blendRecoveryPose } = services || {};
  if (!attacker?.rig || typeof attacker.sampleAnimation !== 'function') {
    throw new Error('R21F.1 telegraph needs an attacker character');
  }
  for (const [name, fn] of Object.entries({ captureRigPose, applyRigPose, blendRecoveryPose })) {
    if (typeof fn !== 'function') throw new Error(`R21F.1 telegraph requires ${name}`);
  }

  let direction = null;
  let elapsedMs = 0;
  let lastPlan = null;
  // Sampled once per stance rather than per frame: the pose is a fixed frame of a fixed clip, and
  // re-sampling it every frame would cost a clip evaluation to get the same answer back.
  let heldPose = null;

  function report() {
    return Object.freeze({
      stage: ATTACK_TELEGRAPH_STAGE,
      active: direction != null,
      direction,
      elapsedMs,
      durationMs: telegraphDurationMs(profile),
      phase: lastPlan?.phase ?? 'done',
      weight: lastPlan?.weight ?? 0,
      released: lastPlan?.released ?? true,
    });
  }

  return Object.freeze({
    // Begins the stance for a direction. Sampling the held pose here means the one clip evaluation
    // happens on the frame the opponent commits, not inside the frame loop's hot path.
    begin(nextDirection) {
      const plan = planAttackTelegraph({ direction: nextDirection, elapsedMs: 0, profile });
      if (!plan.direction) { direction = null; heldPose = null; lastPlan = null; return null; }
      const visible = captureRigPose(attacker.rig);
      attacker.sampleAnimation(plan.clipId, plan.sourceSeconds, { loop: false, inPlace: true });
      heldPose = captureRigPose(attacker.rig);
      applyRigPose(attacker.rig, visible); // put back what was on screen; the frame loop mixes in
      direction = plan.direction;
      elapsedMs = 0;
      lastPlan = plan;
      return report();
    },
    // Call after whatever else posed the attacker this frame - the stance mixes OVER the idle
    // pose, so it has to be the later writer.
    sample(deltaMs) {
      if (direction == null) return null;
      elapsedMs += Math.max(0, Number(deltaMs) || 0);
      lastPlan = planAttackTelegraph({ direction, elapsedMs, profile });
      if (lastPlan.weight > 0 && heldPose) {
        const visible = captureRigPose(attacker.rig);
        applyRigPose(attacker.rig, blendRecoveryPose(visible, visible, heldPose, lastPlan.weight));
        attacker.update(0, camera);
      }
      return lastPlan;
    },
    clear() { direction = null; elapsedMs = 0; lastPlan = null; heldPose = null; return report(); },
    get active() { return direction != null; },
    get released() { return direction == null || lastPlan?.released === true; },
    get plan() { return lastPlan; },
    get report() { return report(); },
  });
}
