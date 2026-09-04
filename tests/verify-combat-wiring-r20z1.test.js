import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tools/static-server.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');

// R20Z.1 - the wiring that makes the browser gates real.
//
// These assert on configuration and generated output, which is not the same thing as asserting on
// implementation text: the config IS the subject. A test that says "ci.yml runs the gate" is the
// only way to notice the gate being dropped, and dropping it is silent by nature.

// Vite - there is one page again, and this is what says so.
//
// R20Z.1 originally asserted that a generated probe page was the lab page with two CDN script tags
// swapped for node_modules, character for character. That equality existed to stop the drift a
// hand-synced second page had accumulated over several stages. The bundle removes the second page:
// Three.js is a module import, so the page a runner boots and the page a player loads are the same
// file, and nothing has to be kept in step with anything.
test('R20Z.1 the lab page reaches no other origin, because Three.js is bundled with it', () => {
  const lab = read('tools/action-studio/shield-driven-contact-coupling-lab.html');
  assert.ok(!lab.includes('https://cdn'), 'the page must not load anything from a CDN');
  assert.ok(!lab.includes('three.min.js'), 'the classic Three.js build is not loaded by tag any more');

  const namespace = read('tools/action-studio/three-namespace.js');
  assert.match(namespace, /import \* as ThreeModule from 'three'/, 'Three.js must be imported as a module');
  assert.match(namespace, /from 'three\/examples\/jsm\/loaders\/GLTFLoader\.js'/, 'and the ESM GLTFLoader');
  // bootstrap.js constructs `new THREE.GLTFLoader()` five times through the namespace it is handed,
  // which is the shape the classic examples/js build produced. The bundle has to preserve it.
  assert.match(namespace, /\{ \.\.\.ThreeModule, GLTFLoader \}/, 'the namespace must carry GLTFLoader');
  // Sourcing a renderer is an entry's job, not the game's: everything under src/ is HANDED a THREE
  // rather than importing one, which is what lets it run headless in the tests.
  assert.ok(!namespace.includes('../../src/'), 'the renderer namespace must not reach into the game');
});

test('R20Z.1 the Three.js the page bundles is the one package.json pins', () => {
  // It used to be possible for the CDN tag and the devDependency to disagree, which would have
  // meant every browser gate measuring a different renderer than players got. Now there is one
  // source, and this asserts the pin is exact rather than a range: r147 removed examples/js and
  // renamed outputEncoding, and this repository's calibration lives in floats such a change moves.
  const declared = JSON.parse(read('package.json')).devDependencies?.three;
  assert.equal(declared, '0.128.0', 'three must be pinned exactly, not ranged');
});

test('R20Z.1 the gates are wired into CI, and CI can reach a browser', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /npm run verify:combat/, 'the browser gates must run in CI');
  assert.match(ci, /CHROME_PATH:/, 'and CI must say where the browser is');
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['verify:combat'], 'node build/verify-combat.mjs');
  assert.equal(scripts['build:web'], 'vite build');
  assert.equal(scripts['verify:built-lab'], 'node build/verify-built-lab.mjs');

  const runner = read('build/verify-combat.mjs');
  // Both gates, or the command is only pretending to be one.
  assert.match(runner, /verify-golden-grid\.mjs/);
  assert.match(runner, /verify-shield-parry-gate\.mjs/);
  assert.match(runner, /vite\/bin\/vite\.js/, 'the bundle must be built before it is driven');
  assert.match(runner, /root: resolve\(ROOT, 'dist'\)/, 'and the gates must serve what was built');
});

test('R20Z.1 the static server serves the repository and refuses to leave it', async () => {
  const served = await startStaticServer({ root: fileURLToPath(ROOT), port: 0 });
  try {
    const page = await fetch(`${served.url}/tools/action-studio/shield-driven-contact-coupling-lab.html`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);

    const module = await fetch(`${served.url}/src/combat/lane-walk-cycle.js`);
    assert.equal(module.status, 200);
    // ES modules will not load as octet-stream, which is the whole reason the gates need a server.
    assert.match(module.headers.get('content-type'), /javascript/);

    const missing = await fetch(`${served.url}/nothing-here.js`);
    assert.equal(missing.status, 404);

    const escape = await fetch(`${served.url}/../../etc/passwd`);
    assert.ok(escape.status === 403 || escape.status === 404, `traversal returned ${escape.status}`);
  } finally {
    await served.close();
  }
});
