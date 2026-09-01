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

test('R21C.2 the indicator shows one thing: where the player is pointing', () => {
  const cells = ['top', 'right', 'left'].map((sector) => ({
    dataset: { sector },
    classList: { toggles: [], toggle(name, on) { this.toggles.push(`${name}:${on}`); } },
  }));
  const root = {
    classList: { toggle() {} },
    querySelectorAll: () => cells,
  };
  const indicator = createGuardSectorIndicator(root);
  assert.equal(indicator.update({ sector: 'top' }), true);
  assert.equal(indicator.update({ sector: 'top' }), false, 'no change, no writes');
  assert.equal(indicator.update({ sector: 'left' }), true);
  const top = cells.find((cell) => cell.dataset.sector === 'top');
  assert.ok(top.classList.toggles.includes('aimed:true'));
  assert.ok(top.classList.toggles.includes('aimed:false'), 'and gives the cell back when the aim moves');
  // R21C.2: the attacker's direction is not drawn here any more. Two independent variables sharing
  // three cells made "my aim matches the attack" a third colour to learn, and it flashed at the
  // bottom of the screen exactly when the player should have been watching the opponent.
  const toggled = cells.flatMap((cell) => cell.classList.toggles);
  assert.ok(!toggled.some((entry) => entry.startsWith('threat:')), 'no threat channel remains');
  // A missing element is a lab without the widget, not a crash.
  assert.doesNotThrow(() => createGuardSectorIndicator(null).update({ sector: 'top' }));
});

test('R21A.2 no rule consults the sector yet', () => {
  // Step one is that the direction exists and is visible, so that whether a human can read an
  // attack and point at it in time is answered by hands rather than by argument. If a rule started
  // reading this before that answer existed, the interesting question would have been decided by
  // accident - so the absence is the assertion, checked structurally rather than by grep.
  const combatDir = join(ROOT, 'src/combat');
  // R21N.1: the directional input module imports the sector VOCABULARY - the three names - to
  // validate a keystroke against. That is the opposite of a rule reading the aim: it writes the
  // aim, and it is checked below that it takes nothing else from the module.
    // R21Q.1 joins them: it imports the three names to build the mirror between the attacker's
  // frame and the defender's. It writes no aim and reads none - it restates an ATTACK.
  const vocabularyOnly = ['guard-sector.js', 'directional-parry-input.js', 'attack-direction-as-defended.js'];
  const offenders = readdirSync(combatDir)
    .filter((name) => name.endsWith('.js') && !vocabularyOnly.includes(name))
    .filter((name) => readFileSync(join(combatDir, name), 'utf8').includes("from './guard-sector.js'"));
  assert.deepEqual(offenders, [], `combat rules must not read the aim yet: ${offenders}`);
  const directionalInput = readFileSync(join(combatDir, 'directional-parry-input.js'), 'utf8');
  assert.match(directionalInput, /import \{ GUARD_SECTORS \} from '\.\/guard-sector\.js';/);
  assert.doesNotMatch(directionalInput, /planGuardSector/);

  // The parry path specifically - the one it will eventually join.
  for (const name of ['parry-gate-verdict.js', 'predictive-intercept-parry.js', 'guard-cone-gate.js',
    'guard-coverage-director.js', 'contact-lifecycle-director.js']) {
    const source = readFileSync(join(combatDir, name), 'utf8');
    assert.ok(!source.includes('guard-sector'), `${name} must not read the aim yet`);
  }
});
