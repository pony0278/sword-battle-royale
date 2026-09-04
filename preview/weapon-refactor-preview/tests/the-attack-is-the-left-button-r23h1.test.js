import test from 'node:test';
import assert from 'node:assert/strict';
import { bindShieldParryLabUiEvents } from '../tools/action-studio/shield-parry-r281/lab-ui.js';

// R23H.1 - the swing moves to the left mouse button, and free look gets out of its way.
//
// The aim was already on the mouse - bindGuardAim follows every pointermove and the HUD draws the
// sector it picks - so putting the swing on a key left the hand holding the aim with nothing to
// press. What made the left button look unavailable was free look, which starts its drag on
// pointerdown; what makes it available is that free look REFUSES while locked (measured in
// free-movement-controller: look() returns before doing anything), and locked is the mode an
// exchange happens in. So in the fight the left button was already dead.
//
// pointerdown rather than a click, deliberately: this is the most timing-sensitive input in the
// game and it is read inside a 120ms parry window. Waiting for a release would add a delay the
// player controls, so two identical intentions would land at different times.

function bindStubbedCanvas() {
  const canvasListeners = new Map();
  const docListeners = new Map();
  const calls = { attack: 0, look: [] };
  const canvas = {
    addEventListener(type, handler) {
      if (!canvasListeners.has(type)) canvasListeners.set(type, []);
      canvasListeners.get(type).push(handler);
    },
    focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    ownerDocument: { querySelectorAll: () => [] },
  };
  const noop = () => {};
  const elements = Object.fromEntries(
    ['forceOldB3', 'parryNow', 'retryAttack', 'debugApplyRetry', 'debugResetDefaults', 'showSurface']
      .map((id) => [id, { checked: false, addEventListener() {} }]),
  );
  bindShieldParryLabUiEvents({
    documentRef: {
      addEventListener(type, handler) {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(handler);
      },
      querySelectorAll: () => [],
    },
    windowRef: { addEventListener() {} },
    canvas,
    elements,
    handlers: {
      onAttack: () => { calls.attack += 1; },
      onLook: (delta) => calls.look.push(delta),
      onDirectionalParry: noop, onMode: noop, onView: noop, onParryInput: noop, onRetryAttack: noop,
      onForceOldB3: noop, onDebugApplyRetry: noop, onDebugResetDefaults: noop,
      onShowSurface: noop, onResize: noop, onAim: noop, onDodge: noop, onMoveIntent: noop,
      onLockToggle: noop, onSprint: noop,
    },
  });
  const onCanvas = (type, event = {}) => {
    for (const handler of canvasListeners.get(type) || []) {
      handler({ button: 0, pointerType: 'mouse', clientX: 0, clientY: 0, preventDefault() {}, ...event });
    }
  };
  const onDocument = (type, event = {}) => {
    for (const handler of docListeners.get(type) || []) {
      handler({ code: '', preventDefault() {}, stopPropagation() {}, ...event });
    }
  };
  return { calls, onCanvas, onDocument, canvasListeners };
}

test('R23H.1 the left mouse button swings, on the press rather than the release', () => {
  const { calls, onCanvas } = bindStubbedCanvas();
  onCanvas('pointerdown', { button: 0 });
  assert.equal(calls.attack, 1, 'the swing goes out when the button goes down');
  onCanvas('pointerup', { button: 0 });
  assert.equal(calls.attack, 1, 'and the release adds nothing - waiting for it would add latency');
});

test('R23H.1 a right-drag looks and never swings', () => {
  const { calls, onCanvas } = bindStubbedCanvas();
  onCanvas('pointerdown', { button: 2, clientX: 100 });
  onCanvas('pointermove', { clientX: 140 });
  onCanvas('pointermove', { clientX: 210 });
  onCanvas('pointerup', { button: 2 });
  assert.equal(calls.attack, 0, 'the camera button must never throw a swing');
  assert.deepEqual(calls.look, [40, 70], 'and it looks by the distance it was dragged');
});

test('R23H.1 the left button no longer drags the camera', () => {
  const { calls, onCanvas } = bindStubbedCanvas();
  onCanvas('pointerdown', { button: 0, clientX: 100 });
  onCanvas('pointermove', { clientX: 300 });
  assert.equal(calls.look.length, 0, 'holding the attack button must not swing the camera with it');
  assert.equal(calls.attack, 1);
});

test('R23H.1 the right button opens no context menu, or the drag dies on its first frame', () => {
  const { canvasListeners } = bindStubbedCanvas();
  let prevented = false;
  for (const handler of canvasListeners.get('contextmenu') || []) handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('R23H.1 a finger keeps the drag it had, and does not swing by touching the screen', () => {
  // Touch has no buttons - every touch pointerdown reports button 0 - so without this a tap
  // anywhere on the scene would attack and the camera could never be moved by hand.
  const { calls, onCanvas } = bindStubbedCanvas();
  onCanvas('pointerdown', { pointerType: 'touch', button: 0, clientX: 100 });
  onCanvas('pointermove', { pointerType: 'touch', clientX: 160 });
  assert.equal(calls.attack, 0, 'a finger does not swing');
  assert.deepEqual(calls.look, [60], 'a finger still looks');
});

test('R23H.1 K still swings, for a hand that is not on the mouse', () => {
  const { calls, onDocument } = bindStubbedCanvas();
  onDocument('keydown', { code: 'KeyK' });
  assert.equal(calls.attack, 1);
  onDocument('keydown', { code: 'KeyK', repeat: true });
  assert.equal(calls.attack, 1, 'a held key is one swing, not a stream of them');
});
