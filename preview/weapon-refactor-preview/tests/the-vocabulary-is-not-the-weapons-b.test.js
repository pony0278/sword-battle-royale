import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTACK_DIRECTIONS } from '../src/combat/attack-directions.js';
import { ATTACK_PHASES, getAttackPhase } from '../src/combat/attack-phases.js';
import { GUARD_CORRECTION_SCOPE, getGuardCorrectionBones } from '../src/combat/guard-correction-scope.js';

// B — handoff/39 listed four things that carried the longsword's name over a value that has nothing
// to do with what is held. They now live in four modules that name what they are. This file is what
// stops that from being undone by accident: it pins the values across the move, and then checks the
// two properties that make the move worth having.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

async function sourceFiles(directory = SRC) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await sourceFiles(full));
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

test('B the directional triangle survived the move unchanged', () => {
  assert.deepEqual([...ATTACK_DIRECTIONS], ['top', 'right', 'left']);
  assert.ok(Object.isFrozen(ATTACK_DIRECTIONS));
});

test('B the phase vocabulary survived the move unchanged', () => {
  assert.deepEqual({ ...ATTACK_PHASES }, {
    IDLE: 'idle',
    WINDUP: 'attack_windup',
    ACTIVE: 'attack_active',
    RECOVERY: 'attack_recovery',
    INTERRUPTED: 'attack_interrupted',
  });
  assert.ok(Object.isFrozen(ATTACK_PHASES));
});

test('B getAttackPhase reads a profile, not a weapon', () => {
  // Three landmarks, and nothing else. Any weapon's timings record produces them.
  const profile = { activeStartSeconds: 0.30, activeEndSeconds: 0.50, durationSeconds: 1.20 };
  assert.equal(getAttackPhase(null, 0.4), ATTACK_PHASES.IDLE);
  assert.equal(getAttackPhase(profile, 0.29), ATTACK_PHASES.WINDUP);
  assert.equal(getAttackPhase(profile, 0.30), ATTACK_PHASES.ACTIVE);
  assert.equal(getAttackPhase(profile, 0.50), ATTACK_PHASES.ACTIVE);
  assert.equal(getAttackPhase(profile, 0.51), ATTACK_PHASES.RECOVERY);
  assert.equal(getAttackPhase(profile, 1.20), ATTACK_PHASES.IDLE);
  // A negative elapsed clamps to zero rather than falling through to IDLE.
  assert.equal(getAttackPhase(profile, -5), ATTACK_PHASES.WINDUP);
});

test('B the correction scope survived the move unchanged', () => {
  assert.deepEqual([...GUARD_CORRECTION_SCOPE.requiredBones], ['upperarm.r', 'lowerarm.r', 'wrist.r']);
  assert.deepEqual([...GUARD_CORRECTION_SCOPE.optionalBones], ['chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'handslot.r']);
  assert.deepEqual([...GUARD_CORRECTION_SCOPE.forbiddenBones], [
    'root', 'hips', 'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r', 'foot.l', 'foot.r', 'toes.l', 'toes.r',
  ]);
  assert.deepEqual({ ...GUARD_CORRECTION_SCOPE.maxLocalCorrectionDegrees }, {
    chest: 8,
    'upperarm.r': 40,
    'lowerarm.r': 50,
    'wrist.r': 65,
    'upperarm.l': 20,
    'lowerarm.l': 25,
    'wrist.l': 30,
    'handslot.r': 15,
  });
  assert.deepEqual({ ...GUARD_CORRECTION_SCOPE.policy }, {
    preserveRootAndLowerBody: true,
    preserveSourceTorsoWeight: true,
    preserveOffHandUnlessNeeded: true,
    equipmentTrimOnly: true,
    equipmentTrimMaxDegrees: 15,
  });
  assert.deepEqual(getGuardCorrectionBones(), [
    'upperarm.r', 'lowerarm.r', 'wrist.r', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'handslot.r',
  ]);
});

test('B the vocabulary does not import the weapon that used to own it', async () => {
  // The point of the move. A module that has to import longsword-anything to state its own
  // vocabulary has not been decoupled - it has been renamed.
  for (const name of ['attack-directions.js', 'attack-phases.js', 'guard-correction-scope.js', 'guard-quaternion-correction.js']) {
    const source = await readFile(path.join(SRC, 'combat', name), 'utf8');
    const imports = [...source.matchAll(/^import[\s\S]*?from '([^']+)';$/gm)].map((match) => match[1]);
    for (const specifier of imports) {
      assert.ok(
        !/longsword|greatsword/.test(specifier),
        `${name} imports ${specifier}, which names a weapon`,
      );
    }
  }
});

test('B the old names are gone from src, not merely unused', async () => {
  // A leftover alias is how a rename rots: the next weapon copies whichever name it finds first.
  const retired = [
    'LONGSWORD_ATTACK_DIRECTIONS',
    'LONGSWORD_ATTACK_PHASES',
    'LONGSWORD_GUARD_CORRECTION_SCOPE',
    'getLongswordGuardCorrectionBones',
    'longswordAttackPhases',
  ];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8');
    for (const name of retired) {
      assert.ok(
        !new RegExp(`\\b${name}\\b`).test(source),
        `${path.relative(SRC, file)} still carries the retired name ${name}`,
      );
    }
  }
});
