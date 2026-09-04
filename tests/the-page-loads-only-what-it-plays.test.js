import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UAL2_ANIMATION_FILES, loadUal2AnimationLibrary } from '../src/animation/ual2-animation-library.js';
import { LONGSWORD } from '../src/game/weapon.js';
import { LONGSWORD_ATTACK_TIMINGS } from '../src/combat/longsword-attack-timings.js';

const read = (relative) => readFileSync(new URL(relative, new URL('../', import.meta.url)), 'utf8');

// Cold start - the page downloads what it plays, and nothing else.
//
// MEASURED: UAL2 ships eight clips and the game plays two. The other six - Regular_C,
// Regular_Combo, Heavy_Combo, Dash, Block and Hit_Knockback - had no consumer anywhere in src/ or
// tools/ except comments, and cost 1.35MB on every first visit. Six of the page's twenty requests
// were for animation nobody could see.
//
// The fix was not to delete them from the catalogue. UAL2_ANIMATION_FILES is the record of what the
// PACK contains, and that record is what makes sourcing a second weapon's clips a lookup rather
// than a search - handoff/40 leans on exactly this list. What changed is that loading is now a
// separate question from cataloguing, and the answer is derived from the weapon.

test('the longsword names the clips it plays, and the loader can be asked for just those', () => {
  assert.deepEqual([...LONGSWORD_ATTACK_TIMINGS.clipIds], [
    'UAL1/Sword_Attack',
    'UAL2/Sword_Regular_A',
    'UAL2/Sword_Regular_B',
  ]);
  // Reached through the weapon, which is how bootstrap asks.
  assert.equal(LONGSWORD.attackTimings.clipIds, LONGSWORD_ATTACK_TIMINGS.clipIds);
});

test('the catalogue still lists the whole pack, because that is what it is for', () => {
  assert.deepEqual(UAL2_ANIMATION_FILES.map((entry) => entry.id), [
    'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Regular_Combo',
    'Sword_Heavy_Combo', 'Sword_Dash', 'Sword_Block', 'Hit_Knockback',
  ]);
});

test('bootstrap asks for the weapon\'s clips rather than a list of its own', () => {
  const bootstrap = read('src/game/bootstrap.js');
  assert.match(bootstrap, /clipIds: LONGSWORD\.attackTimings\.clipIds/,
    'the load list must be derived from the weapon, or it becomes a second list to keep in step');
  // The failure this guards against is subtle: a hand-written list here would keep working while
  // silently going stale the first time a move's clip changed.
  assert.ok(!/clipIds: \[/.test(bootstrap), 'no literal clip list in bootstrap');
});

test('the six clips nothing plays are not requested', async () => {
  const requested = [];
  const loader = {
    load(url) { requested.push(url.split('/').pop()); throw new Error('stop: only the URL matters here'); },
  };
  // The loader throws on the first fetch, which is enough - the request list is built before any
  // of them resolve.
  await assert.rejects(() => loadUal2AnimationLibrary(loader, {
    THREE: {}, rig: { definition: {}, restTransforms: {} },
    clipIds: LONGSWORD.attackTimings.clipIds,
  }));
  for (const never of [
    'Sword_Regular_C.glb', 'Sword_Regular_Combo.glb', 'Sword_Heavy_Combo.glb',
    'Sword_Dash.glb', 'Sword_Block.glb', 'Hit_Knockback.glb',
  ]) {
    assert.ok(!requested.includes(never), `${never} has no consumer and must not be downloaded`);
  }
});

test('asking for a clip the pack does not have fails loudly rather than loading nothing', async () => {
  await assert.rejects(
    () => loadUal2AnimationLibrary(
      { load() {} },
      { THREE: {}, rig: { definition: {}, restTransforms: {} }, clipIds: ['UAL2/Sword_Nonexistent'] },
    ),
    /asked for clips it does not have: UAL2\/Sword_Nonexistent/,
  );
});

test('no clipIds means the whole pack, so every existing caller is unaffected', () => {
  // The option is additive: the studio labs and the tests that load the pack whole still do.
  const source = read('src/animation/ual2-animation-library.js');
  assert.match(source, /options\.clipIds \? new Set/, 'the subset must be opt-in');
  assert.match(source, /: UAL2_ANIMATION_FILES;/, 'and the default must be the whole catalogue');
});
