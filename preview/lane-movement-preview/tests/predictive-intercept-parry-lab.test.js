import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../tools/action-studio/predictive-intercept-parry-lab.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../tools/action-studio/predictive-intercept-parry-lab.html', import.meta.url), 'utf8');

test('G4.3B.5R.1 Lab triggers Parry from attack timeline TTC before authoritative contact', () => {
  assert.match(source, /attackSnapshot: snapshot/);
  assert.match(source, /analyzePredictiveInterceptParry\(/);
  assert.match(source, /predictivePresentation\.start\(/);
  assert.match(source, /function updateContact\(/);
  assert.ok(
    source.indexOf('updatePredictiveParry(snapshot, currentBlade, deltaSeconds);')
      < source.indexOf('updateContact(snapshot, currentBlade, deltaSeconds);'),
    'active Parry must start before physical contact resolution in each frame',
  );
});

test('G4.3B.5R.1 Lab does not use reachability as permission to start Parry', () => {
  assert.match(source, /Reach is presentation capacity, never permission to start Parry/);
  assert.match(source, /latestTrackingReport = trackingRuntime\.update\(latestTrackingPlan, deltaSeconds\);/);
  assert.doesNotMatch(source, /if\s*\(latestTrackingPlan\?\.reachable\).*predictivePresentation\.start/s);
  assert.match(html, /Out of reach<\/span><b>still animates · clamp<\/b>/);
});

test('G4.3B.5R.1 Lab keeps the 18cm Parry envelope while allowing clamped active motion', () => {
  assert.match(source, /mode: 'parry'/);
  assert.match(html, /Parry tracking envelope<\/span><b>max 0\.18 m<\/b>/);
  assert.doesNotMatch(source, /maxCorrectionMeters:\s*0\.07/);
  assert.match(source, /clampedButStillActive/);
});

test('G4.3B.5R.1 real swept geometry remains the only success authority', () => {
  assert.match(source, /probeSweptSwordBucklerContact\(/);
  assert.match(source, /if \(!latestContact\.contact\) return;/);
  assert.ok(
    source.indexOf('if (!latestContact.contact) return;')
      < source.indexOf('latestCombatResult = combat.resolveContact'),
    'combat outcome must not resolve until real contact exists',
  );
});

test('G4.3B.5R.1 visibly reports active Parry misses as WHIFF', () => {
  assert.match(source, /function registerParryWhiff\(/);
  assert.match(source, /state: 'whiff'/);
  assert.match(source, /attack-ended-without-authoritative-contact/);
  assert.match(source, /Outcome: PARRY WHIFF/);
  assert.match(html, /No contact → PARRY WHIFF/);
});

test('G4.3B.5R.1 hands a successful predictive pose to Guard authority in the same frame', () => {
  assert.match(source, /predictivePresentation\.handoff\(\)/);
  assert.match(source, /guardReport = guardRuntime\.sync\(camera\);/);
  assert.match(source, /presentationOffsetSeconds:\s*0\.35/);
  assert.match(source, /parryAttackerRecoilDelayMs:\s*0/);
  assert.match(source, /perfectParryAttackerRecoilDelayMs:\s*0/);
});
