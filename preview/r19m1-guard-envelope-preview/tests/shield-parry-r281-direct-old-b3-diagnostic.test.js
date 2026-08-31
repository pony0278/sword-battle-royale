import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  diagnosticCouplingReport,
} from '../tools/action-studio/shield-parry-r281/direct-old-b3-diagnostic.js';
import { authoredIncomingVelocity } from '../src/game/authored-incoming-velocity.js';

const entrySource = await readFile(
  new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url),
  'utf8',
);
const diagnosticSource = await readFile(
  new URL('../tools/action-studio/shield-parry-r281/direct-old-b3-diagnostic.js', import.meta.url),
  'utf8',
);
const lifecycleDirectorSource = await readFile(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');
const contactHandoffSource = await readFile(
  new URL('../src/game/contact-handoff-controller.js', import.meta.url),
  'utf8',
);

function sliceFunction(text, name, nextName) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = text.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return text.slice(start, end);
}

test('R18M.C4 entry keeps the public forceOldTwoActorB3 wrapper but delegates diagnostic orchestration', () => {
  assert.match(entrySource, /createDirectOldB3DiagnosticController\(\{/);
  const wrapper = sliceFunction(entrySource, 'forceOldTwoActorB3', 'startAttack');
  assert.match(wrapper, /directOldB3DiagnosticController\.run\(direction\)/);
  assert.doesNotMatch(wrapper, /combat\.resolveContact|publishPostCouplingRecoilStaggerHandoff|synthetic-authoritative-contact/);
});

test('R18M.C4 preserves exact direct diagnostic velocity and coupling helper semantics', () => {
  assert.deepEqual(authoredIncomingVelocity('left'), { x: -4.8, y: -0.4, z: 2.0 });
  assert.deepEqual(authoredIncomingVelocity('top'), { x: 0.2, y: -6.4, z: 0.6 });
  assert.deepEqual(authoredIncomingVelocity('right'), { x: 4.8, y: -0.4, z: 2.0 });

  const right = diagnosticCouplingReport('right');
  assert.equal(right.outcome, 'parry');
  assert.equal(right.elapsedMs, 96);
  assert.equal(right.complete, true);
  assert.equal(right.releaseAttackerRecoil, true);
  assert.deepEqual(right.shieldOffset, { x: 0.105, y: 0.028, z: 0.012 });
  assert.deepEqual(right.attackerWeaponOffset, { x: 0.092, y: 0.025, z: 0.011 });
  assert.equal(right.authority, 'step1-direct-old-b3-diagnostic-no-coupling-runtime');
});

test('R18M.C4 synthetic diagnostic contact is explicitly isolated from production Parry authority', () => {
  assert.match(diagnosticSource, /authority: 'step1-synthetic-authoritative-contact-for-old-b3-only'/);
  assert.match(diagnosticSource, /authority: 'direct-existing-old-two-actor-b3-diagnostic'/);
  assert.match(diagnosticSource, /parryTimingBypassed: true/);
  assert.match(diagnosticSource, /predictiveShieldLeadBypassed: true/);
  assert.match(diagnosticSource, /shieldContactBypassed: true/);
  assert.match(diagnosticSource, /couplingRuntimeBypassed: true/);
  assert.match(diagnosticSource, /releaseBridgeBypassed: true/);
  assert.doesNotMatch(diagnosticSource, /parryGate|probeSweptSwordBucklerContact|swordGripConstraint|buildLiveParryOldB3Handoff/);
});

test('R18M.C4 keeps production real-contact and manual Parry authority outside the diagnostic module', () => {
  assert.match(entrySource, /latestParryInput = parryGate\.arm\(\{/);
  assert.match(entrySource, /manual: true,/);
  // R18S.4: production real-contact authority lives in the lifecycle director.
  assert.match(lifecycleDirectorSource, /probeSweptSwordBucklerContact\(\{/);
  assert.match(lifecycleDirectorSource, /if \(!contactEvaluation\.contact\)/);
  assert.match(lifecycleDirectorSource, /confirmParry\(\{/);
});
