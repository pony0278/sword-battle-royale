import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

// Cold start, second page. The lab page reached one origin already; Action Studio still opened with
// a renderer from cdnjs, a loader from jsdelivr, and two font origins on top. Vite now builds it
// from the same template the standalone build uses, so there is one page to keep correct.

test('the Action Studio template no longer reaches Google for its typefaces', async () => {
  const template = await read('tools/action-studio/index.template.html');
  assert.doesNotMatch(template, /fonts\.googleapis\.com/);
  assert.doesNotMatch(template, /fonts\.gstatic\.com/);
  assert.match(template, /<link rel="stylesheet" href="\.\/fonts\.css">/);

  // The generated standalone page inherits it, which is the point of generating it from the
  // template rather than maintaining a second copy.
  const standalone = await read('tools/action-studio/index.html');
  assert.doesNotMatch(standalone, /fonts\.googleapis\.com/);
  assert.doesNotMatch(standalone, /fonts\.gstatic\.com/);
});

test('the vendored stylesheet points at files that exist, and nowhere else', async () => {
  const css = await read('tools/action-studio/fonts.css');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
  assert.ok(urls.length >= 12, `expected the twelve @font-face blocks Google declares, found ${urls.length}`);
  for (const url of urls) {
    assert.match(url, /^\.\/fonts\/[a-z-]+\.woff2$/, `${url} is not a local woff2`);
    const file = new URL(`../tools/action-studio/${url.slice(2)}`, import.meta.url);
    assert.ok((await stat(file)).size > 0, `${url} is missing or empty`);
  }
  // Four files behind twelve blocks: both families ship as variable fonts, so the weights share a
  // file per subset. Naming them per weight committed four byte-identical copies of Inter.
  assert.equal(new Set(urls).size, 4);
});

test('the standalone page keeps its CDN renderer, because file:// has nowhere else to get one', async () => {
  // Deliberate asymmetry, and the reason this test says so out loud: the bundled page is served
  // over http and gets its renderer from the build, while the standalone classic bundle exists to
  // be opened by double-clicking the file, where a bare module specifier cannot resolve.
  const standalone = await read('tools/action-studio/index.html');
  assert.match(standalone, /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128/);
  assert.match(standalone, /cdn\.jsdelivr\.net\/npm\/three@0\.128\.0/);
});

test('Vite builds the Action Studio page from the template the standalone build uses', async () => {
  const config = await read('vite.config.js');
  assert.match(config, /studio: fileURLToPath\(new URL\('\.\/tools\/action-studio\/index\.template\.html'/);
  // The renderer swap is what makes the bundled page single-origin, and the plugin throws rather
  // than silently emitting a page that still reaches cdnjs.
  assert.match(config, /index\.template\.html no longer carries the two CDN renderer tags/);
});

test('the publish overlay ships both built pages', async () => {
  const publish = await read('build/publish-gh-pages.sh');
  assert.match(publish, /for page in shield-driven-contact-coupling-lab\.html index\.html; do/);
});
