import test from 'node:test';
import assert from 'node:assert/strict';
import { createShieldParryLabUi } from '../tools/action-studio/shield-parry-r281/lab-ui.js';

function createClassList() {
  const values = new Set();
  return {
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
      return values.has(name);
    },
    contains(name) { return values.has(name); },
  };
}

function createElement() {
  return {
    className: '',
    textContent: '',
    classList: createClassList(),
  };
}

function createElements() {
  return Object.fromEntries([
    'hudAttack', 'hudInput', 'parryCue', 'parryCueMain', 'parryCueDetail',
    'hudContact', 'hudCoupling', 'hudShield', 'hudWeapon', 'hudSeparation',
    'hudLineClearance', 'hudRecoil', 'hudDiagnostic', 'parryNow', 'retryAttack',
  ].map((key) => [key, createElement()]));
}

test('R18M Visual Preview Parry cue uses the injected retryAttack element', () => {
  const elements = createElements();
  const ui = createShieldParryLabUi(elements);

  assert.doesNotThrow(() => ui.updateParryCue({ ready: false }));
  assert.equal(elements.retryAttack.classList.contains('retry-attention'), false);

  assert.doesNotThrow(() => ui.updateParryCue({
    ready: true,
    selectedMode: 'parry',
    step3AContactTransfer: { accepted: false, reason: 'runtime-contract-probe' },
  }));
  assert.equal(elements.retryAttack.classList.contains('retry-attention'), true);
});
