import { normalizePose } from './pose-utils.js';

export const WHOLE_BODY_DRAG_EFFECTORS = Object.freeze([
  'handL', 'handR', 'footL', 'footR',
]);

export const WHOLE_BODY_JOINT_EFFECTORS = Object.freeze([
  'elbowL', 'elbowR', 'kneeL', 'kneeR',
]);

const EFFECTOR_CHAINS = Object.freeze({
  handL: Object.freeze({ prefix: 'aL', kind: 'arm' }),
  handR: Object.freeze({ prefix: 'aR', kind: 'arm' }),
  footL: Object.freeze({ prefix: 'lL', kind: 'leg' }),
  footR: Object.freeze({ prefix: 'lR', kind: 'leg' }),
  elbowL: Object.freeze({ prefix: 'aL', kind: 'arm' }),
  elbowR: Object.freeze({ prefix: 'aR', kind: 'arm' }),
  kneeL: Object.freeze({ prefix: 'lL', kind: 'leg' }),
  kneeR: Object.freeze({ prefix: 'lR', kind: 'leg' }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value, label) {
  const result = {
    x: Number(value?.x),
    y: Number(value?.y),
    z: Number(value?.z),
  };
  if (!Number.isFinite(result.x) || !Number.isFinite(result.y) || !Number.isFinite(result.z)) {
    throw new Error(`Whole-body drag evaluator returned an invalid ${label} point`);
  }
  return result;
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function armSpecs(prefix, maxStretch) {
  return [
    [`${prefix}_sx`, -180, 80, 24, 90],
    [`${prefix}_sy`, -140, 140, 24, 90],
    [`${prefix}_sz`, -110, 110, 20, 80],
    [`${prefix}_ex`, -15, 165, 22, 85],
    [`${prefix}_wx`, -120, 120, 16, 80],
    [`${prefix}_wy`, -120, 120, 16, 80],
    [`${prefix}_wz`, -120, 120, 16, 80],
    [`${prefix}_stretch`, 0.72, maxStretch, 0.025, 0.08],
  ];
}

function legSpecs(prefix, maxStretch) {
  return [
    [`${prefix}_hx`, -130, 130, 22, 90],
    [`${prefix}_hy`, -100, 100, 18, 75],
    [`${prefix}_hz`, -100, 100, 18, 75],
    [`${prefix}_kx`, -15, 165, 22, 85],
    [`${prefix}_ax`, -100, 100, 16, 70],
    [`${prefix}_ty`, -100, 100, 16, 70],
    [`${prefix}_stretch`, 0.72, maxStretch, 0.025, 0.08],
  ];
}

function bodySpecs(reference, coupling, allowVerticalRoot) {
  const scale = 0.28 + coupling * 0.72;
  const specs = [
    ['root_pz', clamp(reference.root_pz - 0.7, -1.2, 2), clamp(reference.root_pz + 0.7, -1.2, 2), 0.07 * scale, 0.5],
    ['root_x', -65, 65, 7 * scale, 45],
    ['root_y', -100, 100, 8 * scale, 60],
    ['spine_x', -70, 70, 8 * scale, 45],
    ['spine_y', -90, 90, 9 * scale, 55],
    ['pelvis_y', -90, 90, 9 * scale, 55],
    ['squat', 0, 80, 7 * scale, 45],
  ];
  if (allowVerticalRoot) {
    specs.push([
      'root_py',
      clamp(reference.root_py - 0.55, -0.8, 0.8),
      clamp(reference.root_py + 0.55, -0.8, 0.8),
      0.055 * scale,
      0.45,
    ]);
  }
  return specs;
}

function uniqueSpecs(groups) {
  const seen = new Set();
  const result = [];
  groups.flat().forEach((spec) => {
    if (seen.has(spec[0])) return;
    seen.add(spec[0]);
    result.push(spec);
  });
  return result;
}

function regularization(pose, reference, specs) {
  return specs.reduce((total, [key, _min, _max, _step, normalizer]) => {
    const delta = (pose[key] - reference[key]) / Math.max(0.001, normalizer);
    return total + delta * delta;
  }, 0);
}

function improvePose(seedPose, specs, scorePose, passes, decay = 0.58) {
  const candidate = { ...seedPose };
  specs.forEach(([key, min, max]) => {
    candidate[key] = clamp(finite(candidate[key], 0), min, max);
  });
  let bestScore = scorePose(candidate);

  for (let pass = 0; pass < passes; pass += 1) {
    const stepScale = decay ** pass;
    for (const [key, min, max, baseStep] of specs) {
      const startValue = candidate[key];
      let bestValue = startValue;
      for (const direction of [-1, 1]) {
        candidate[key] = clamp(startValue + direction * baseStep * stepScale, min, max);
        const score = scorePose(candidate);
        if (score < bestScore) {
          bestScore = score;
          bestValue = candidate[key];
        }
      }
      candidate[key] = bestValue;
    }
  }
  return { pose: candidate, score: bestScore };
}

function createScore({
  evaluatePose,
  effector,
  target,
  pins,
  secondaryTargets,
  reference,
  regularizedSpecs,
  pinWeight,
  regularizationWeight,
}) {
  return (pose) => {
    const evaluated = evaluatePose(pose);
    let score = distanceSquared(point(evaluated[effector], effector), target);
    for (const [pinEffector, pinTarget] of Object.entries(pins)) {
      score += distanceSquared(point(evaluated[pinEffector], pinEffector), pinTarget) * pinWeight;
    }
    for (const [secondaryEffector, constraint] of Object.entries(secondaryTargets)) {
      score += distanceSquared(point(evaluated[secondaryEffector], secondaryEffector), constraint.target)
        * constraint.weight;
    }
    score += regularization(pose, reference, regularizedSpecs) * regularizationWeight;
    return score;
  };
}

export function solveWholeBodyDragPose(options = {}) {
  const {
    evaluatePose,
    effector,
    target: targetInput,
    pinnedFeet = {},
  } = options;
  if (typeof evaluatePose !== 'function') throw new Error('Whole-body drag requires an evaluatePose function');
  const chain = EFFECTOR_CHAINS[effector];
  if (!chain) throw new Error(`Unknown whole-body drag effector: ${effector}`);

  const coupling = clamp(finite(options.coupling, 0.85), 0, 1);
  const maxStretch = clamp(finite(options.maxStretch, 1.05), 1, 1.12);
  const passes = Math.round(clamp(finite(options.passes, 4), 1, 10));
  const activationDistance = clamp(finite(options.activationDistance, 0.025), 0, 0.25);
  const reference = normalizePose(options.referencePose || options.pose);
  const seed = normalizePose(options.seedPose || options.pose || reference);
  const target = point(targetInput, 'target');
  const pins = {};
  for (const pinEffector of ['footL', 'footR']) {
    if (pinEffector === effector || !pinnedFeet?.[pinEffector]) continue;
    pins[pinEffector] = point(pinnedFeet[pinEffector], `${pinEffector} pin`);
  }
  const secondaryTargets = {};
  for (const [secondaryEffector, constraintInput] of Object.entries(options.secondaryTargets || {})) {
    const constraint = constraintInput?.target ? constraintInput : { target: constraintInput };
    secondaryTargets[secondaryEffector] = {
      target: point(constraint.target, `${secondaryEffector} secondary target`),
      weight: clamp(finite(constraint.weight, 2), 0, 10),
    };
  }

  const localSpecs = chain.kind === 'arm'
    ? armSpecs(chain.prefix, maxStretch)
    : legSpecs(chain.prefix, maxStretch);
  const supportSpecs = Object.keys(pins).map((pinEffector) => (
    legSpecs(EFFECTOR_CHAINS[pinEffector].prefix, maxStretch)
  ));
  const allSupportSpecs = uniqueSpecs(supportSpecs);
  const localScore = createScore({
    evaluatePose,
    effector,
    target,
    pins: {},
    secondaryTargets: {},
    reference,
    regularizedSpecs: localSpecs,
    pinWeight: 0,
    regularizationWeight: 0.0015,
  });
  let result = improvePose(seed, localSpecs, localScore, passes);
  if (Object.keys(secondaryTargets).length) {
    const anchoredLocalScore = createScore({
      evaluatePose,
      effector,
      target,
      pins: {},
      secondaryTargets,
      reference,
      regularizedSpecs: localSpecs,
      pinWeight: 0,
      regularizationWeight: 0.0015,
    });
    result = improvePose(result.pose, localSpecs, anchoredLocalScore, passes);
  }
  let evaluated = evaluatePose(result.pose);
  let targetError = Math.sqrt(distanceSquared(point(evaluated[effector], effector), target));
  const activatedWholeBody = options.allowWholeBody !== false
    && coupling > 0.01
    && targetError > activationDistance;

  if (activatedWholeBody) {
    const coupledBodySpecs = bodySpecs(reference, coupling, Object.keys(pins).length === 0);
    const coupledSpecs = uniqueSpecs([localSpecs, coupledBodySpecs, allSupportSpecs]);
    const coupledScore = createScore({
      evaluatePose,
      effector,
      target,
      pins,
      secondaryTargets,
      reference,
      regularizedSpecs: coupledSpecs,
      pinWeight: 0.65 + coupling * 0.55,
      regularizationWeight: 0.002 + (1 - coupling) * 0.018,
    });
    result = improvePose(result.pose, coupledSpecs, coupledScore, passes);

    if (allSupportSpecs.length) {
      const settleSpecs = uniqueSpecs([localSpecs, allSupportSpecs]);
      const settleScore = createScore({
        evaluatePose,
        effector,
        target,
        pins,
        secondaryTargets,
        reference,
        regularizedSpecs: settleSpecs,
        pinWeight: 7,
        regularizationWeight: 0.001,
      });
      result = improvePose(result.pose, settleSpecs, settleScore, passes);
    }
  }

  const pose = normalizePose(result.pose);
  const finalEvaluation = evaluatePose(pose);
  const referenceEvaluation = evaluatePose(reference);
  targetError = Math.sqrt(distanceSquared(point(finalEvaluation[effector], effector), target));
  const pinErrors = Object.fromEntries(Object.entries(pins).map(([pinEffector, pinTarget]) => [
    pinEffector,
    Math.sqrt(distanceSquared(point(finalEvaluation[pinEffector], pinEffector), pinTarget)),
  ]));
  const secondaryErrors = Object.fromEntries(Object.entries(secondaryTargets).map(([secondaryEffector, constraint]) => [
    secondaryEffector,
    Math.sqrt(distanceSquared(point(finalEvaluation[secondaryEffector], secondaryEffector), constraint.target)),
  ]));

  return {
    pose,
    targetError,
    pinErrors,
    secondaryErrors,
    activatedWholeBody,
    bodyLift: finalEvaluation.hips && referenceEvaluation.hips
      ? point(finalEvaluation.hips, 'hips').y - point(referenceEvaluation.hips, 'reference hips').y
      : 0,
  };
}
