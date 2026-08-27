import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('tools/action-studio/two-actor-combat-integration-lab.js', 'utf8');
const html = fs.readFileSync('tools/action-studio/two-actor-combat-integration-lab.html', 'utf8');

test('G4.3B.4 lab wires the production exchange chain instead of a presentation-only fake', () => {
  assert.match(script, /createTwoActorCombatIntegration/);
  assert.match(script, /combat\.startAttack\(/);
  assert.match(script, /combat\.resolveContact\(/);
  assert.match(script, /combat\.update\(/);
  assert.match(script, /probeSweptSwordBucklerContact/);
  assert.match(script, /LONGSWORD_ATTACK_PHASES\.ACTIVE/);
  assert.doesNotMatch(script, /active:\s*snapshot\.phase\s*===\s*['"]active['"]/);
});

test('G4.3B.4 lab exposes Block Parry and Perfect timing grades and the dedicated module entry', () => {
  assert.match(html, /data-grade="block"/);
  assert.match(html, /data-grade="parry"/);
  assert.match(html, /data-grade="perfect"/);
  assert.match(html, /two-actor-combat-integration-lab\.js/);
  assert.match(script, /block:\s*260/);
  assert.match(script, /parry:\s*120/);
  assert.match(script, /perfect:\s*50/);
});

test('G4.3B.5 restores Fine Guard Tracking before the authoritative contact probe', () => {
  assert.match(script, /createGuardThreatTrackingRuntime/);
  assert.match(script, /planFineGuardTracking/);
  assert.match(script, /fineTrackingRuntime\.update\(/);
  assert.match(script, /maxCorrectionMeters:\s*bracePlan\?\.fineTrackMaxMeters \|\| 0/);

  const braceIndex = script.indexOf('latestBracing = bracingRuntime.update');
  const fineIndex = script.indexOf('latestFineTracking = fineTrackingRuntime.update');
  const contactIndex = script.indexOf('updateContact(snapshot, currentBlade, deltaSeconds)', fineIndex);
  assert.ok(braceIndex >= 0);
  assert.ok(fineIndex > braceIndex);
  assert.ok(contactIndex > fineIndex);
});

test('G4.3B.5 throttles debug DOM work and caps render density for smoother visual review', () => {
  assert.match(script, /HUD_INTERVAL_MS\s*=\s*50/);
  assert.match(script, /REPORT_INTERVAL_MS\s*=\s*200/);
  assert.match(script, /devicePixelRatio\s*\|\|\s*1,\s*1\.5/);
  assert.match(script, /bladeBuffers/);
  assert.match(script, /combatSnapshot\s*=\s*combat\.snapshot/);
  assert.match(script, /if \(hudClockMs >= HUD_INTERVAL_MS\)/);
  assert.match(script, /if \(reportClockMs >= REPORT_INTERVAL_MS\)/);
  assert.doesNotMatch(script, /previousBlade\s*=\s*currentBlade;\s*\n\s*buildReport\(\);/);
});
