import { readFile, writeFile } from 'node:fs/promises';

const url = new URL('../../tests/shield-parry-r281-active-intercept-runtime.test.js', import.meta.url);
let source = await readFile(url, 'utf8');

function replaceOne(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  source = source.replace(before, after);
}

replaceOne(
  "import { createPredictiveInterceptParryPresentationRuntime } from '../src/combat/predictive-intercept-parry.js';",
  "import { createPredictiveInterceptParryPresentationRuntime } from '../src/combat/predictive-intercept-parry.js';\nimport {\n  R18N_ACTIVE_INTERCEPT_PRESERVED_BONES,\n  R18N_UPPER_BODY_ANTICIPATION_BONES,\n} from '../src/combat/predictive-parry-ownership-policy.js';",
  'ownership policy test import',
);

const oldBlock = `test('R18N.1 lets active intercept tracking own the full shield support chain while unrelated presentation continues', () => {\n  const shieldSupportChain = [\n    'root', 'hips', 'spine', 'chest',\n    'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',\n  ];\n  const { bones, character } = fakePresentationCharacter([...shieldSupportChain, 'head']);\n  const runtime = createPredictiveInterceptParryPresentationRuntime(\n    { Quaternion: FakeQuaternion },\n    { character, guardOffsets: {} },\n  );\n  assert.equal(runtime.start({ sequence: 2, requestedGrade: 'parry', triggerTtcSeconds: 0.12 }).accepted, true);\n\n  const report = runtime.update({\n    deltaSeconds: 0.01,\n    timeToContactSeconds: 0.11,\n    preserveShieldArm: true,\n  });\n\n  assert.equal(report.shieldArmOwnership, 'external-active-intercept-tracking');\n  for (const boneId of shieldSupportChain) {\n    assert.ok(angleDegrees(bones[boneId].quaternion) < 1e-6, \`${'${boneId}'} was overwritten by presentation\`);\n  }\n  assert.ok(angleDegrees(bones.head.quaternion) > 0, 'unrelated presentation should keep advancing');\n});`;

const newBlock = `test('R18N.4.2 splits predictive torso anticipation from active intercept arm authority', () => {\n  assert.deepEqual([...R18N_UPPER_BODY_ANTICIPATION_BONES], ['spine', 'chest']);\n  assert.deepEqual([...R18N_ACTIVE_INTERCEPT_PRESERVED_BONES], [\n    'root', 'hips', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l',\n  ]);\n\n  const preserved = [...R18N_ACTIVE_INTERCEPT_PRESERVED_BONES];\n  const anticipation = [...R18N_UPPER_BODY_ANTICIPATION_BONES];\n  const { bones, character } = fakePresentationCharacter([...preserved, ...anticipation, 'head']);\n  const runtime = createPredictiveInterceptParryPresentationRuntime(\n    { Quaternion: FakeQuaternion },\n    { character, guardOffsets: {} },\n  );\n  assert.equal(runtime.start({ sequence: 2, requestedGrade: 'parry', triggerTtcSeconds: 0.12 }).accepted, true);\n\n  const report = runtime.update({\n    deltaSeconds: 0.01,\n    timeToContactSeconds: 0.11,\n    preserveShieldArm: true,\n  });\n\n  assert.equal(report.shieldArmOwnership, 'external-active-intercept-tracking');\n  assert.equal(report.upperBodyAnticipationOwnership, 'predictive-presentation-spine-chest');\n  for (const boneId of preserved) {\n    assert.ok(angleDegrees(bones[boneId].quaternion) < 1e-6, \`${'${boneId}'} must remain under active-intercept/guard authority\`);\n  }\n  for (const boneId of anticipation) {\n    const angle = angleDegrees(bones[boneId].quaternion);\n    assert.ok(angle > 0, \`${'${boneId}'} should retain predictive Parry anticipation\`);\n    assert.ok(angle < 90, \`${'${boneId}'} should still respect entry blending\`);\n  }\n  assert.ok(angleDegrees(bones.head.quaternion) > 0, 'unrelated presentation should keep advancing');\n});`;

replaceOne(oldBlock, newBlock, 'ownership split runtime test');
replaceOne(
  "  assert.match(source, /external-active-intercept-tracking/);\n  assert.doesNotMatch(source, /probeSweptSwordBucklerContact|combat\\.resolveContact|parryGate\\.confirm/);",
  "  assert.match(source, /external-active-intercept-tracking/);\n  assert.match(source, /predictive-parry-ownership-policy/);\n  assert.match(source, /predictive-presentation-spine-chest/);\n  assert.doesNotMatch(source, /probeSweptSwordBucklerContact|combat\\.resolveContact|parryGate\\.confirm/);",
  'presentation-only source contract',
);

await writeFile(url, source);
console.log('R18N.4.2 ownership regression migration complete');
