import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R20H.1 (B6c2): Sekiro-style parry in block mode. The rising edge of the held guard IS the parry
// attempt - a raise inside the committed timing window auto-upgrades to a parry, a refused raise
// is silently a plain guard. These locks protect the four seams of that wiring; the behavioural
// truth lives in the browser grid (3 directions x in-window/pre-held/early/late, verified 12/12
// through the real F-key path at 1x).

const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const handoff = readFileSync(new URL('../src/game/contact-handoff-controller.js', import.meta.url), 'utf8');
const preContact = readFileSync(new URL('../src/game/pre-contact-controller.js', import.meta.url), 'utf8');
const director = readFileSync(new URL('../src/combat/contact-lifecycle-director.js', import.meta.url), 'utf8');

test('R20H.1 the guard-raise edge arms the parry gate and drives the accepted arm', () => {
  // The arm happens on the stance edge, from the live snapshot, only before first contact.
  assert.match(entry, /if \(stanceEdge\.justRaisedGuard && attackRuntime\.snapshot\?\.action && !exchangeState\.firstContact\) \{/);
  // R21C.1: the raise edge carries where the player was pointing, because a parry is answered by
  // direction now. Both doors into the gate must carry it or the other one is a way in without aim.
  assert.match(entry, /parryGate\.arm\(\{ attackSnapshot: attackRuntime\.snapshot, manual: true,\s*\n\s*source: 'guard-raise', aimedSector: guardSector\.sector \}\)/);
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
  assert.match(html, /\?v=g43b5r281-left-arrives-late-r21o3/);
  assert.match(html, /B6c2/);
  assert.match(html, /Sekiro/);
});

test('R20H.2 a released key cannot interrupt an armed attempt or a live deflect', () => {
  // Measured: releasing F 80-150ms after the raise (an ordinary human tap) used to yank the shield
  // out of its own parry - the sword slipped off after the deflection peak, direction agreement
  // 0.18 against the 0.50 floor, both rigs left in garbage poses. The commitment defers the drop.
  assert.match(entry, /function defenceCommitted\(\) \{ return parryGate\.armed === true \|\| contactHandoffController\.ownsLiveContact\(\); \}/);
  // Both the input edge and the frame loop arbitrate through the stance, and the guard machine
  // follows the stance rather than the raw key - otherwise the deferred drop never lands.
  const armEdge = entry.indexOf("defenceCommitted: defenceCommitted() });\n  syncGuardToStance();");
  assert.ok(armEdge > 0, 'setGuardHeld must update the stance with the commitment, then sync the machine');
  assert.match(entry, /defenderStance\.update\(\{ guardKeyHeld, dodgeRunning: laneController\.dodgeReport\.dodging, defenceCommitted: defenceCommitted\(\) \}\); \/\/ R20G\.1 \+ R20H\.2\n  syncGuardToStance\(\);/);
  assert.match(entry, /function syncGuardToStance\(\) \{[\s\S]*defenderStance\.report\.guardActive === true[\s\S]*GUARD_EVENTS\.RESET/);
  // The raw key may no longer drive the guard machine anywhere in the entry.
  assert.doesNotMatch(entry, /guardKeyHeld && guardMachine\.state === GUARD_STATES\.NEUTRAL/);
});
