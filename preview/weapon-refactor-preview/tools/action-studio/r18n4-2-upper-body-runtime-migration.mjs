import { readFile, writeFile } from 'node:fs/promises';

function replaceOne(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return source.replace(before, after);
}

const predictiveUrl = new URL('../../src/combat/predictive-intercept-parry.js', import.meta.url);
const tapsUrl = new URL('./shield-parry-r281/visual-ownership-runtime-taps.js', import.meta.url);

let predictive = await readFile(predictiveUrl, 'utf8');
predictive = replaceOne(
  predictive,
  "import { getProductionParryDeflectProfile } from '../animation/parry-contact-deflect-runtime-clip.js';",
  "import { getProductionParryDeflectProfile } from '../animation/parry-contact-deflect-runtime-clip.js';\nimport {\n  R18N_ACTIVE_INTERCEPT_PRESERVED_BONES,\n} from './predictive-parry-ownership-policy.js';",
  'policy import',
);
predictive = replaceOne(
  predictive,
  "const PREDICTIVE_PARRY_EXTERNAL_SHIELD_ARM_BONES = Object.freeze(['root', 'hips', 'spine', 'chest', 'upperarm.l', 'lowerarm.l', 'wrist.l', 'hand.l', 'handslot.l']);\n",
  '',
  'legacy full support-chain preserve set',
);
predictive = replaceOne(
  predictive,
  '      ? captureBoneQuaternionPose(character, PREDICTIVE_PARRY_EXTERNAL_SHIELD_ARM_BONES)',
  '      ? captureBoneQuaternionPose(character, R18N_ACTIVE_INTERCEPT_PRESERVED_BONES)',
  'active intercept preserve capture',
);
predictive = replaceOne(
  predictive,
  "      shieldArmOwnership: 'predictive-presentation',\n      triggerTtcSeconds,",
  "      shieldArmOwnership: 'predictive-presentation',\n      upperBodyAnticipationOwnership: 'predictive-presentation',\n      triggerTtcSeconds,",
  'start report ownership metadata',
);
predictive = replaceOne(
  predictive,
  "      shieldArmOwnership: preserveShieldArm ? 'external-active-intercept-tracking' : 'predictive-presentation',\n      readyForAuthoritativeHandoff:",
  "      shieldArmOwnership: preserveShieldArm ? 'external-active-intercept-tracking' : 'predictive-presentation',\n      upperBodyAnticipationOwnership: preserveShieldArm\n        ? 'predictive-presentation-spine-chest'\n        : 'predictive-presentation',\n      readyForAuthoritativeHandoff:",
  'update report ownership metadata',
);
await writeFile(predictiveUrl, predictive);

let taps = await readFile(tapsUrl, 'utf8');
taps = replaceOne(
  taps,
  "      shieldArmOwnership: report?.shieldArmOwnership ?? null,\n      sourceTimeSeconds:",
  "      shieldArmOwnership: report?.shieldArmOwnership ?? null,\n      upperBodyAnticipationOwnership: report?.upperBodyAnticipationOwnership ?? null,\n      sourceTimeSeconds:",
  'visual ownership predictive metadata',
);
await writeFile(tapsUrl, taps);

console.log('R18N.4.2 upper-body runtime migration complete');
