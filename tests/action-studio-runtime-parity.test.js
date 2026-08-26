import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

function generatedModule(bundle, sourcePath) {
  const marker = `// ${sourcePath}`;
  const start = bundle.indexOf(marker);
  assert.notEqual(start, -1, `generated bundle is missing ${sourcePath}`);
  const next = bundle.indexOf('\n// src/', start + marker.length);
  return bundle.slice(start, next === -1 ? bundle.length : next);
}

test('G2.5.2 generated standalone Skyrim module cannot contain the stale scale runtime', async () => {
  const bundle = await read('tools/action-studio/action-studio.bundle.js');
  assert.match(bundle, /Runtime parity stage: G2\.5\.2/);

  const skyrimModule = generatedModule(bundle, 'src/animation/skyrim-animation-retarget.js');
  assert.match(skyrimModule, /function computeSkyrimTranslationScale\(/);
  assert.doesNotMatch(skyrimModule, /Math\.max\(0\.5,\s*Math\.min\(1\.5,\s*targetHeight\s*\/\s*sourceHeight\)\)/);
});

test('G2.5.2/T3.1 generated index identifies file, Pages bundle, parity module and G3.6.3 recovery gate runtime paths', async () => {
  const html = await read('tools/action-studio/index.html');
  assert.match(html, /__ACTION_STUDIO_RUNTIME_STAGE\s*=\s*['"]G2\.5\.2['"]/);
  assert.match(html, /__ACTION_STUDIO_ENTRY_MODE\s*=\s*['"]bundle-file['"]/);
  assert.match(html, /__ACTION_STUDIO_ENTRY_MODE\s*=\s*['"]bundle-http['"]/);
  assert.match(html, /__ACTION_STUDIO_ENTRY_MODE\s*=\s*['"]module['"]/);
  assert.match(html, /action-studio\.bundle\.js\?v=[0-9a-f]{12}/);
  assert.match(html, /runtime\.sampleAt\(['"]parry['"],\s*820\)/);
  assert.match(html, /SKYRIM_GUARD\/power_parry_g363/);
  assert.match(html, /sourceMs\s*>=\s*810/);
  assert.match(html, /sourceMs\s*<=\s*830/);
  assert.match(html, /action-studio-runtime-parity\.js/);
});

test('G2.5.2 parity probe uses the real Action Studio character and in-place prepared clip', async () => {
  const source = await read('tools/action-studio/action-studio-runtime-parity.js');
  assert.match(source, /__ACTION_STUDIO_G252_CHARACTER/);
  assert.match(source, /getPreparedClipDiagnostics\(CLIP_ID, true\)/);
  assert.match(source, /character\.playAnimation\(CLIP_ID/);
  assert.match(source, /preparedRootPositionTracks\s*===\s*0/);
  assert.match(source, /translationScale\s*>\s*0\s*&&\s*translationScale\s*<\s*0\.1/);
  assert.match(source, /SAMPLE_COUNT\s*=\s*1201/);
});
