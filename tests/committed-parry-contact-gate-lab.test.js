import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const labUiSource = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
const frameReportingSource = readFileSync(new URL('../tools/action-studio/shield-parry-r281/frame-reporting.js', import.meta.url), 'utf8');
const preContactSource = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
const contactHandoffSource = readFileSync(new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist`);
  return source.slice(start, end);
}

const lifecycleDirectorSource = readFileSync(
  new URL('../src/combat/contact-lifecycle-director.js', import.meta.url),
  'utf8',
);
function lifecycleFunctionBody(name, nextName) {
  const start = lifecycleDirectorSource.indexOf(`function ${name}(`);
  const end = lifecycleDirectorSource.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist in contact lifecycle director`);
  assert.notEqual(end, -1, `${nextName} must exist in contact lifecycle director`);
  return lifecycleDirectorSource.slice(start, end);
}
function contactHandoffFunctionBody(name, nextName) {
  const start = contactHandoffSource.indexOf(`function ${name}(`);
  const end = contactHandoffSource.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist in contact handoff controller`);
  assert.notEqual(end, -1, `${nextName} must exist in contact handoff controller`);
  return contactHandoffSource.slice(start, end);
}

function preContactFunctionBody(name, nextName) {
  const start = preContactSource.indexOf(`function ${name}(`);
  const end = preContactSource.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist in pre-contact controller`);
  assert.notEqual(end, -1, `${nextName} must exist in pre-contact controller`);
  return preContactSource.slice(start, end);
}

test('Step 2 exposes one manual Parry and removes Perfect from the Lab', () => {
  assert.match(html, /id="parryNow"/);
  // R21P.1: the review aid still exists and is still wired; it simply no longer defaults on. It
  // rescales the pre-contact phase to 0.12x and freezes the sim for 1.5s exactly when the parry
  // window opens - the thing every measurement here is timing - and it reset to checked on every
  // reload, so three whole playtests were recorded through it before anyone noticed.
  assert.match(html, /id="slowReview"/);
  assert.doesNotMatch(html, /id="slowReview"[^>]*checked/);
  assert.match(html, />PARRY NOW \(F\)</);
  assert.doesNotMatch(html, /data-mode="perfect"/);
  assert.match(html, /g43b5r281-the-player-swing-moves-out-r23r1/);
});

test('Step 2 does not auto-start Parry from predictive timing', () => {
  const preContact = preContactFunctionBody('updateParryPreContact', 'updatePreContact');
  const manualInput = functionBody('triggerParryNow', 'forceOldTwoActorB3');
  // R20H.1 moved the accepted-arm side effects into driveAcceptedParry, shared with the block-mode
  // guard raise - still player input only, never predictive timing.
  const acceptedDrive = functionBody('driveAcceptedParry', 'triggerParryNow');
  assert.doesNotMatch(preContact, /predictivePresentation\.start/);
  assert.match(manualInput, /parryGate\.arm/);
  assert.match(manualInput, /driveAcceptedParry\(/);
  assert.match(acceptedDrive, /predictivePresentation\.start/);
});

test('Step 3A requires the gate and real swept contact before live wrist-grip transfer', () => {
  // R18S.4: the lifecycle sequence lives in the director; the gate-then-grip order holds there.
  const resolve = lifecycleFunctionBody('resolveContact', 'advanceCombat');
  assert.match(resolve, /probeSweptSwordBucklerContact/);
  assert.match(resolve, /if \(!contactEvaluation\.contact\)/);
  assert.match(resolve, /confirmParry\(/);
  assert.match(resolve, /gripConstraint\.start/);
  assert.ok(resolve.indexOf('confirmParry(') < resolve.indexOf('gripConstraint.start'));
  assert.doesNotMatch(resolve, /publishPostCouplingRecoilStaggerHandoff/);
  assert.doesNotMatch(resolve, /couplingRuntime\.start/);
});

test('Step 2 invalid or absent Parry input falls back to Block timing', () => {
  const resolve = lifecycleFunctionBody('resolveContact', 'advanceCombat');
  assert.match(resolve, /parryConfirmed \? GUARD_INTENT_AGE_MS\.parry : GUARD_INTENT_AGE_MS\.block/);
  assert.match(resolve, /outcome === 'parry' && parryConfirmed/);
});

test('Step 2 visibly captures F before evaluating the Parry gate', () => {
  const dispatch = functionBody('dispatchParryInput', 'forceOldTwoActorB3');
  assert.match(html, /id="canvas" tabindex="0"/);
  assert.match(html, /id="hudInput"/);
  assert.match(source, /bindShieldParryLabUiEvents/);
  assert.match(source, /onParryInput: \(inputSource, event\) => dispatchParryInput\(inputSource, event\)/);
  assert.match(labUiSource, /documentRef\.addEventListener\('keydown', \(event\) =>/);
  assert.match(labUiSource, /documentRef\.addEventListener\('keyup', \(event\) =>/);
  assert.match(labUiSource, /event\?\.code === 'KeyF'/);
  assert.match(labUiSource, /String\(event\?\.key \|\| ''\)\.toLowerCase\(\) === 'f'/);
  assert.match(labUiSource, /handlers\.onParryInput\('keyboard-f', event\)/);
  assert.match(dispatch, /exchangeState\.latestInputSignal/);
  assert.match(dispatch, /const result = triggerParryNow\(source\)/);
  assert.ok(dispatch.indexOf('exchangeState.latestInputSignal') < dispatch.indexOf('triggerParryNow(source)'));
  assert.match(labUiSource, /INPUT RECEIVED:/);
});

test('Step 2 previews the live gate without consuming input and gives an explicit retry', () => {
  const preContact = preContactFunctionBody('updateParryPreContact', 'updatePreContact');
  assert.match(html, /id="parryCue"/);
  assert.match(html, /id="retryAttack"/);
  assert.match(preContact, /evaluateCommittedParryInput/);
  assert.match(preContact, /manual: false/);
  assert.doesNotMatch(preContact, /parryGate\.arm/);
  assert.doesNotMatch(preContact, /predictivePresentation\.start/);
  assert.match(labUiSource, /PARRY NOW! · PRESS F/);
  assert.match(labUiSource, /ATTEMPT USED/);
  assert.match(frameReportingSource, /parryAttempt: parryGate\.attempt/);
  assert.match(source, /function restartAttack/);
  assert.match(labUiSource, /elements\.retryAttack\.addEventListener\('click', handlers\.onRetryAttack\)/);
  assert.match(source, /onRetryAttack: \(\) => \{ if \(duel\.verdict\.over\) duel\.reset\(\); return restartAttack\(selectedDirection\); \}/);
});

test('Step 2 keeps original Block at 1x while Parry review holds a valid prompt', () => {
  assert.match(source, /const PARRY_REVIEW_RATE = 0\.12/);
  assert.match(source, /const PARRY_PROMPT_HOLD_MS = 1500/);
  assert.match(source, /function isParryPreContactReviewActive/);
  assert.match(source, /const deltaMs = holdingParryPrompt \? 0 : rawDeltaMs \* reviewRate/);
  assert.match(preContactSource, /(?:exchangeState\.)?parryPromptHoldSequence !== snapshot\.sequence/);
  assert.match(html, /Block \+ Step 3A \+ direct OLD B3 stay 1\.00×/);
  assert.doesNotMatch(source, /rawDeltaMs \* \(slowReview\.checked/);
});

test('Step 2 uses timing as input authority and treats predictive geometry as clamped guidance', () => {
  assert.match(source, /committed-parry-contact-gate\.js'/);
  assert.match(html, /geometry-guided shield motion clamped to the 60cm lunge-reach budget/);
  assert.match(html, /guidance · cannot veto input/);
  assert.doesNotMatch(source, /predicted-intercept-out-of-shield-reach/);
  assert.doesNotMatch(source, /predicted-intercept-outside-plane-capture/);
});

test('Step 2 review slowdown ends before Step 3A transfer', () => {
  const review = functionBody('isParryPreContactReviewActive', 'resolveContact');
  assert.match(review, /!(?:exchangeState\.)?firstContact/);
  assert.match(review, /snapshot\.elapsedSeconds < contactSeconds/);
  assert.match(source, /const parryReviewActive = isParryPreContactReviewActive\(preUpdateSnapshot\)/);
  assert.match(source, /const reviewRate = parryReviewActive \? PARRY_REVIEW_RATE : 1/);
  assert.match(html, /Block \+ Step 3A \+ direct OLD B3 stay 1\.00×/);
});