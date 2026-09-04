import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cp, rename } from 'node:fs/promises';

// Cold start — the published page, bundled.
//
// MEASURED before this existed, on the page the community plays
// (tools/action-studio/shield-driven-contact-coupling-lab.html): 178 ES modules, 1652 KB of
// unminified source, served one request each because publish-gh-pages.sh copies the repository to
// gh-pages verbatim - plus Three.js from a second origin (cdnjs) and its GLTFLoader from a third
// (jsdelivr). Two extra DNS lookups and TLS handshakes before the renderer can be constructed.
//
// WHAT THIS DELIBERATELY DOES NOT DO: change Three.js. three@0.128.0 is pinned in package.json and
// stays pinned. It already ships three.module.js and an ESM examples/jsm GLTFLoader, so bundling
// needs no upgrade - and an upgrade is the one thing that would move the measured combat, because
// r147 removed examples/js and renamed outputEncoding, and this repository's calibration lives in
// floats that such a change moves silently.
//
// Nor does it change the source layout. The lab page and its 178 modules are the input, unchanged;
// Vite is a second way of DELIVERING them, and the gates run against the delivered form so that
// what ships is what is measured - which is the lesson R20Z paid for when a hand-synced probe page
// drifted several stages behind the page it stood in for.
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  // Assets are read from paths relative to the page (assets/…, and the animation packs the
  // libraries fetch at runtime), so the build has to keep the same relative shape rather than
  // rewriting them onto an absolute base.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // NOT the default 'assets'. The repository already has an assets/ directory holding the
    // animation packs, and the page reaches it as '../../assets/…' - a relative URL resolved
    // against the page, which lands on the build's own output directory if the two share a name.
    // Measured the hard way: the first build put the chunks exactly where the glb packs had to be.
    assetsDir: 'bundle',
    // The source is authored against r128 and shipped unminified today; keeping the target modern
    // avoids a transpile pass adding behaviour nobody measured.
    target: 'es2022',
    rollupOptions: {
      input: {
        lab: fileURLToPath(new URL('./tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url)),
        // The second page, added after the lab. Its input is the TEMPLATE, not the generated
        // index.html: the generated one picks its entry at runtime by creating script elements, so
        // there is nothing static for Rollup to follow. The template already carries the module
        // bootstrap the ?g252=1 path uses, which is exactly the entry a bundle wants. Output is
        // renamed to index.html below.
        studio: fileURLToPath(new URL('./tools/action-studio/index.template.html', import.meta.url)),
      },
      output: {
        // Three in its own chunk. It is most of the bytes and changes only when the pin does, so a
        // gameplay change ships without making a returning player re-download the renderer.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
    // Three is most of the bundle and changes only when the pin does; splitting it means a code
    // change ships without making returning players re-download the renderer.
    chunkSizeWarningLimit: 1200,
  },
  // The animation packs are fetched at runtime by URL rather than imported, so Rollup never sees
  // them and they have to be copied. Not publicDir: that copies a directory's CONTENTS to the
  // output root, which puts the packs one level above where the page looks for them.
  publicDir: false,
  plugins: [{
    // Action Studio, bundled. The standalone classic build is untouched and still opens over
    // file://; this is the same page delivered the way the lab page is, so that the published site
    // reaches one origin instead of three.
    name: 'bundle-action-studio-page',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        // Every built page drops its import map. A map exists so the RAW page can resolve `three`
        // out of node_modules; the built page has that import resolved into a chunk already, and
        // node_modules is not published - a map left behind would point the site at nothing.
        // The comment above the map goes with it: it explains a thing the built page does not have.
        html = html.replace(/[ \t]*<!--[\s\S]*?-->\n(?=[ \t]*<script type="importmap">)/, '')
          .replace(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\n/, '');
        if (!context.filename.endsWith('index.template.html')) return html;
        // The two CDN tags are the whole point of the change: r128 from cdnjs and its classic
        // examples/js GLTFLoader from jsdelivr, two origins before the renderer can be built.
        // three-namespace.js composes the same shape from the pinned package - and sets
        // globalThis.THREE, which action-studio.js reads at module scope.
        const withoutCdn = html
          .replace(/[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com[^\n]*\n/, '')
          .replace(/[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net[^\n]*\n/, '  <script type="module" src="./three-namespace.js"></script>\n');
        if (withoutCdn === html) throw new Error('index.template.html no longer carries the two CDN renderer tags this plugin replaces');
        // The runtime globals the generated page sets, kept so that anything reading them sees a
        // named entry rather than 'unknown'. The dataset attributes are what the boot gate reads.
        return withoutCdn.replace(
          "  <script type=\"module\">\n",
          [
            '  <script type="module">',
            "    window.__ACTION_STUDIO_RUNTIME_STAGE = 'G2.5.2';",
            "    window.__ACTION_STUDIO_ENTRY_MODE = 'vite';",
            "    document.documentElement.dataset.actionStudioEntry = 'vite';",
            '',
          ].join('\n'),
        );
      },
    },
    // Rollup names an HTML output after its input, and this input is a template. Renamed on disk
    // in closeBundle rather than in generateBundle, because the HTML asset is emitted after that
    // hook runs - generateBundle sees no .html keys at all.
    async closeBundle() {
      const built = fileURLToPath(new URL('./dist/tools/action-studio/index.template.html', import.meta.url));
      const wanted = fileURLToPath(new URL('./dist/tools/action-studio/index.html', import.meta.url));
      await rename(built, wanted);
    },
  }, {
    name: 'copy-animation-packs',
    async closeBundle() {
      // The page asks for '../../assets/…' from dist/tools/action-studio/, so they go to
      // dist/assets/ - the same relative shape the repository has, which is what lets the page
      // keep the URLs it was authored with.
      await cp(
        fileURLToPath(new URL('./assets', import.meta.url)),
        fileURLToPath(new URL('./dist/assets', import.meta.url)),
        { recursive: true },
      );
    },
  }],
});
