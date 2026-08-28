import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tools/action-studio/shield-parry-r281/pre-contact-controller.js';
const source = readFileSync(path, 'utf8');
const needle = `      probeReason: probe.reason,\n      geometricContact: probe.geometricContact === true,`;
const replacement = `      probeReason: probe.reason,\n      probeDeltaSeconds: Number.isFinite(Number(probe.diagnostics?.deltaSeconds))\n        ? Number(probe.diagnostics.deltaSeconds)\n        : null,\n      geometricContact: probe.geometricContact === true,`;

if (!source.includes(needle)) {
  throw new Error('R18N.3 v6.3 could not locate whiff probe telemetry insertion point');
}
if (source.includes('probeDeltaSeconds:')) {
  throw new Error('R18N.3 v6.3 telemetry already present; migration expects clean base');
}

writeFileSync(path, source.replace(needle, replacement));
console.log('R18N.3 v6.3 active-window boundary telemetry applied.');
