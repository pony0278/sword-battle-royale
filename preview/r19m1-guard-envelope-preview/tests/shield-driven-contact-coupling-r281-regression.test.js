import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);
const contactLifecycleDirectorSource = await readFile(
  new URL('../src/combat/contact-lifecycle-director.js', import.meta.url),
  'utf8',
);
const parryInterceptDirectorSource = await readFile(
  new URL('../src/combat/parry-intercept-director.js', import.meta.url),
  'utf8',
);
const preContactSource = await readFile(
  new URL('../src/game/pre-contact-controller.js', import.meta.url),
  'utf8',
);
const contactHandoffSource = await readFile(
  new URL('../src/game/contact-handoff-controller.js', import.meta.url),
  'utf8',
);
const verificationReportSource = await readFile(
  new URL('../tools/action-studio/shield-parry-r281/verification-report.js', import.meta.url),
  'utf8',
);
const html = await readFile(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url),
  'utf8',
);

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return text.slice(start, end);
}

function sliceFunction(text, startMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing function marker: ${startMarker}`);
  const openBrace = text.indexOf('{', start);
  assert.notEqual(openBrace, -1, `missing function body: ${startMarker}`);
  let depth = 0;
  for (let index = openBrace; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function body: ${startMarker}`);
}

test('R18M.1 baseline targets the actual R18I5 R281 browser entry', () => {
  assert.match(
    html,
    /<script type="module" src="\.\/shield-driven-contact-coupling-lab-r281\.js\?v=g43b5r281-split-the-mistiming-r21g3"><\/script>/,
  );
  assert.match(html, /BUILD R18I5 TOP\/RIGHT/);
  assert.match(html, /LEFT release (?:仍)?(?:暫緩|deferred)/);
});

test('R18M.1 locks manual Parry input and authored commitment\/TTC authority', () => {
  assert.match(source, /const parryGate = createCommittedParryContactGate\(\);/);
  assert.match(source, /(?:exchangeState\.)?latestParryInput = parryGate\.arm\(\{/);
  assert.match(source, /manual: true,/);
  // R18S.4: the confirmation decision lives in the lifecycle director; the lab injects the gate.
  assert.match(contactLifecycleDirectorSource, /confirmation = \(selectedMode === 'parry' \|\| readParryArmed\?\.\(\) === true\)[\s\S]*confirmParry\(\{/);
  assert.match(contactHandoffSource, /confirmParry: \(input\) => parryGate\.confirm\(input\)/);
  assert.match(html, /Input authority<\/span><b>manual PARRY NOW<\/b>/);
  assert.match(html, /Attack commitment<\/span><b>authored movementStartSeconds<\/b>/);
  assert.match(html, /Valid TTC<\/span><b>60–180 ms<\/b>/);
  assert.match(html, /Invalid \/ no input<\/span><b>falls back to BLOCK<\/b>/);
});

test('R18M.1 locks predictive\/measured pre-contact guidance without granting success authority', () => {
  // R18S.3: the analysis and the gate stay with the lab; the reach ladder they feed is the
  // director's, and the guidance-only contract holds on both sides of that seam.
  assert.match(preContactSource, /analyzePredictiveInterceptParry\(\{/);
  assert.match(parryInterceptDirectorSource, /selectReachableParryInterceptTarget\(\{/);
  assert.match(parryInterceptDirectorSource, /measureSweptSwordBucklerClosestApproach\(\{/);
  assert.match(parryInterceptDirectorSource, /bodyReachRuntime\.update\(\{ mode: 'parry'/);
  assert.match(parryInterceptDirectorSource, /stanceRuntime\.update\(\{\s*\n\s*mode: 'parry'/);
  assert.match(parryInterceptDirectorSource, /reach-guidance-only-real-swept-contact-still-decides/);
  assert.match(html, /unreachable linear target may fall back to measured current sweep/);
  assert.match(html, /guidance · cannot veto input/);
  assert.match(html, /Success authority<\/span><b>real swept Sword × Shield contact<\/b>/);
});

test('R18M.1 locks real swept contact → Parry confirmation → combat resolution → live grip ownership', () => {
  // R18S.4: the sequence is the lifecycle director's now, and it holds under the injected names.
  const body = sliceBetween(contactLifecycleDirectorSource, 'function resolveContact(', 'function advanceCombat(');

  assert.match(body, /probeSweptSwordBucklerContact\(\{/);
  assert.match(body, /if \(!contactEvaluation\.contact\)/);
  assert.match(body, /confirmParry\(\{ attackSnapshot, contact: contactEvaluation \}\)/);
  assert.match(body, /combatResult = resolveCombat\(\{/);
  assert.match(body, /gripReport = gripConstraint\.start\(\{/);
  assert.match(body, /reactionIntentActiveAtImpact: true,/);
  assert.match(body, /b3BodyClockStartedAtImpact: true,/);
  assert.match(body, /contactConstraintOwnsUntilDeflectImpulse: true,/);
  assert.match(body, /weaponArmContactConstrained: true,/);
  assert.match(body, /contactBasePoseAuthority: 'authoritative-impact-rig-snapshot'/);

  const probeIndex = body.indexOf('probeSweptSwordBucklerContact({');
  const confirmIndex = body.indexOf('confirmParry({');
  const resolveIndex = body.indexOf('resolveCombat({');
  const gripIndex = body.indexOf('gripConstraint.start({');
  assert.ok(probeIndex < confirmIndex, 'real contact probe must precede Parry confirmation');
  assert.ok(confirmIndex < resolveIndex, 'Parry confirmation must precede combat resolution');
  assert.ok(resolveIndex < gripIndex, 'combat resolution must precede live Sword\/Grip ownership');
});

test('R18M.1 locks DEFLECT_IMPULSE release, confirmed-Parry fail-safe, continuity bridge, and OLD B3 handoff', () => {
  const body = sliceBetween(contactLifecycleDirectorSource, 'function release({ selectedDirection', 'function resolveContact(');

  assert.match(body, /const gate = defenderReleaseGate\(\);/);
  assert.match(body, /reason: 'defender-deflect-marker-not-reached'/);
  assert.match(contactLifecycleDirectorSource, /marker: 'deflect-impulse'/);
  assert.match(body, /buildLiveParryOldB3Handoff\(\{/);
  assert.match(body, /allowConfirmedParryFallback: true,/);
  assert.match(body, /publishPostCouplingRecoilStaggerHandoff\(attackerRig, \{/);
  assert.match(body, /releaseBlend = \{/);
  assert.match(body, /durationMs: handoff\.releaseBlendMs,/);
  assert.match(body, /targetPose: contactBasePose,/);
  assert.match(body, /const releaseSourcePose = \{ \.\.\.contactBasePose \};/);
  assert.match(body, /visibleOldB3BodyStartedAtImpact: true,/);
  assert.match(body, /weaponArmJoinsOldB3AtDeflectImpulse: true,/);
  assert.match(body, /weaponArmContactConstrained: false,/);

  assert.match(html, /confirmed-Parry fail-safe/);
  assert.match(html, /28ms continuity bridge/);
  assert.match(html, /the weapon arm joins the running OLD B3/);
});

test('R18P.4 locks the calibrated arm assistance for every attack direction', () => {
  assert.match(contactLifecycleDirectorSource, /proximalAssistBone: 'upperarm\.r',/);
  assert.match(contactLifecycleDirectorSource, /assistBone: 'lowerarm\.r',/);
  assert.match(contactLifecycleDirectorSource, /elbowPropagationActive: true,/);
  assert.match(contactLifecycleDirectorSource, /shoulderPropagationActive: false,/);
  assert.match(html, /the 7\/7 inspection \(all directions\)/);
  assert.match(html, /LEFT release (?:仍)?(?:暫緩|deferred)/);
});

test('R18M.1 locks current verification budget so extraction cannot silently expand telemetry', () => {
  assert.match(source, /const MAX_REPORT_DOM_CHARACTERS = 60000;/);
  assert.match(source, /const RECENT_COMPACT_TRACE_FRAMES = 8;/);
  assert.match(verificationReportSource, /telemetryDetail: 'compact-scalar-frames-only'/);
  assert.match(html, /Verification report ≤ 60,000 characters/);
});