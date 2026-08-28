import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKYRIM_BONE_RETARGETS,
  classifySkyrimTranslationSafety,
  computeSkyrimTranslationScale,
  measureVectorSampleExcursion,
  resolveSkyrimSourceNodes,
  validateSkyrimTargetRig,
} from '../src/animation/skyrim-animation-retarget.js';

class FakeNode {
  constructor(name = '') {
    this.name = name;
    this.children = [];
    this.parent = null;
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  traverse(visitor) {
    visitor(this);
    this.children.forEach((child) => child.traverse(visitor));
  }

  getObjectByName(name) {
    let found = null;
    this.traverse((node) => {
      if (!found && node.name === name) found = node;
    });
    return found;
  }
}

function fullSkyrimHierarchy(useFallbackAliases = false) {
  const root = new FakeNode('SOURCE');
  for (const mapping of SKYRIM_BONE_RETARGETS) {
    const alias = useFallbackAliases
      ? mapping.sourceAliases[Math.min(1, mapping.sourceAliases.length - 1)]
      : mapping.sourceAliases[0];
    root.add(new FakeNode(alias));
  }
  return root;
}

function sanitizedGlbHierarchy() {
  const root = new FakeNode('SOURCE');
  for (const mapping of SKYRIM_BONE_RETARGETS) {
    const sanitized = mapping.sourceAliases[0]
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    root.add(new FakeNode(sanitized));
  }
  return root;
}

test('Skyrim retarget map now covers the full canonical Action Studio humanoid arm/socket chain', () => {
  const targets = SKYRIM_BONE_RETARGETS.map((entry) => entry.target);
  assert.equal(SKYRIM_BONE_RETARGETS.length, 23);
  assert.equal(new Set(targets).size, targets.length);
  assert.deepEqual(targets.slice(0, 5), ['root', 'hips', 'spine', 'chest', 'head']);
  assert.ok(targets.includes('upperarm.l'));
  assert.ok(targets.includes('lowerarm.r'));
  assert.ok(targets.includes('hand.l'));
  assert.ok(targets.includes('hand.r'));
  assert.ok(targets.includes('handslot.l'));
  assert.ok(targets.includes('handslot.r'));
  assert.ok(targets.includes('upperleg.l'));
  assert.ok(targets.includes('toes.r'));
});

test('G2.4.3 constrains shoulder-to-elbow and elbow-to-wrist directions instead of trusting rest-axis parity', () => {
  const upperRight = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'upperarm.r');
  const lowerRight = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'lowerarm.r');
  const upperLeft = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'upperarm.l');
  const lowerLeft = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'lowerarm.l');
  assert.deepEqual(
    [upperRight.directionEndId, upperRight.directionTargetChild],
    ['lowerarm.r', 'lowerarm.r'],
  );
  assert.deepEqual(
    [lowerRight.directionEndId, lowerRight.directionTargetChild],
    ['wrist.r', 'wrist.r'],
  );
  assert.deepEqual(
    [upperLeft.directionEndId, upperLeft.directionTargetChild],
    ['lowerarm.l', 'lowerarm.l'],
  );
  assert.deepEqual(
    [lowerLeft.directionEndId, lowerLeft.directionTargetChild],
    ['wrist.l', 'wrist.l'],
  );
});

test('G2.4.3 maps Skyrim hand and equipment helpers through the actual KayKit handslot chain', () => {
  const handR = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'hand.r');
  const handslotR = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'handslot.r');
  const handL = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'hand.l');
  const handslotL = SKYRIM_BONE_RETARGETS.find((entry) => entry.id === 'handslot.l');
  assert.equal(handR.target, 'hand.r');
  assert.ok(handR.sourceAliases.includes('NPC R Hand [RHnd]'));
  assert.equal(handslotR.target, 'handslot.r');
  assert.ok(handslotR.sourceAliases.includes('Weapon'));
  assert.equal(handslotR.helper, 'weapon');
  assert.equal(handL.target, 'hand.l');
  assert.ok(handL.sourceAliases.includes('NPC L Hand [LHnd]'));
  assert.equal(handslotL.target, 'handslot.l');
  assert.ok(handslotL.sourceAliases.includes('Shield'));
  assert.equal(handslotL.helper, 'shield');
});

test('Skyrim mapping isolates root motion from pelvis-relative body translation', () => {
  const positional = SKYRIM_BONE_RETARGETS.filter((entry) => entry.position);
  assert.deepEqual(positional.map((entry) => entry.target), ['root', 'hips']);
  assert.equal(positional.find((entry) => entry.target === 'root').positionSpace, 'world-root');
  assert.equal(positional.find((entry) => entry.target === 'hips').positionSpace, 'root-relative');
  assert.equal(SKYRIM_BONE_RETARGETS.find((entry) => entry.target === 'upperarm.r').position, undefined);
});

test('Skyrim translation scale preserves real cross-unit skeleton ratios instead of clamping to 0.5', () => {
  const scale = computeSkyrimTranslationScale(120, 1.24);
  assert.ok(scale > 0.01 && scale < 0.011);
  assert.notEqual(scale, 0.5);
  assert.equal(computeSkyrimTranslationScale(0, 1.24), 1);
});

test('translation excursion catches a mid-clip flight even when start and end positions match', () => {
  const metrics = measureVectorSampleExcursion([
    0, 0, 0,
    0.02, 0.01, 0,
    50, 0, 0,
    0, 0, 0,
  ]);
  assert.equal(metrics.sampleCount, 4);
  assert.ok(metrics.maxExcursion >= 50);
  assert.ok(metrics.maxStep > 49);

  const safety = classifySkyrimTranslationSafety({
    root: metrics,
    hips: measureVectorSampleExcursion([0, 0.4, 0, 0, 0.41, 0]),
  }, 1.24);
  assert.equal(safety.safe, false);
  assert.ok(safety.excursionRatio > 40);
});

test('small guard body motion remains translation-safe', () => {
  const safety = classifySkyrimTranslationSafety({
    root: measureVectorSampleExcursion([0, 0, 0, 0.01, 0, 0, 0, 0, 0]),
    hips: measureVectorSampleExcursion([0, 0.4, 0, 0.01, 0.42, 0, 0, 0.4, 0]),
  }, 1.24);
  assert.equal(safety.safe, true);
  assert.ok(safety.excursionRatio < 0.1);
});

test('Skyrim source resolver accepts canonical Skyrim bone and equipment-helper names', () => {
  const report = resolveSkyrimSourceNodes(fullSkyrimHierarchy(false));
  assert.equal(report.valid, true);
  assert.deepEqual(report.missing, []);
  assert.equal(Object.keys(report.nodes).length, SKYRIM_BONE_RETARGETS.length);
  assert.equal(report.nodes.root.name, 'NPC Root [Root]');
  assert.equal(report.nodes.pelvis.name, 'NPC Pelvis [Pelv]');
  assert.equal(report.nodes['upperarm.l'].name, 'NPC L UpperArm [LUar]');
  assert.equal(report.nodes['hand.r'].name, 'NPC R Hand [RHnd]');
  assert.equal(report.nodes['handslot.r'].name, 'Weapon');
});

test('Skyrim source resolver accepts common exporter aliases after HKX conversion', () => {
  const report = resolveSkyrimSourceNodes(fullSkyrimHierarchy(true));
  assert.equal(report.valid, true);
  assert.deepEqual(report.missing, []);
});

test('Skyrim source resolver accepts GLB-sanitized names with spaces and bracket tags rewritten', () => {
  const report = resolveSkyrimSourceNodes(sanitizedGlbHierarchy());
  assert.equal(report.valid, true);
  assert.deepEqual(report.missing, []);
  assert.equal(report.nodes['upperarm.l'].name, 'NPC_L_UpperArm_LUar');
});

test('Skyrim source resolver reports semantic targets when a required source is absent', () => {
  const root = fullSkyrimHierarchy(false);
  root.children = root.children.filter((node) => node.name !== 'NPC R Forearm [RLar]');
  const report = resolveSkyrimSourceNodes(root);
  assert.equal(report.valid, false);
  assert.deepEqual(report.missing, ['lowerarm.r']);
});

test('Action Studio target validation includes hand and handslot targets', () => {
  const completeBones = Object.fromEntries(SKYRIM_BONE_RETARGETS.map(({ target }) => [target, {}]));
  assert.deepEqual(validateSkyrimTargetRig({ bones: completeBones }), { valid: true, missing: [] });

  delete completeBones['handslot.r'];
  const report = validateSkyrimTargetRig({ bones: completeBones });
  assert.equal(report.valid, false);
  assert.deepEqual(report.missing, ['handslot.r']);
});
