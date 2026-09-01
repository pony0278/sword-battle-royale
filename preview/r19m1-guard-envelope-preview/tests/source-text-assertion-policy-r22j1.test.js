import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { codeOnly } from './support/source-text.js';

// R22J.1 - when asserting on source text is right, and when it is a suite lying to itself.
//
// The complaint was "91 test files assert on source text". Counted properly it is 1174 assertions
// across 103 of 206 files, and the useful finding is that they are not one thing:
//
//   639  read a tools/*.js file as text          the lab entry, mostly: composition
//   359  read a src/*.js file as text            module internals and authority boundaries
//   157  read generated or authored HTML
//   144  of the above forbid a pattern rather than requiring one
//     6  compare indexOf positions                ordering
//
// KEEP, because the text IS the subject: a workflow file, package.json, the generated probe page,
// the entry's line budget. "ci.yml runs verify:combat" has no behaviour to observe - dropping the
// gate is silent by nature, and only reading the file can catch it.
//
// KEEP, because absence cannot be shown by calling: the authority boundaries. "free-movement holds
// no defence authority", "the camera module never imports Three.js", "attack-tempo decides timing
// and never contact". You cannot prove a module does not consult something by calling it.
//
// CONVERT, and this is the pile that matters: an assertion about BEHAVIOUR written as an assertion
// about TEXT. Two went red in this cycle for changes that moved no behaviour at all - a call gained
// a second argument, a parse moved to another module - while the claims they cared about were
// untouched. Worse than the noise is what they hide: three "the sprint is invisible" bugs in this
// same cycle were caught by a browser probe and by none of these.
//
// And a defect they ALL shared until now: forbidding a string cannot tell a use from an
// explanation. R22I.1's own new test went red because the module's header named the alternative it
// had rejected. codeOnly() is the fix, and it applies to every absence assertion at once.
//
// This file is the rule plus a ratchet. It does not demand the 1174 be rewritten; it stops them
// growing, and it makes the absence ones honest.

const dir = new URL('./', import.meta.url);
const files = (await readdir(dir)).filter((name) => name.endsWith('.test.js'));
const sources = new Map(await Promise.all(
  files.map(async (name) => [name, await readFile(new URL(name, dir), 'utf8')]),
));

const READ_TEXT = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?read(?:File|FileSync)\s*\(\s*new URL\(\s*'([^']+)'/g;

function census() {
  const counts = { toolsText: 0, srcText: 0, html: 0, config: 0, other: 0, absence: 0, total: 0 };
  for (const [, source] of sources) {
    const vars = new Map();
    READ_TEXT.lastIndex = 0;
    let match;
    while ((match = READ_TEXT.exec(source))) vars.set(match[1], match[2]);
    if (vars.size === 0) continue;
    for (const line of source.split('\n')) {
      if (!/assert\.(match|doesNotMatch|ok|equal|deepEqual|notEqual)\(/.test(line)) continue;
      const used = [...vars.keys()].find((name) => new RegExp(`\\b${name}\\b`).test(line));
      if (!used) continue;
      const target = vars.get(used);
      counts.total += 1;
      if (/assert\.doesNotMatch\(/.test(line)) counts.absence += 1;
      if (/\.ya?ml|package\.json/.test(target)) counts.config += 1;
      else if (/\.html$/.test(target)) counts.html += 1;
      else if (/\/src\//.test(target)) counts.srcText += 1;
      else if (/\/tools\//.test(target)) counts.toolsText += 1;
      else counts.other += 1;
    }
  }
  return counts;
}

// The measured baseline, R22J.1. A ratchet, not a target: these may fall freely and may not rise.
// Raising one means a behavioural claim was written as a textual one, and the reason should be in
// the commit rather than in this number.
// Measured by the census() above, not by a script written alongside it - the first draft of this
// baseline came from a separate classifier and was wrong by three, which is exactly the trap a
// ratchet is supposed to avoid.
// R23B.1 raised srcText and total by one. The scene grew a second buckler and the assertion that
// broke ("the defender is equipped") was replaced by two that matter more once there are two
// fighters: the calibration is the accepted one, and BOTH shields come from one recipe, because two
// that drift apart is a fairness bug no eye would catch. There is no behavioural version - the
// scene needs a WebGL canvas. A raise with its reason attached is what this ratchet is for; a raise
// without one is the thing it exists to stop.
const BASELINE = Object.freeze({ total: 1164, srcText: 360, toolsText: 639, html: 157, absence: 144 });

test('R22J.1 the source-text pile does not grow', () => {
  const now = census();
  for (const key of Object.keys(BASELINE)) {
    assert.ok(now[key] <= BASELINE[key],
      `${key} rose from ${BASELINE[key]} to ${now[key]} - a behavioural claim written as a textual one?`);
  }
  // Sanity: the census still finds the pile at all. A refactor that broke the detector would
  // otherwise read as the debt having been paid.
  assert.ok(now.total > 900, `census found only ${now.total}; the detector is probably broken`);
});

test('R22J.1 codeOnly strips prose so an absence assertion tests code, not documentation', () => {
  const sample = [
    '// a comment naming forbiddenThing',
    '/* and a block naming forbiddenThing */',
    "const message = 'forbiddenThing in a string';",
    'forbiddenThing();',
  ].join('\n');
  const code = codeOnly(sample);
  assert.equal((code.match(/forbiddenThing/g) || []).length, 1, 'only the call survives');
  assert.match(code, /forbiddenThing\(\)/);
  // Line numbers are preserved so a failure still points somewhere.
  assert.equal(code.split('\n').length, sample.split('\n').length);
  // Escapes cannot end a string early and leak its tail into the code.
  assert.equal((codeOnly(`const a = 'it\\'s forbiddenThing'; b();`).match(/forbiddenThing/g) || []).length, 0);
});

test('R22J.1 the boundaries worth keeping are still real, and now read code only', () => {
  // Spot-checked against the modules themselves rather than restated: these are the assertions the
  // rule says to KEEP, so they had better still hold when prose is removed.
  const check = async (path, forbidden) => {
    const code = codeOnly(await readFile(new URL(`../${path}`, dir), 'utf8'));
    assert.doesNotMatch(code, forbidden, `${path} must not reach for ${forbidden}`);
  };
  return Promise.all([
    check('src/game/free-movement-controller.js', /guardMachine|parryGate|GUARD_/),
    check('src/combat/attack-tempo.js', /resolveContact|parryGate|aimedSector/),
    check('src/combat/sprint-locomotion.js', /resolveContact|parryGate/),
  ]);
});
