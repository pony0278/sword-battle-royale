import * as ThreeModule from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Where the renderer comes from, which is an entry's job and not the game's.
//
// It used to be two CDN script tags and `const THREE = window.THREE`. Vite bundles it instead, and
// the composition below is what keeps every consumer working across that change.
//
// three@0.128.0 is PINNED, not upgraded. It already ships three.module.js and this ESM GLTFLoader,
// so bundling needed no version change - and a version change is the one thing that would move the
// measured combat, because r147 removed examples/js and renamed outputEncoding, and this
// repository's calibration lives in floats that such a change moves silently. The pin is asserted
// in tests/verify-combat-wiring-r20z1.test.js.
//
// WHY THE NAMESPACE IS COMPOSED rather than re-exported: GLTFLoader is a PROPERTY of THREE in the
// classic examples/js build, and that is the shape every consumer expects - bootstrap.js constructs
// `new THREE.GLTFLoader()` five times through the namespace it is handed. Re-exporting the module
// would have left that undefined at the fifth call rather than at the first.
export const THREE = { ...ThreeModule, GLTFLoader };

// src/game/contact-handoff-controller.js reads globalThis.THREE in six places rather than taking it
// as a parameter like every other module. Set here so that stays true under a bundle. Making those
// six sites take an injected namespace is its own change, and a measured one - the contact stack is
// what the golden grid watches most closely.
globalThis.THREE = THREE;

// This module is deliberately not under src/. Everything in src/ is handed a THREE rather than
// importing one, which is what lets the whole game run headless in the tests; sourcing a renderer
// is what an ENTRY does, and it lives beside the entry that does it.
