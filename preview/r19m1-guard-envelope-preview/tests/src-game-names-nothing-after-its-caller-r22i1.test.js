import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createCombatScene } from '../src/game/scene.js';
import { createFrameClock } from '../src/game/frame-clock.js';

// R22I.1 - src/game names things, not the entry that happens to call them.
//
// createShieldParryLabScene and createLabFrameClock both carried "Lab" because the lab is the only
// entry this project has yet. That is a fact about the caller, and putting it in the callee's name
// is how a module ends up looking optional when it is not.
//
// The investigation that decided the shape of the fix is worth keeping, because the obvious reading
// was wrong: NOTHING in src/ imports src/game - all seventeen of its modules are reached only from
// tools/ and tests/. That looks like "this layer is lab-only, move it to tools/", and it is not. It
// is what the TOP of a stack looks like: src/game imports combat 35 times, character 7 and
// animation 5, and nothing imports it back. The lab entry alone pulls twelve modules from it, so
// moving one file out would have left eleven siblings behind and made the layout less consistent,
// not more. The location was right; only the names were wrong.

const gameDir = new URL('../src/game/', import.meta.url);
const files = (await readdir(gameDir)).filter((name) => name.endsWith('.js'));
const sources = new Map(await Promise.all(
  files.map(async (name) => [name, await readFile(new URL(name, gameDir), 'utf8')]),
));

test('R22I.1 no exported name in src/game is named after a caller', () => {
  const offenders = [];
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/export (?:function|const) ([A-Za-z_][A-Za-z0-9_]*)/g)) {
      // "Lab" is the one this stage removed. A composition layer that survives past the lab will
      // outlive that word entirely, so the check is on the word rather than on the two names.
      if (/lab/i.test(match[1])) offenders.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'src/game must not name an export after the lab');
});

test('R22I.1 the two renamed modules describe what they are, and the clock earns its name', () => {
  // Behavioural, not textual. The first draft of this asserted the source did NOT contain the
  // string "createFixedStepFrameClock" - and failed, because the module's own comment names that
  // as the rejected alternative. A test that forbids a word cannot tell a use from an explanation,
  // which is the whole case against asserting on source text.
  assert.equal(createCombatScene.name, 'createCombatScene');
  assert.equal(createFrameClock.name, 'createFrameClock');

  // And why NOT createFixedStepFrameClock: it is a wall clock by default. Two ticks 16ms apart
  // report about 16ms, not some fixed step.
  let now = 0;
  const clock = createFrameClock({ now: () => now });
  assert.ok(Math.abs(clock.tick(16) - 16) < 1e-9, 'the default is the wall');
  assert.ok(Math.abs(clock.tick(48) - 32) < 1e-9, 'and it keeps following it');
  // Fixed-step is a capability a harness turns on, which is exactly what the name must not claim.
  clock.setFixedStep(1000 / 60);
  assert.ok(Math.abs(clock.tick(999) - 1000 / 60) < 1e-9, 'pinned, the wall stops mattering');
  clock.setFixedStep(null);
  assert.ok(clock.tick(1015) > 1, 'and the harness can hand the clock back');
});

test('R22I.1 src/game is still the top of the stack, which is why it stayed put', () => {
  // The measurement that refuted moving it. If anything in src/ ever imports src/game, this layer
  // has stopped being a composition layer and where it lives is worth asking again.
  const importsGame = [];
  for (const [file, source] of sources) {
    for (const match of source.matchAll(/from '(\.\.\/[a-z-]+)\//g)) importsGame.push(`${file} -> ${match[1]}`);
  }
  // src/game reaches DOWN into combat, character and animation, and those never reach back up.
  assert.ok(importsGame.length > 0, 'src/game composes the layers below it');
  for (const edge of importsGame) {
    assert.match(edge, /-> \.\.\/(combat|character|animation)$/, `unexpected edge: ${edge}`);
  }
});
