# Action Studio joins the bundle

The cold-start work stopped at one page. `shield-driven-contact-coupling-lab.html` - the page the
community plays - was bundled, gated and published from `dist/`. `tools/action-studio/index.html`
was not, and kept opening the way the lab used to: a renderer from cdnjs, its loader from jsdelivr,
a render-blocking stylesheet from fonts.googleapis.com and the faces themselves from
fonts.gstatic.com. Five origins.

That was also why `tools/action-studio/verify-guard-runtime-surface.sh` could not run outside CI.
The gate is not fragile; the page it drives needs three networks before it can construct anything.
Measured in this sandbox, on the committed bundle and on a freshly built one alike:
`Action Studio requires Three.js r128`, after `ERR_TUNNEL_CONNECTION_FAILED`, with no asset request
made at all. A gate nobody can run locally is a gate that only speaks after a push.

## What the page is built from

The Vite input is `index.template.html`, **not** the generated `index.html`. The generated page
picks its entry at runtime by creating script elements - file:// gets the classic bundle, `?g252=1`
gets the ES modules, everything else gets the bundle over HTTP - so there is nothing static for
Rollup to follow. The template already carries the module bootstrap that the `?g252=1` path uses,
and that is exactly the entry a bundle wants.

Two pages, one template, so there is nothing to keep in sync. A plugin swaps the two CDN renderer
tags for `./three-namespace.js` - the same module the lab uses, which composes the pinned r128 into
the `THREE` shape every consumer expects and sets `globalThis.THREE`, which `action-studio.js` reads
at module scope. The plugin throws if those two tags are not where it expects them, rather than
silently emitting a page that still reaches cdnjs.

Rollup names an HTML output after its input, so the emitted `index.template.html` is renamed to
`index.html` in `closeBundle` - not in `generateBundle`, which sees no `.html` keys at all under
rolldown-vite.

**The standalone classic build is untouched.** It still opens over `file://`, still gets its
renderer from the CDN, and its test still pins that. That asymmetry is deliberate and now says so
in a test: a bare module specifier cannot resolve from a double-clicked file, so the page that
exists to be double-clicked needs a network.

## The typefaces are in the repository now

Both pages stop reaching Google. `tools/action-studio/fonts.css` carries Google's own twelve
`@font-face` blocks - `unicode-range` and `font-display: swap` included - with only the url
rewritten, and the faces sit in `tools/action-studio/fonts/`.

Two measurements shaped it:

- **Only latin and latin-ext.** The interface is bilingual, and neither Inter nor JetBrains Mono has
  ever covered its Chinese text - that has always fallen through to a system font. The cyrillic,
  greek and vietnamese subsets Google's stylesheet also declares were bytes this page could not use.
- **Four files behind twelve blocks.** Both families ship as variable fonts, so every weight Google
  declares for a subset points at the same woff2. Naming the files per weight committed four
  byte-identical copies of Inter and two of JetBrains Mono: 619 KB where 176 KB was the whole set.
  Caught by md5, not by reading.

This improves the standalone page too, which now opens with no font network at all.

## The gate that runs anywhere

`npm run verify:built-studio` (`build/verify-built-studio.mjs`) serves `dist/`, opens the built page
in the same Chromium the combat gates use, and asks two questions in one pass:

```
page            /tools/action-studio/index.html
entry           vite
canvas          present
THREE           WebGLRenderer:function GLTFLoader:function
requests        11 total · 0 cross-origin
console errors  0 (+1 favicon 404, ignored)
guard sample    parry@820ms · state:guard_parry mode:parry clip:SKYRIM_GUARD/power_parry_g363 source:820ms
```

The second line of that is the record the in-page gate has always checked, driven from outside the
page instead of from a script the builder injects into it. It waits for the sampler to be published
rather than for `ready`, because `sampleAt` awaits `ensureLoaded` itself - an idle runtime is not a
failure, a missing one is.

`verify-guard-runtime-surface.sh` is kept, not replaced. It drives the standalone classic bundle,
which is a different delivery of the same source, and both are real. CI runs both; the pages
workflow runs both, since the Action Studio it publishes is now the built page.

## Measured

| | before | after |
|---|---|---|
| Action Studio origins | 5 (self, cdnjs, jsdelivr, fonts.googleapis, fonts.gstatic) | 1 |
| Action Studio requests | not measurable here - the page cannot boot without the CDN | 11, 0 cross-origin |
| Guard Runtime gate, locally | impossible | passes |

The lab page shares chunks with the studio now, which moved its numbers slightly:

| lab page | before | after |
|---|---:|---:|
| JS requests | 2 | 4 |
| JS bytes, gzip | 347 KB | 335 KB |

Two more round trips for 12 KB less, because the code the two pages share is downloaded once rather
than compiled into each. Worth stating rather than burying: the community page is the one that
matters here, and this made it two requests slower and slightly smaller. If the round trips ever
matter more than the bytes, the dial is `manualChunks` in `vite.config.js`.

The combat gates reproduced every committed number through all of this - eleventh consecutive
reproduction, `left@1.6` still using 14.0% of its tolerance.

## Still open

- The other thirty-odd lab pages under `tools/action-studio/` still load their modules raw and still
  fetch Three.js from cdnjs. They are workbench pages rather than published ones, and none of them
  has a gate to make runnable, so nothing here argues for bundling them yet.
- `verify-guard-runtime-surface.sh` still cannot run without network. It could be pointed at a
  vendored classic three build, which would make the standalone page work offline too, at the cost
  of committing a second copy of a renderer that is already an npm dependency. Not done, because
  nothing needs it: the same assertion now runs against the built page.
