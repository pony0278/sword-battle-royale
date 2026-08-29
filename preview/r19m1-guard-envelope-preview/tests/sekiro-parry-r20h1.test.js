import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R20H.1 (B6c2): Sekiro-style parry in block mode. The rising edge of the held guard IS the parry
// attempt - a raise inside the committed timing window auto-upgrades to a parry, a refused raise
// is silently a plain guard. These locks protect the four seams of that wiring; the behavioural
// truth lives in the browser grid (3 directions x in-window/pre-held/early/late, verified 12/12
// through the real F-key path at 1x).

const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const handoff = readFileSync(new URL('../tools/action-studio/shield-parry-r281/contact-handoff-controller.js', import.meta.url), 'utf8');
const preContact = readFileSync(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
const director = readFileSync(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');

test('R20H.1 the guard-raise edge arms the parry gate and drives the accepted arm', () => {
  // The arm happens on the stance edge, from the live snapshot, only before first contact.
  assert.match(entry, /if \(stanceEdge\.justRaisedGuard && attackRuntime\.snapshot\?\.action && !exchangeState\.firstContact\) \{/);
  assert.match(entry, /parryGate\.arm\(\{ attackSnapshot: attackRuntime\.snapshot, manual: true, source: 'guard-raise' \}\)/);
  // An accepted raise gets the same intercept drive as parry mode's manual trigger - without it
  // every in-window LEFT raise still lands on the body (measured; the window sits past the B6b
  // raise-conversion cliff).
  assert.match(entry, /if \(exchangeState\.latestParryInput\.accepted\) driveAcceptedParry\(attackRuntime\.snapshot\);/);
});

test('R20H.1 block-mode F does not fall through to the legacy parry trigger', () => {
  // lab-ui reports both readings of the F keydown; the entry must stop the parry reading in block
  // mode or triggerParryNow clobbers the guard-raise verdict with select-parry-mode-first.
  assert.match(entry, /if \(selectedMode === 'block' && source\.startsWith\('keyboard-f'\)\) return exchangeState\.latestParryInput;/);
});

test('R20H.1 an armed raise hands pre-contact frames to the parry chain', () => {
  assert.match(preContact, /if \(context\.selectedMode === 'block' && parryGate\.armed !== true\) updateBlockPreContact\(snapshot, currentBlade, deltaSeconds, context\);\s*\n\s*else updateParryPreContact\(snapshot, currentBlade, deltaSeconds, context\);/);
});

test('R20H.1 confirmation asks the armed gate, mode cannot veto a Sekiro raise', () => {
  assert.match(handoff, /readParryArmed: \(\) => parryGate\.armed === true/);
  assert.match(director, /confirmation = \(selectedMode === 'parry' \|\| readParryArmed\?\.\(\) === true\)/);
});

test('R20H.1 the page identifies the Sekiro build and documents the windows', () => {
  const html = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
  assert.match(html, /\?v=g43b5r281-sekiro-parry-r20h1/);
  assert.match(html, /B6c2/);
  assert.match(html, /Sekiro/);
});
