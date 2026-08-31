import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1].split('?')[0])
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => resolve(dirname(file), specifier));
}

// R20Z.4 - the one-way rule, and the reason it is checkable without a list.
//
// The game used to live inside the lab: fifteen modules composing fighters, camera, feet and
// contact, in tools/action-studio/shield-parry-r281/ alongside the HUD, the verification report and
// the diagnostics. Nothing separated them but a naming habit, and twice a gameplay controller had
// quietly imported a diagnostic - which is exactly the coupling that makes a game impossible to
// lift out of the lab it was prototyped in.
//
// Moving them to src/game/ turns that judgement call into a directory boundary: src/ is the game,
// tools/ is the workbench, and the workbench may reach into the game but never the other way. That
// needs no manifest anybody has to maintain - a new module lands under src/ or under tools/, and
// the rule reads itself.
test('R20Z.4 nothing under src/ may import anything under tools/', () => {
  const srcRoot = join(ROOT, 'src');
  const toolsRoot = join(ROOT, 'tools');
  const offenders = [];
  for (const file of walk(srcRoot)) {
    for (const target of importsOf(file)) {
      if (target.startsWith(toolsRoot)) {
        offenders.push(`${relative(ROOT, file)} → ${relative(ROOT, target)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `the game reached into the workbench:\n  ${offenders.join('\n  ')}`);
});

test('R20Z.4 the game composition is where the game is', () => {
  // The modules that move fighters, and would have to come along to any other entry point - a
  // CrazyGames build, a headless server. If one of these turns up back under tools/ the split has
  // started leaking, which is worth failing over even though nothing is broken yet.
  const expected = [
    'attacker-presentation.js', 'authored-incoming-velocity.js', 'body-strike-reaction-controller.js',
    'bootstrap.js', 'camera-controller.js', 'contact-handoff-controller.js', 'exchange-state.js',
    'frame-clock.js', 'free-movement-controller.js', 'geometry.js', 'lane-controller.js',
    'neutral-stance.js', 'player-controller.js', 'pre-contact-controller.js', 'scene.js',
  ];
  for (const name of expected) {
    assert.ok(existsSync(join(ROOT, 'src/game', name)), `src/game/${name} is missing`);
    assert.ok(!existsSync(join(ROOT, 'tools/action-studio/shield-parry-r281', name)),
      `${name} is back under the lab folder`);
  }
});

test('R20Z.4 the lab is still allowed to reach into the game', () => {
  // The direction that must keep working: the lab entry composes the game and hangs its HUD,
  // diagnostics and verification report off it. If this ever came back empty the split would have
  // gone too far and the lab would be composing a copy of something.
  const entry = readFileSync(join(ROOT, 'tools/action-studio/shield-driven-contact-coupling-lab-r281.js'), 'utf8');
  const gameImports = [...entry.matchAll(/from\s*['"]([^'"]*src\/game\/[^'"]+)['"]/g)];
  assert.ok(gameImports.length >= 10, `the lab entry imports ${gameImports.length} game modules`);
});
