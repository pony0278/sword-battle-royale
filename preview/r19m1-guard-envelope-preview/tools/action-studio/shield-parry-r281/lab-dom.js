// R18M.3 — DOM lookup only. No gameplay/runtime authority lives here.

const REQUIRED_IDS = Object.freeze([
  'hudAttack',
  'hudInput',
  'parryCue',
  'parryCueMain',
  'parryCueDetail',
  'hudContact',
  'hudCoupling',
  'hudShield',
  'hudWeapon',
  'hudSeparation',
  'hudLineClearance',
  'hudRecoil',
  'hudDiagnostic',
  'hudParryTally',
  'hudOpponent',
  'status',
  'report',
  'autoRepeat',
  'opponentDrive',
  'copyTally',
  'slowReview',
  'showSurface',
  'forceOldB3',
  'parryNow',
  'retryAttack',
  'stanceDebugPanel',
  'debugProfileSummary',
  'debugApplyRetry',
  'debugResetDefaults',
]);

export function createShieldParryLabDom(documentRef) {
  const elements = {};
  for (const id of REQUIRED_IDS) {
    const element = documentRef.getElementById(id);
    if (!element) throw new Error(`R18M.3 missing required lab element #${id}`);
    const key = id === 'report' ? 'reportNode' : id;
    elements[key] = element;
  }
  return Object.freeze(elements);
}

export { REQUIRED_IDS as SHIELD_PARRY_LAB_REQUIRED_DOM_IDS };
