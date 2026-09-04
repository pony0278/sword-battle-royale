import { createAnimationClip } from './animation-clip.js';
import { normalizeMotionGuide } from './motion-guide-schema.js';
import { normalizePose } from './pose-utils.js';
import { TWO_HAND_LEFT_ARM, applyTwoHandGrip } from './two-hand-grip.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function withLegs(pose, leadFoot, values) {
  const lead = leadFoot === 'L' ? 'lL' : 'lR';
  const rear = leadFoot === 'L' ? 'lR' : 'lL';
  return {
    ...pose,
    [`${lead}_hx`]: values.leadHx,
    [`${lead}_hz`]: values.leadHz,
    [`${lead}_kx`]: values.leadKx,
    [`${lead}_ax`]: values.leadAx || 0,
    [`${lead}_contact`]: values.leadContact,
    [`${rear}_hx`]: values.rearHx,
    [`${rear}_hz`]: values.rearHz,
    [`${rear}_kx`]: values.rearKx,
    [`${rear}_ax`]: values.rearAx || 0,
    [`${rear}_contact`]: values.rearContact,
  };
}

// The seven-phase left arm moved to two-hand-grip.js when the greatsword needed it: a second caller
// should not have to import a clip baker to get an arm. Same numbers, same blend - the baked clip
// is byte-identical across the move, which is the only thing that makes it a move rather than a
// change.
function withTwoHandGrip(pose, guide, phase) {
  if (!guide.twoHandGrip) return pose;
  return applyTwoHandGrip(pose, TWO_HAND_LEFT_ARM[phase], guide.secondaryGripWeight);
}

function withPlantedLeadFoot(plant, pose, guide) {
  if (!guide.footLock) return pose;
  const lead = guide.leadFoot === 'L' ? 'lL' : 'lR';
  const lockedKeys = [
    'root_pz', 'root_x', 'squat', 'pelvis_y',
    `${lead}_hx`, `${lead}_hy`, `${lead}_hz`, `${lead}_kx`,
    `${lead}_ax`, `${lead}_ty`, `${lead}_stretch`, `${lead}_contact`,
  ];
  return { ...pose, ...Object.fromEntries(lockedKeys.map((key) => [key, plant[key]])) };
}

export function advancingVerticalChopFrames(guideInput = {}) {
  const guide = normalizeMotionGuide(guideInput);
  const windupFrame = Math.max(4, guide.plantFrame - 8);
  const commitFrame = Math.max(windupFrame + 2, guide.plantFrame - 3);
  const followFrame = Math.min(guide.durationFrames - 4, guide.impactFrame + 6);
  return {
    ready: 0,
    windup: windupFrame,
    commit: commitFrame,
    plant: guide.plantFrame,
    impact: guide.impactFrame,
    follow: followFrame,
    recover: guide.durationFrames,
  };
}

export function bakeAdvancingVerticalChopClip(guideInput = {}) {
  const guide = normalizeMotionGuide(guideInput);
  const frame = advancingVerticalChopFrames(guide);
  const c = guide.coupling;
  const plane = guide.cutPlaneOffset;
  const step = guide.stepDistance;
  const lean = guide.forwardLean;
  const crouch = guide.crouchDepth;
  const windupHeight = clamp01((guide.windupHeight - 0.95) / 1.2);
  const windupPullback = clamp01(guide.windupPullback / 0.65);
  const windupCoupling = c * guide.windupLoad;
  const ready = normalizePose({
    squat: 18,
    spine_x: 4,
    head_x: 2,
    aL_sx: -24,
    aL_sy: -8,
    aL_sz: 12,
    aL_ex: 54,
    aR_sx: -72,
    aR_sy: -10,
    aR_sz: 12,
    aR_ex: 72,
    aR_wy: 18,
    lL_hx: -12,
    lL_hz: 8,
    lL_kx: 20,
    lR_hx: -12,
    lR_hz: 8,
    lR_kx: 20,
    lL_contact: 1,
    lR_contact: 1,
  });
  const windup = normalizePose(withLegs({
    ...ready,
    root_pz: -(step * 0.03 * windupCoupling + guide.windupPullback * 0.16 * windupCoupling),
    root_x: -lean * (0.18 + windupPullback * 0.24) * windupCoupling,
    squat: 18 + crouch * (0.58 + windupPullback * 0.34) * windupCoupling,
    spine_x: 4 - lean * (0.42 + windupPullback * 0.42) * windupCoupling,
    pelvis_y: -plane * 0.12 * c,
    head_x: 2 + lean * 0.3 * windupCoupling,
    head_y: plane * 0.12 * c,
    aR_sx: -118 - 48 * windupHeight - 16 * windupPullback,
    aR_sy: -8 + plane * 0.35 - windupPullback * 4,
    aR_sz: 6 + windupPullback * 6,
    aR_ex: 82 - windupHeight * 15 - windupPullback * 10,
    aR_wx: -16 - windupHeight * 16 - windupPullback * 8,
    aR_wy: 8,
    aL_sx: -50 - 18 * c,
    aL_sy: 16 - plane * 0.2,
    aL_sz: 22,
    aL_ex: 78,
  }, guide.leadFoot, {
    leadHx: 12 + 12 * c,
    leadHz: 10,
    leadKx: 38 + 18 * c,
    leadContact: 0,
    rearHx: -24,
    rearHz: 10,
    rearKx: 36 + crouch * 0.45,
    rearContact: 1,
  }));
  const commit = normalizePose(withLegs({
    ...windup,
    root_pz: step * 0.42,
    root_x: lean * 0.55 * c,
    squat: 14 + crouch * 0.72 * c,
    spine_x: 4 + lean * 0.45 * c,
    pelvis_y: plane * 0.16 * c,
    head_x: 2 - lean * 0.22 * c,
    head_y: -plane * 0.1 * c,
    aR_sx: -126,
    aR_sy: -5 + plane * 0.42,
    aR_sz: 5,
    aR_ex: 48,
    aR_wx: -10,
    aL_sx: 10 + 28 * c,
    aL_sy: -16 - plane * 0.2,
    aL_sz: 18,
    aL_ex: 42,
  }, guide.leadFoot, {
    leadHx: 26,
    leadHz: 12,
    leadKx: 44,
    leadContact: 0,
    rearHx: -8,
    rearHz: 8,
    rearKx: 22,
    rearContact: 1,
  }));
  const plant = normalizePose(withLegs({
    ...commit,
    root_pz: guide.footLock ? step : step * 0.76,
    root_x: lean * 0.78 * c,
    squat: 12 + crouch * 0.52 * c,
    spine_x: 5 + lean * 0.68 * c,
    aR_sx: -98,
    aR_sy: plane * 0.48,
    aR_ex: 31,
    aR_wx: 0,
  }, guide.leadFoot, {
    leadHx: -18,
    leadHz: 12,
    leadKx: 24,
    leadAx: 5,
    leadContact: 1,
    rearHx: 16,
    rearHz: 8,
    rearKx: 18,
    rearContact: 1,
  }));
  const impact = normalizePose(withLegs({
    ...plant,
    root_pz: step,
    root_x: lean * c,
    squat: 10 + crouch * 0.42 * c,
    spine_x: 6 + lean * 0.82 * c,
    pelvis_y: plane * 0.2 * c,
    head_x: 2 - lean * 0.4 * c,
    head_y: -plane * 0.14 * c,
    aR_sx: -66,
    aR_sy: 4 + plane * 0.55,
    aR_sz: 2,
    aR_ex: 12,
    aR_wx: 14,
    aR_wy: -8,
    aL_sx: 34 + 24 * c,
    aL_sy: -24 - plane * 0.18,
    aL_ex: 30,
  }, guide.leadFoot, {
    leadHx: -13,
    leadHz: 12,
    leadKx: 16,
    leadAx: 4,
    leadContact: 1,
    rearHx: 24,
    rearHz: 8,
    rearKx: 12,
    rearContact: 1,
  }));
  const follow = normalizePose(withLegs({
    ...impact,
    root_pz: step * 1.06,
    root_x: lean * 0.72 * c,
    squat: 14 + crouch * 0.3 * c,
    spine_x: 6 + lean * 0.5 * c,
    head_x: 2 - lean * 0.25 * c,
    aR_sx: -35,
    aR_sy: 6 + plane * 0.5,
    aR_ex: 24,
    aR_wx: 20,
    aL_sx: 22 + 16 * c,
    aL_ex: 42,
  }, guide.leadFoot, {
    leadHx: -10,
    leadHz: 10,
    leadKx: 15,
    leadContact: 1,
    rearHx: 17,
    rearHz: 8,
    rearKx: 18,
    rearContact: 1,
  }));
  const recover = normalizePose({ ...ready, root_pz: step * 0.7 });
  const plantedImpact = normalizePose(withPlantedLeadFoot(plant, impact, guide));
  const plantedFollow = normalizePose(withPlantedLeadFoot(plant, follow, guide));
  const poses = {
    ready: normalizePose(withTwoHandGrip(ready, guide, 'ready')),
    windup: normalizePose(withTwoHandGrip(windup, guide, 'windup')),
    commit: normalizePose(withTwoHandGrip(commit, guide, 'commit')),
    plant: normalizePose(withTwoHandGrip(plant, guide, 'plant')),
    impact: normalizePose(withTwoHandGrip(plantedImpact, guide, 'impact')),
    follow_through: normalizePose(withTwoHandGrip(plantedFollow, guide, 'follow')),
    recover: normalizePose(withTwoHandGrip(recover, guide, 'recover')),
  };

  return createAnimationClip({
    id: 'advancing_vertical_chop',
    name: 'Advancing Vertical Chop',
    fps: 60,
    timeline: [
      { name: 'ready', frame: frame.ready, ease: 'lin', tag: 'ready' },
      { name: 'windup', frame: frame.windup, ease: 'out', tag: 'windup' },
      { name: 'commit', frame: frame.commit, ease: 'in', tag: 'commit' },
      { name: 'plant', frame: frame.plant, ease: 'out', tag: 'lead-foot-plant' },
      { name: 'impact', frame: frame.impact, ease: 'in', tag: 'vertical-impact', impact: true },
      { name: 'follow_through', frame: frame.follow, ease: 'out', tag: 'follow-through' },
      { name: 'recover', frame: frame.recover, ease: 'out', tag: 'recover', cancel: true },
    ],
    poses,
    metadata: { motionGuide: guide },
  });
}
