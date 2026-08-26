import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('historical G4.3B.5R.2.7 stays covered while R18I5 guarantees TOP/RIGHT deflect release', () => {
  const html = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.js', import.meta.url), 'utf8');

  assert.match(html, /latched DEFLECT_IMPULSE \+ TOP\/RIGHT 7\/7, or confirmed-Parry fail-safe, starts a 28ms continuity bridge.*OLD B3 runs from elapsed 0/);
  assert.match(html, /LEFT contact-correction release intentionally deferred/);
  assert.match(source, /predictive-intercept-parry\.js\?v=g43b5r27/);
  assert.match(source, /two-actor-combat-integration\.js\?v=g43b5r27/);
  assert.match(source, /shield-driven-contact-coupling\.js\?v=g43b5r27/);
  assert.match(source, /parry-backward-balance-break\.js\?v=g43b5r27/);
  assert.match(source, /two-actor-whole-body-recoil-burst\.js\?v=g43b5r27/);
  assert.match(source, /maxReleaseTipDisplacementMeters/);
  assert.match(source, /distanceTo\(releaseTipPosition\)/);
  assert.match(source, /bypassedForWholeBodyBurst/);
  assert.match(source, /Release separation: BYPASSED/);
  assert.match(source, /parryWeaponAuthority/);
  assert.match(source, /parryBodyAuthority/);
});
