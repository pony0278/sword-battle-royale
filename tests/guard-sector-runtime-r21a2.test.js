import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { createGuardSectorRuntime } from '../src/game/guard-sector-runtime.js';
import { createGuardSectorIndicator } from '../tools/action-studio/shield-parry-r281/guard-sector-indicator.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const view = { viewportWidth: 1100, viewportHeight: 800 };

test('R21A.2 the runtime holds an aim between frames', () => {
  const runtime = createGuardSectorRuntime();
  assert.equal(runtime.sector, null);
  assert.equal(runtime.report.reason, 'never-aimed');

  assert.equal(runtime.aim({ ...view, offsetX: 0, offsetY: -300 }).sector, 'top');
  assert.equal(runtime.sector, 'top');
  assert.equal(runtime.aim({ ...view, offsetX: 320, offsetY: 0 }).sector, 'right');
  // Drifting back through the middle is not letting go of the guard.
  assert.equal(runtime.aim({ ...view, offsetX: 2, offsetY: 2 }).sector, 'right');
  assert.equal(runtime.reset().sector, null);
});

test('R21A.2 the indicator writes only its own element, and only on a change', () => {
  const cells = ['top', 'right', 'left'].map((sector) => ({
    dataset: { sector },
    classList: { toggles: [], toggle(name, on) { this.toggles.push(`${name}:${on}`); } },
  }));
  const root = {
    classList: { toggle() {} },
    querySelectorAll: () => cells,
  };
  const indicator = createGuardSectorIndicator(root);
  assert.equal(indicator.update({ sector: 'top', threatDirection: null }), true);
  assert.equal(indicator.update({ sector: 'top', threatDirection: null }), false, 'no change, no writes');
  assert.equal(indicator.update({ sector: 'top', threatDirection: 'left' }), true);
  const top = cells.find((cell) => cell.dataset.sector === 'top');
  assert.ok(top.classList.toggles.includes('aimed:true'));
  const left = cells.find((cell) => cell.dataset.sector === 'left');
  assert.ok(left.classList.toggles.includes('threat:true'));
  // A missing element is a lab without the widget, not a crash.
  assert.doesNotThrow(() => createGuardSectorIndicator(null).update({ sector: 'top' }));
});

test('R21A.2 no rule consults the sector yet', () => {
  // Step one is that the direction exists and is visible, so that whether a human can read an
  // attack and point at it in time is answered by hands rather than by argument. If a rule started
  // reading this before that answer existed, the interesting question would have been decided by
  // accident - so the absence is the assertion, checked structurally rather than by grep.
  const combatDir = join(ROOT, 'src/combat');
  const offenders = readdirSync(combatDir)
    .filter((name) => name.endsWith('.js') && name !== 'guard-sector.js')
    .filter((name) => readFileSync(join(combatDir, name), 'utf8').includes("from './guard-sector.js'"));
  assert.deepEqual(offenders, [], `combat rules must not read the aim yet: ${offenders}`);

  // The parry path specifically - the one it will eventually join.
  for (const name of ['parry-gate-verdict.js', 'predictive-intercept-parry.js', 'guard-cone-gate.js',
    'guard-coverage-director.js', 'contact-lifecycle-director.js']) {
    const source = readFileSync(join(combatDir, name), 'utf8');
    assert.ok(!source.includes('guard-sector'), `${name} must not read the aim yet`);
  }
});
