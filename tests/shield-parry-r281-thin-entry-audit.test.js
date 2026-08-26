import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const entryUrl = new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url);
const entrySource = await readFile(entryUrl, 'utf8');
const moduleDirUrl = new URL('../tools/action-studio/shield-parry-r281/', import.meta.url);

function indexOfOrFail(source, marker) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `missing marker: ${marker}`);
  return index;
}

test('R18M.C6 leaves a deliberately thin authority entry without redundant controller getter wrappers', () => {
  const lineCount = entrySource.split('\n').length;
  assert.ok(lineCount <= 725, `R281 entry should stay at or below the audited 725-line ceiling, got ${lineCount}`);
  for (const redundant of [
    'function step3AOwnsLiveContact()',
    'function updateDefenderDeflectReleaseGate()',
    'function defenderDeflectReleaseGate()',
    'function releaseLiveContactToOldB3()',
    'function recordVisibleOldB3Sample(',
    'function requestedOutcome()',
  ]) assert.ok(!entrySource.includes(redundant), `redundant wrapper remains: ${redundant}`);
  assert.match(entrySource, /contactHandoffController\.ownsLiveContact\(\)/);
  assert.match(entrySource, /contactHandoffController\.defenderDeflectReleaseGate\(\)/);
});

test('R18M.C6 retains all explicit local authority and ordering boundaries required by #63', () => {
  for (const marker of [
    'function frame(timestamp)',
    "function triggerParryNow(source = 'button')",
    'function dispatchParryInput(source, event = null)',
    'function startAttack(direction = selectedDirection)',
    'function restartAttack(direction = selectedDirection)',
    'function setMode(mode)',
    'function resetExchange()',
    'function resolveContact(snapshot, currentBlade, deltaSeconds)',
    'function forceOldTwoActorB3(direction = selectedDirection)',
  ]) assert.ok(entrySource.includes(marker), `authority boundary moved from entry: ${marker}`);
  assert.match(entrySource, /latestParryInput = parryGate\.arm\(\{[\s\S]*manual: true,/);
});

test('R18M.C6 keeps exact cross-controller frame sequencing in the entry', () => {
  const frame = entrySource.slice(indexOfOrFail(entrySource, 'function frame(timestamp)'));
  const attackUpdate = indexOfOrFail(frame, 'attackRuntime.update(deltaMs)');
  const combatBeforeGuard = indexOfOrFail(frame, 'contactHandoffController.updateCombatBeforeGuard({');
  const guardUpdate = indexOfOrFail(frame, 'guardRuntime.update(deltaMs, camera)');
  const releaseGate = indexOfOrFail(frame, 'contactHandoffController.updateDefenderDeflectReleaseGate()');
  const liveConstraint = indexOfOrFail(frame, 'contactHandoffController.updateLiveConstraintAfterGuard({');
  const visibleOldB3 = indexOfOrFail(frame, 'contactHandoffController.recordVisibleOldB3Sample(exchangeState.latestCombatUpdate)');
  const preContact = indexOfOrFail(frame, 'preContactController.update(snapshot, currentBlade, deltaSeconds)');
  const contactResolve = indexOfOrFail(frame, 'resolveContact(snapshot, currentBlade, deltaSeconds)');
  const parryCue = indexOfOrFail(frame, 'updateParryCue(snapshot)');
  assert.ok(attackUpdate < combatBeforeGuard);
  assert.ok(combatBeforeGuard < guardUpdate);
  assert.ok(guardUpdate < releaseGate);
  assert.ok(releaseGate < liveConstraint);
  assert.ok(liveConstraint < visibleOldB3);
  assert.ok(visibleOldB3 < preContact);
  assert.ok(preContact < contactResolve);
  assert.ok(contactResolve < parryCue);
});

test('R18M.C6 keeps R281 module dependencies one-way from entry into extracted modules', async () => {
  const files = (await readdir(moduleDirUrl)).filter((name) => name.endsWith('.js'));
  assert.ok(files.length >= 10, 'expected extracted R281 modules');
  for (const file of files) {
    const source = await readFile(new URL(file, moduleDirUrl), 'utf8');
    assert.ok(!source.includes('shield-driven-contact-coupling-lab-r281'), `${file} must not import the browser entry`);
  }
});

test('R18M.C6 preserves immutable visual-preview bootstrap path safety from the C5 hotfix', async () => {
  const bootstrapUrl = new URL('../tools/action-studio/shield-parry-r281/lab-bootstrap.js', import.meta.url);
  const bootstrapSource = await readFile(bootstrapUrl, 'utf8');
  const imports = [...bootstrapSource.matchAll(/from ['"](\.\.\/[^'"]+)['"]/g)].map((match) => match[1]);
  assert.equal(imports.length, 6);
  for (const specifier of imports) {
    const resolved = new URL(specifier, bootstrapUrl);
    await assert.doesNotReject(readFile(resolved, 'utf8'), `bootstrap import must resolve: ${specifier}`);
  }
});
