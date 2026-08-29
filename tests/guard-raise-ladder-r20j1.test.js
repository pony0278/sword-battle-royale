import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R20J.1 (B6d) - the raise ladder, measured from the neutral default at 2.4m, full speed, fresh
// page per trial, F held through contact. Contacts: TOP 430ms, RIGHT 230ms, LEFT 260ms.
//
//   dir   | block band        | parry window   | body
//   TOP   | 0-240, 380-400    | 260-360        | >=420   (contact - 40ms)
//   RIGHT | 0-100, 160-220    | 120-140        | >=240   (after contact)
//   LEFT  | 0-120             | 140-180        | >=200   (contact - 60ms)
//
// Before the placed cover, LEFT's 80-120ms band was a coin flip on the same input: press@100
// blocked 3 of 6 and hit the body 3 of 6 (2.0m: 3 of 4 blocked; 1.8m: 4 of 4 - it worsened with
// distance). The cause was not the guard pose - enterGuard already fast-forwards the whole 180ms
// transition - but the coverage servo: LEFT is the only direction whose cover needs real shield
// travel (~40cm), the servo closes it at 2.5m/s after the latch's 70ms reaction watch, and a
// mid-windup raise left it roughly half way (measured 12-21cm achieved against 35-42cm required,
// versus 38-42cm when the guard was up from the start). After the fix press@100 is 6 of 6 a
// successful defence (5 block, 1 parry) with zero body hits, and every direction is monotone.
//
// What did NOT change, deliberately: the 70ms reaction watch (R18R.2). A guard raised later than
// that still cannot cover - which is why LEFT past its parry window still lands, and why the
// lateness cliff survives at all.
const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const preContact = readFileSync(new URL('../tools/action-studio/shield-parry-r281/pre-contact-controller.js', import.meta.url), 'utf8');
const latch = readFileSync(new URL('../src/combat/guard-coverage-latch.js', import.meta.url), 'utf8');

test('R20J.1 latches the late raise per exchange and clears it with the exchange', () => {
  assert.match(entry, /let lateGuardRaise = false;/);
  // Set where the raise is already known to have landed inside a live swing - the same edge the
  // Sekiro arm uses, and independent of what the gate makes of the timing.
  assert.match(entry, /lateGuardRaise = true; \/\/ R20J\.1[\s\S]{0,200}parryGate\.arm\(/);
  assert.match(entry, /function resetExchange\(\) \{\s*\n\s*laneController\.endExchange\(\); lateGuardRaise = false;/);
  assert.match(entry, /stanceReport: defenderStance\.report, lateGuardRaise,/);
});

test('R20J.1 asks the coverage director to place the cover only for a late raise', () => {
  assert.match(preContact, /snapTravel: context\.lateGuardRaise === true,/);
  // The golden grid's world holds the guard from before the swing, so it keeps the servo.
  const golden = readFileSync(new URL('../tools/action-studio/b1-golden/capture-golden-grid.mjs', import.meta.url), 'utf8');
  const raise = golden.indexOf('setGuardHeld(true)');
  const attack = golden.indexOf('restartAttack');
  assert.ok(raise > 0 && attack > raise, 'the golden driver must raise before it attacks, or the goldens change meaning');
});

test('R20J.1 leaves the reaction watch alone - a late guard may not skip watching', () => {
  assert.match(latch, /reactionDelayMs: 70,/);
  assert.match(latch, /guard-reaction-delay/);
  assert.doesNotMatch(latch, /snapTravel/, 'the placed cover is a travel decision, never a timing one');
});
