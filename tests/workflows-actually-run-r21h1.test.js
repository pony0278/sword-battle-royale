import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// R21H.1 - a gate that cannot fire is not a gate.
//
// Eighteen workflows were configured and sixteen of them had never executed once. Fifteen fired
// only on `pull_request`, and this repository reaches main by fast-forward rather than by pull
// request; the other seven also carried a `push` trigger, aimed at a branch nobody had pushed to
// in months. Meanwhile CI itself ran on push to main ONLY - so the suite, the staleness check and
// the measured-combat gates all reported after a fast-forward had already put the change on main,
// which is the one moment their verdict cannot be acted on.
//
// None of this was visible: a repository full of green-looking workflow files reads as coverage.
// These assertions are the cheapest way to keep it visible.

const DIR = new URL('../.github/workflows/', import.meta.url);
const WORKFLOWS = readdirSync(DIR).filter((name) => name.endsWith('.yml'));
const read = (name) => readFileSync(new URL(name, DIR), 'utf8');

// The seven that only re-run a subset of what `npm test` already runs. They are documented rather
// than fixed: making a duplicate fire more often buys nothing, and deleting CI config is the
// repository owner's call, not a test's.
const KNOWN_DUPLICATES_OF_NPM_TEST = Object.freeze([
  'anatomical-3d-joint-response.yml',
  'articulated-arm-impulse-chain.yml',
  'bidirectional-shield-blade-contact.yml',
  'contact-release-separation-recoil.yml',
  'physical-grip-wrist-compliance.yml',
  'physical-shield-sword-impulse.yml',
  'swept-blade-shield-physical-contact.yml',
]);

test('R21H.1 every workflow can be triggered by a push', () => {
  for (const name of WORKFLOWS) {
    assert.match(read(name), /^ {2}push:$/m, `${name} can only fire on events this repo never produces`);
  }
});

test('R21H.1 CI runs on every branch, not only after a fast-forward has landed', () => {
  const ci = read('ci.yml');
  const push = ci.slice(ci.indexOf('  push:'));
  assert.match(push.slice(0, 200), /branches: \['\*\*'\]/, 'a branch must be verified before it reaches main');
});

test('R21H.1 no workflow is pinned to a branch nobody works on', () => {
  // The seven duplicates were aimed at 'g43b5r28-legacy-two-actor-recoil-passthrough', which is
  // still on the remote and has not been pushed to in months. A push trigger naming one specific
  // stale branch is indistinguishable from no push trigger at all.
  for (const name of WORKFLOWS) {
    const source = read(name);
    const pushBlock = source.slice(source.indexOf('  push:'), source.indexOf('  push:') + 400);
    assert.ok(
      !pushBlock.includes('g43b5r28-legacy-two-actor-recoil-passthrough'),
      `${name} still fires only on a dead branch`,
    );
  }
});

test('R21H.1 the browser gates keep a paths filter, so firing on every branch stays cheap', () => {
  for (const name of WORKFLOWS) {
    if (name === 'ci.yml' || name === 'pages.yml') continue; // both are meant to run on everything
    const source = read(name);
    const pushAt = source.indexOf('  push:');
    const after = source.slice(pushAt, source.indexOf('\npermissions:', pushAt));
    assert.match(after, /paths:/, `${name} would run on every push to every branch`);
  }
});

test('R21H.1 the workflows that only duplicate npm test are named, not silently tolerated', () => {
  const script = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.test;
  assert.match(script, /tests\/\*\*\/\*\.test\.js/, 'npm test runs every test file');
  for (const name of KNOWN_DUPLICATES_OF_NPM_TEST) {
    const source = read(name);
    assert.ok(WORKFLOWS.includes(name), `${name} is listed as a duplicate but no longer exists`);
    // If one of these ever grows a browser step it stops being a duplicate and this list is wrong.
    assert.ok(!source.includes('--dump-dom'), `${name} now does more than npm test - re-classify it`);
  }
});
