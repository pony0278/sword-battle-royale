import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DIRECTIONAL_PARRY_INPUT_NOTES,
  DIRECTIONAL_PARRY_INPUT_STAGE,
  DIRECTIONAL_PARRY_KEYS,
  directionalParryFor,
} from '../src/combat/directional-parry-input.js';
import { createGuardSectorRuntime } from '../src/game/guard-sector-runtime.js';
import { bindShieldParryLabUiEvents } from '../tools/action-studio/shield-parry-r281/lab-ui.js';

const entry = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('R21N.1 one press names a direction, from a key or from a button', () => {
  assert.equal(DIRECTIONAL_PARRY_INPUT_STAGE, 'R21N.1');
  assert.deepEqual(DIRECTIONAL_PARRY_KEYS, { KeyI: 'top', KeyJ: 'left', KeyL: 'right' });
  assert.equal(directionalParryFor('KeyI'), 'top');
  assert.equal(directionalParryFor('KeyJ'), 'left');
  assert.equal(directionalParryFor('KeyL'), 'right');
  // The same verb arrives from an on-screen cell as a sector name, and from a probe as either.
  assert.equal(directionalParryFor('left'), 'left');
  assert.equal(directionalParryFor('TOP'), 'top');
  assert.equal(directionalParryFor('KeyW'), null);
  assert.equal(directionalParryFor(''), null);
  assert.equal(directionalParryFor(null), null);
  assert.equal(directionalParryFor(undefined), null);
  // F is untouched: it is still the guard, and a held guard is still omnidirectional. A directional
  // press is an ADDITION to that, not a replacement for it.
  assert.equal(directionalParryFor('KeyF'), null);
});

test('R21N.1 the notes carry the measurement that chose a discrete input', () => {
  const notes = DIRECTIONAL_PARRY_INPUT_NOTES;
  // The finding this stage answers: the aim was not being misread, it was not being answered.
  assert.equal(notes.pressesWithTheAimUnchanged.unchanged, 48);
  assert.equal(notes.pressesWithTheAimUnchanged.of, 50);
  assert.equal(notes.misreadsThatNeverMovedTheAim.unmoved, 20);
  assert.equal(notes.misreadsThatNeverMovedTheAim.of, 22);
  // And the cost of trying to answer it with the pointer: aiming and timing took the same budget.
  assert.ok(notes.tooEarlyShareWhileAiming > notes.tooEarlyShareBefore);
  assert.ok(notes.parryRateWhileAiming < notes.parryRateBefore);
  // Mobile decided the shape: the cheapest deliberate swipe still costs more than the window.
  assert.ok(notes.swipeMsOnTouch.minimum > notes.parryWindowMs);
  assert.equal(notes.authority, 'input-mapping-only-no-contact-authority');
});

test('R21N.1 the sector runtime can be chosen outright, not only pointed at', () => {
  const runtime = createGuardSectorRuntime();
  assert.equal(runtime.report.reason, 'never-aimed');
  const chosen = runtime.select('top');
  assert.equal(chosen.sector, 'top');
  assert.equal(runtime.sector, 'top');
  // A chosen sector has no aiming plan behind it, and says so rather than leaving a stale pointer
  // reading looking like the cause.
  assert.equal(chosen.reason, 'chosen-by-a-discrete-input');
  assert.equal(chosen.angleDegrees, null);
  assert.equal(chosen.magnitude, null);
  assert.equal(runtime.select('LEFT').sector, 'left');
  // Junk holds the last choice instead of dropping the guard's direction on the floor.
  assert.equal(runtime.select('sideways').sector, 'left');
  assert.equal(runtime.select(null).sector, 'left');
  // Choosing does not disable pointing - both write the same one variable.
  assert.equal(runtime.aim({ offsetX: 400, offsetY: 0, viewportWidth: 1000, viewportHeight: 600 }).sector, 'right');
  assert.equal(runtime.reset().sector, null);
});

test('R21N.1 this module maps input and judges nothing', async () => {
  const source = await readFile(new URL('../src/combat/directional-parry-input.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /parryGate|resolveContact|timeToContact|accepted/);
});

function stubButton(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    captured: [],
    listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    setPointerCapture(pointerId) { this.captured.push(pointerId); },
    fire(type, event = {}) { listeners.get(type)?.({ preventDefault() {}, ...event }); },
  };
}

function bindStubbedLab() {
  const calls = [];
  const cells = ['left', 'top', 'right'].map((sector) => stubButton({ sector }));
  const docListeners = new Map();
  const documentRef = {
    addEventListener(type, handler) { (docListeners.get(type) || docListeners.set(type, []).get(type)).push(handler); },
    querySelectorAll: () => [],
  };
  const windowRef = { addEventListener() {} };
  const canvas = {
    addEventListener() {},
    focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    ownerDocument: { querySelectorAll: (selector) => (selector === '#guardSector [data-sector]' ? cells : []) },
  };
  const noop = () => {};
  const elements = Object.fromEntries(
    ['forceOldB3', 'parryNow', 'retryAttack', 'debugApplyRetry', 'debugResetDefaults', 'showSurface']
      .map((id) => [id, { checked: false, addEventListener() {} }]),
  );
  bindShieldParryLabUiEvents({
    documentRef,
    windowRef,
    canvas,
    elements,
    handlers: {
      onDirectionalParry: (direction, pressed, source) => calls.push([direction, pressed, source]),
      onAttack: noop, onMode: noop, onView: noop, onParryInput: noop, onRetryAttack: noop,
      onForceOldB3: noop, onDebugApplyRetry: noop, onDebugResetDefaults: noop,
      onShowSurface: noop, onResize: noop,
    },
  });
  const dispatch = (type, event) => {
    let prevented = false;
    for (const handler of docListeners.get(type) || []) handler({ code: '', preventDefault() { prevented = true; }, stopPropagation() {}, ...event });
    return prevented;
  };
  return { calls, cells, dispatch };
}

test('R21N.1 I/J/L press and release the guard in one named direction', () => {
  const { calls, dispatch } = bindStubbedLab();
  // preventDefault so a directional press cannot also scroll or type into the page behind the lab.
  assert.equal(dispatch('keydown', { code: 'KeyI' }), true);
  dispatch('keydown', { code: 'KeyI', repeat: true });
  dispatch('keydown', { code: 'KeyI' }); // still held: the guard is already up
  dispatch('keyup', { code: 'KeyI' });
  dispatch('keydown', { code: 'KeyL' });
  dispatch('keyup', { code: 'KeyL' });
  assert.deepEqual(calls, [
    ['top', true, 'key'], ['top', false, undefined],
    ['right', true, 'key'], ['right', false, undefined],
  ]);
  // Ctrl+I is a browser command, not a parry.
  const before = calls.length;
  dispatch('keydown', { code: 'KeyI', ctrlKey: true });
  dispatch('keydown', { code: 'KeyJ', metaKey: true });
  assert.equal(calls.length, before);
});

test('R21N.1 the sector indicator is the button, for touch and mouse alike', () => {
  const { calls, cells, dispatch } = bindStubbedLab();
  const top = cells.find((cell) => cell.dataset.sector === 'top');
  top.fire('pointerdown', { pointerId: 7 });
  top.fire('pointerup');
  assert.deepEqual(calls, [['top', true, 'button'], ['top', false, undefined]]);
  // A finger that slides off the cell would never report its pointerup, so the cell captures it -
  // and leaving or cancelling releases the guard rather than sticking it up forever.
  assert.deepEqual(top.captured, [7]);
  const left = cells.find((cell) => cell.dataset.sector === 'left');
  left.fire('pointerdown', { pointerId: 8 });
  left.fire('pointerleave');
  assert.deepEqual(calls.slice(2), [['left', true, 'button'], ['left', false, undefined]]);
  // A key held when the window loses focus never reports its keyup.
  dispatch('keydown', { code: 'KeyJ' });
  dispatch('blur');
  assert.deepEqual(calls.slice(4), [['left', true, 'key'], ['left', false, undefined]]);
});

test('R21N.1 the entry names the direction before the guard rises', () => {
  const handler = entry.match(/onDirectionalParry: \(direction, pressed\) => \{[\s\S]*?\n {4}\},/);
  assert.ok(handler, 'entry should route the directional press');
  // The guard's RISING EDGE is the parry attempt (R20H.1). Choosing the sector after raising it
  // would arm every directional press against wherever the pointer happened to be left - the exact
  // failure this stage exists to remove.
  assert.ok(handler[0].indexOf('guardSector.select(direction)') < handler[0].indexOf('setGuardHeld(pressed, { directional: true })')); // R24G.1: and says it is directional
  // F is still bound, and still omnidirectional: the directional press is an addition.
  assert.match(entry, /onGuardKey:/);
});

test('R21N.1 the page ships three pressable cells with their keys on them', () => {
  const indicator = page.match(/<div id="guardSector"[\s\S]*?<\/div>\n/)[0];
  for (const [sector, key] of [['left', 'J'], ['top', 'I'], ['right', 'L']]) {
    assert.match(indicator, new RegExp(`data-sector="${sector}"[^<]*<small>${key}</small>`));
  }
  // It was an indicator; it is a control. Both of these would swallow the press.
  assert.doesNotMatch(indicator, /aria-hidden/);
  const style = page.match(/\.guard-sector\{[\s\S]*?\}/)[0];
  assert.doesNotMatch(style, /pointer-events:none/);
  // Touch: without this the browser spends the first ~300ms deciding whether the tap is a scroll,
  // against a 120ms window.
  assert.match(page, /\.guard-sector div\{[\s\S]*?touch-action:none/);
});
