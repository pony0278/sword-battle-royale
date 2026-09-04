import fs from 'node:fs';

const path = 'tools/action-studio/shield-parry-r281/pre-contact-controller.js';
let source = fs.readFileSync(path, 'utf8');
const before = `        ? fineTrackingRuntime.refineWorldTarget(activeInterceptIntent?.report?.targetCenter, {
            jointBudgetScale: 0.35,
            iterations: 2,
          })`;
const after = `        ? fineTrackingRuntime.refineWorldTarget(activeInterceptIntent?.report?.targetCenter, {
            jointBudgetScale: 0.60,
            iterations: 3,
          })`;
const first = source.indexOf(before);
if (first < 0) throw new Error('R18N.3 60% closure tuning marker missing');
if (source.indexOf(before, first + before.length) >= 0) throw new Error('R18N.3 60% closure tuning marker not unique');
source = source.slice(0, first) + after + source.slice(first + before.length);
fs.writeFileSync(path, source);
console.log('R18N.3 closure sub-budget tuned to 60% / 3 iterations.');
