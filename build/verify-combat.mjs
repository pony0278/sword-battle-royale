// The two browser gates, as one command.
//
// The golden grid replays eleven measured exchanges and diffs every outcome, posture, relevance
// verdict and separation against the committed record; the parry gate plays one parry per direction
// and reads the verdicts the in-page probe stamps. Between them they are the only thing that proves
// a change did not move the measured combat, and until now they lived in a habit rather than in CI -
// no workflow ran either, and neither could have, because the page they drive was gitignored.
//
// So: generate that page, serve the repository, run both, and fail loudly.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startStaticServer } from '../tools/static-server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Where a chromium-shaped browser lives, in the order worth trying. CHROME_PATH first so a runner
// or a sandbox can simply say; the rest covers the GitHub runner image and a local playwright.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

function findBrowser() {
  const found = CANDIDATES.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(`no chromium-shaped browser found. Tried:\n  ${CANDIDATES.join('\n  ')}\nSet CHROME_PATH.`);
}

function run(label, script, args, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on('close', (code) => resolvePromise({ label, code, output }));
  });
}

await run('probe page', 'build/build-probe-lab.mjs', [], {});

const served = await startStaticServer({ root: ROOT, port: Number(process.env.VERIFY_PORT || 0) });
const browser = findBrowser();
const base = `${served.url}/tools/action-studio`;
console.log(`verify:combat · browser ${browser} · serving ${served.url}`);

const results = [];
try {
  // The generated page, always: the published one pulls Three.js from a CDN, and a verification run
  // that can fail because a CDN was slow is not a verification.
  const env = { PARRY_GATE_PAGE: 'probe.lab.html' };
  results.push(await run('golden grid', 'tools/action-studio/b1-golden/verify-golden-grid.mjs', [browser, base], env));
  results.push(await run('parry gate', 'tools/action-studio/verify-shield-parry-gate.mjs', [browser, base], env));
} finally {
  await served.close();
}

const failed = results.filter((result) => result.code !== 0);
console.log('');
for (const result of results) console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} · ${result.label}`);
if (failed.length) process.exit(1);
