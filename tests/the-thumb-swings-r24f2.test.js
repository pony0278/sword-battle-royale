// R24F.2 - the thumb swings (#36).
//
// Measured before: on a touch screen a tap on the canvas did nothing at all - no swing and no
// refusal - because the canvas attack (R23H.1) returns for touch pointers, and the panel's TOP /
// RIGHT / LEFT buttons are the lab's. The mouse path, measured on the same build: the swing is
// active on the very frame of the pointerdown, guard held or not. The pad's blade takes the same
// handler on the same edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindShieldParryLabUiEvents } from '../tools/action-studio/shield-parry-r281/lab-ui.js';

function harness() {
  const calls = { attack: [] };
  const listeners = new Map();
  const blade = {
    dataset: {},
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
  };
  const noop = () => {};
  const elements = Object.fromEntries(['forceOldB3', 'parryNow', 'retryAttack', 'debugApplyRetry', 'debugResetDefaults', 'showSurface']
    .map((id) => [id, { checked: false, addEventListener() {} }]));
  bindShieldParryLabUiEvents({
    documentRef: { addEventListener() {}, querySelectorAll: (selector) => (selector === '[data-attack-touch]' ? [blade] : []) },
    windowRef: { addEventListener() {} },
    canvas: { addEventListener() {}, focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), ownerDocument: { querySelectorAll: () => [] } },
    elements,
    handlers: {
      onAttack: (...args) => calls.attack.push(args),
      onLook: noop, onDirectionalParry: noop, onMode: noop, onView: noop, onParryInput: noop, onRetryAttack: noop,
      onForceOldB3: noop, onDebugApplyRetry: noop, onDebugResetDefaults: noop, onShowSurface: noop, onResize: noop,
      onAim: noop, onDodge: noop, onMoveIntent: noop, onLockToggle: noop, onSprint: noop,
    },
  });
  const fire = (type) => { let prevented = false; for (const h of listeners.get(type) || []) h({ pointerType: 'touch', preventDefault() { prevented = true; } }); return prevented; };
  return { calls, fire, bound: [...listeners.keys()] };
}

test('R24F.2 the blade fires on pointerdown, once, with no direction of its own', () => {
  const { calls, fire, bound } = harness();
  assert.ok(bound.includes('pointerdown'), 'bound on the press, not the click');
  assert.ok(!bound.includes('click') && !bound.includes('pointerup'), 'a click would wait for the finger to lift');
  assert.equal(fire('pointerdown'), true, 'the default (focus, scroll, a synthetic click) is prevented');
  assert.deepEqual(calls.attack, [[]], 'the same handler as the mouse button, no direction: the aimed sector decides');
  assert.equal(fire('contextmenu'), true, 'a long press opens no menu');
});

test('R24F.2 the blade sits in the pad, on the right thumb, next to the shield', () => {
  const html = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
  assert.match(html, /<button data-attack-touch class="pad-attack">⚔<\/button>/);
  assert.match(html, /grid-template-areas: "\. up dodge" "left guard right" "\. down attack"/, 'the bottom-right cell, under the thumb that holds the shield');
});
