import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { MANIFEST, verifyFrozenSources } from '../build/verify-frozen-sources.mjs';
import { SKYRIM_GREATSWORD_CONVERTED_FILES, SKYRIM_GUARD_CONVERTED_FILES } from '../src/animation/skyrim-converted-animation-library.js';

// The check that was missing when it mattered.
//
// Three workflows each carried the same three sha256 literals inline. A commit in this repository's
// own history rewrote those files - strip-presentation-meshes.mjs, taking 1.13 MB of unused
// presentation geometry out of them - and updated none of the three. All three went red, on main as
// well as on the branch, and stayed red for days, because the only thing checking those bytes was a
// workflow nobody ran locally and a hash literal nobody could see was stale.
//
// The hashes are in one file now and this runs in `npm test`, so the next intended rewrite fails in
// the two seconds before the commit rather than in CI afterwards, and the fix is to update one
// record on purpose.

test('every committed Skyrim source GLB is byte-for-byte the reviewed one', async () => {
  const { results, ok } = await verifyFrozenSources();
  const broken = results.filter((result) => !result.ok);
  assert.ok(ok, broken.map((result) => `${result.file}: ${result.reason}`).join('; '));
  assert.ok(results.length >= 5, `only ${results.length} assets are frozen`);
});

test('the frozen list covers every pack the studio can load', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const frozen = new Set(manifest.assets.map((entry) => entry.file.split('/').pop()));
  // A pack entry with no frozen hash is an asset that could be replaced without anything noticing,
  // which is the whole failure this file exists for - so the two lists are tied together rather
  // than maintained side by side.
  for (const entry of [...SKYRIM_GUARD_CONVERTED_FILES, ...SKYRIM_GREATSWORD_CONVERTED_FILES]) {
    assert.ok(frozen.has(entry.file), `${entry.file} is loadable but not frozen`);
  }
});

test('no workflow carries a hash of its own any more', async () => {
  // The duplication is the defect, not the specific stale values: three copies of one fact, and
  // updating the asset touched none of them. This is the KEEP shape R22J.1 names - a workflow step
  // has no behaviour to observe from here, and a gate that quietly stops checking is silent by
  // nature - so it is read as text on purpose, and each file is named by its own assertion so a
  // failure says which workflow drifted.
  const reaction = await readFile(new URL('../.github/workflows/guard-reaction-runtime-visual.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(reaction, /sha256sum/);
  assert.match(reaction, /node build\/verify-frozen-sources\.mjs/);

  const perfect = await readFile(new URL('../.github/workflows/perfect-parry-deflect-ab.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(perfect, /sha256sum/);
  assert.match(perfect, /node build\/verify-frozen-sources\.mjs/);

  const probe = await readFile(new URL('../.github/workflows/parry-contact-deflect-probe.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(probe, /sha256sum/);
  assert.match(probe, /node build\/verify-frozen-sources\.mjs/);
});
