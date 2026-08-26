import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// R18M split the R281 lab entry into shield-parry-r281/ controllers. The
// behaviours below are unchanged, but each now lives in the module that owns
// it, so every assertion reads the module that actually holds it rather than
// the entry alone. `shield-parry-r281-thin-entry-audit.test.js` is what keeps
// these out of the entry, so scanning the entry for them would contradict it.
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const entry = await read('tools/action-studio/shield-driven-contact-coupling-lab-r281.js');
const preContactController = await read('tools/action-studio/shield-parry-r281/pre-contact-controller.js');
const contactHandoffController = await read('tools/action-studio/shield-parry-r281/contact-handoff-controller.js');
const directOldB3Diagnostic = await read('tools/action-studio/shield-parry-r281/direct-old-b3-diagnostic.js');
const html = await read('tools/action-studio/shield-driven-contact-coupling-lab.html');

const labSurface = [
  entry,
  preContactController,
  contactHandoffController,
  directOldB3Diagnostic,
].join('\n');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist`);
  return source.slice(start, end);
}

test('current R281 HTML runs the Step 3A shield to sword to hand entry', () => {
  assert.match(html, /Step 3A · Live Shield → Sword → Wrist-Grip Constraint/);
  assert.match(html, /shield-driven-contact-coupling-lab-r281\.js\?v=g43b5r281-step3b-body-fusion-r18o/);
  assert.match(html, /PARRY NOW \(F\)/);
  assert.doesNotMatch(html, /data-mode="perfect"/);
});

test('current R281 starts shield presentation only from manual Parry input', () => {
  const manual = functionBody(entry, 'triggerParryNow', 'forceOldTwoActorB3');
  const preContact = functionBody(preContactController, 'updateParryPreContact', 'armActiveIntercept');
  assert.match(manual, /parryGate\.arm/);
  assert.match(manual, /predictivePresentation\.start/);
  assert.doesNotMatch(preContact, /predictivePresentation\.start/);
  assert.match(preContact, /predictivePresentation\.update/);
  assert.match(preContact, /sampleActiveShieldLeadMotion/);
});

test('current R281 confirms Parry through real swept contact before live wrist-grip transfer', () => {
  const contact = functionBody(contactHandoffController, 'resolveContact', 'updateCombatBeforeGuard');
  assert.match(contact, /probeSweptSwordBucklerContact/);
  assert.match(contact, /if \(!exchangeState\.latestContact\.contact\) return/);
  assert.match(contact, /parryGate\.confirm/);
  assert.match(contact, /swordGripConstraint\.start/);
  assert.ok(contact.indexOf('parryGate.confirm') < contact.indexOf('swordGripConstraint.start'));
  assert.doesNotMatch(contact, /publishPostCouplingRecoilStaggerHandoff/);
});

test('current R281 releases a verified TOP or RIGHT live-contact pose into OLD B3', () => {
  assert.match(contactHandoffController, /buildLiveParryOldB3Handoff/);
  assert.match(contactHandoffController, /function releaseLiveContactToOldB3/);
  assert.match(contactHandoffController, /publishPostCouplingRecoilStaggerHandoff/);
  assert.match(contactHandoffController, /sampleLiveParryOldB3ReleaseBlend/);
  assert.match(contactHandoffController, /releasedToOldB3/);
});

test('current R281 keeps the verified legacy Two-Actor B3 plan unchanged behind the direct diagnostic', () => {
  assert.match(directOldB3Diagnostic, /LEGACY_TWO_ACTOR_RECOIL_HANDOFF_MODE/);
  assert.match(entry, /LEGACY_TWO_ACTOR_RECOIL_PASSTHROUGH_STAGE/);
  assert.match(directOldB3Diagnostic, /direct-existing-old-two-actor-b3-diagnostic/);
  assert.match(directOldB3Diagnostic, /combat\.update\(0\.021/);
});

test('current R281 contains no legacy authored-offset coupling, release bridge, Perfect, or balance-break authority', () => {
  assert.doesNotMatch(labSurface, /createShieldDrivenContactCouplingRuntime/);
  assert.doesNotMatch(labSurface, /couplingRuntime\.start/);
  assert.match(entry, /createLiveShieldSwordGripContactRuntime/);
  assert.doesNotMatch(labSurface, /prepareLegacyReleaseBridge/);
  assert.doesNotMatch(labSurface, /perfect-parry/);
  assert.doesNotMatch(labSurface, /createParryBackwardBalanceBreakRuntime/);
  assert.doesNotMatch(labSurface, /TWO_ACTOR_WHOLE_BODY_RECOIL_BURST_STAGE/);
});

test('current R281 retains the independently verified Step 1 B3 diagnostic', () => {
  assert.match(html, /id="forceOldB3"/);
  assert.match(entry, /function forceOldTwoActorB3/);
  assert.match(directOldB3Diagnostic, /direct-existing-old-two-actor-b3-diagnostic/);
});
