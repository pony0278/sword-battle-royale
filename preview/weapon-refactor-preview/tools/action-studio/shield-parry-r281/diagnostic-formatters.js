// R18M.2 — presentation-only diagnostic formatters extracted from R281.
// No function in this module may decide combat success or mutate a runtime.

function magnitude(v) {
  return v ? Math.hypot(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0) : 0;
}

const INSPECTION_GATE_ORDER = Object.freeze([
  'shieldOfflineTravel',
  'handTravel',
  'gripTravel',
  'swordAxisClearance',
  'hiltOfflineTravel',
  'wristGripClearance',
  'directionAgreement',
]);
const INSPECTION_GATE_LABELS = Object.freeze({
  shieldOfflineTravel: '盾面離線',
  handTravel: '手部位移',
  gripTravel: '劍柄總位移',
  swordAxisClearance: '劍軸偏轉',
  hiltOfflineTravel: '劍柄離線',
  wristGripClearance: '手腕→劍柄線',
  directionAgreement: '撥動方向一致度',
});

function formatInspectionGate(gate) {
  if (!gate) return '—';
  const label = INSPECTION_GATE_LABELS[gate.key] || gate.label || gate.key;
  const operator = gate.operator === '>' ? '>' : '≥';
  if (gate.unit === 'meters') {
    const actual = gate.actual == null ? '—' : (gate.actual * 100).toFixed(1);
    return `${label} ${actual}cm ${operator} ${(gate.minimum * 100).toFixed(1)}cm`;
  }
  if (gate.unit === 'degrees') {
    const actual = gate.actual == null ? '—' : gate.actual.toFixed(1);
    return `${label} ${actual}° ${operator} ${gate.minimum.toFixed(1)}°`;
  }
  const actual = gate.actual == null ? '—' : gate.actual.toFixed(2);
  return `${label} ${actual} ${operator} ${gate.minimum.toFixed(2)}`;
}

export function formatTerminalState(reason) {
  if (reason === 'shield-surface-separated-after-live-deflection-peak') return '正常分離（撥動峰值後）';
  if (reason === 'shield-surface-settled-after-live-deflection-peak') return '正常穩定（撥動峰值後）';
  if (reason === 'live-contact-safety-limit-after-sufficient-deflection') return '已達充分撥動（安全時間上限停格）';
  if (reason === 'insufficient-live-shield-offline-travel') return '盾面離線量不足';
  return reason || '尚未停格';
}

export function formatInspectionFailureSummary(report) {
  const assessment = report?.inspectionAssessment;
  if (!assessment) return '驗收量測尚未建立';
  const failed = assessment.failedGateKeys
    .map((key) => assessment.gates[key])
    .filter(Boolean)
    .map(formatInspectionGate);
  const failureText = failed.length ? failed.join(' · ') : '沒有失敗門檻';
  return `FAIL ${assessment.failedGateCount}/${INSPECTION_GATE_ORDER.length} · ${failureText} · 接觸終止：${formatTerminalState(assessment.terminalReason)}`;
}

export function formatAllInspectionGates(report) {
  const assessment = report?.inspectionAssessment;
  if (!assessment) return 'STEP 3A diagnostic: waiting for inspection measurements';
  const values = INSPECTION_GATE_ORDER.map((key) => {
    const gate = assessment.gates[key];
    return `${gate?.pass ? 'PASS' : 'FAIL'} ${formatInspectionGate(gate)}`;
  });
  return `INSPECTION ${assessment.pass ? 'PASS' : 'FAIL'} · ${values.join(' · ')}`;
}

export function describeContactGeometry(contact) {
  if (!contact?.geometricContact) return null;
  const bladeFraction = Math.max(0, Math.min(1, Number(contact.bladeFraction) || 0));
  const radialDistanceMeters = Math.max(0, Number(contact.radialDistance) || 0);
  const shieldRadiusMeters = Math.max(0, Number(contact.surface?.radius) || 0);
  const shieldRadiusRatio = shieldRadiusMeters > 0 ? radialDistanceMeters / shieldRadiusMeters : null;
  const bladeRegion = bladeFraction < 0.25 ? 'BASE' : bladeFraction > 0.75 ? 'TIP' : 'MID';
  const shieldRegion = shieldRadiusRatio == null
    ? 'UNKNOWN'
    : shieldRadiusRatio < 0.55
      ? 'FACE CENTER'
      : shieldRadiusRatio < 0.85
        ? 'FACE OUTER'
        : 'RIM / EDGE';
  return Object.freeze({
    bladeFraction,
    bladePercent: bladeFraction * 100,
    bladeRegion,
    radialDistanceMeters,
    shieldRadiusMeters,
    shieldRadiusRatio,
    shieldRegion,
    text: `blade ${(bladeFraction * 100).toFixed(0)}% ${bladeRegion} · shield ${(radialDistanceMeters * 100).toFixed(1)}/${(shieldRadiusMeters * 100).toFixed(1)}cm ${shieldRegion}`,
    authority: 'real-swept-contact-location-diagnostic',
  });
}

const PARRY_WHIFF_CATEGORY_LABELS = Object.freeze({
  CONTACT_OUTSIDE_ACTIVE_WINDOW: 'CONTACT OUTSIDE ACTIVE WINDOW',
  OUTSIDE_SHIELD_EDGE: 'OUTSIDE SHIELD EDGE',
  MISSED_SHIELD_PLANE: 'MISSED SHIELD PLANE',
  MISSED_PLANE_AND_DISC: 'PLANE + EDGE MISS',
  NO_EXACT_SWEPT_CONTACT: 'NO EXACT CONTACT',
  NO_PROBE_DATA: 'NO PROBE DATA',
});

export function formatWhiffDiagnostic(whiff, { debugMode = false } = {}) {
  if (!whiff) return null;
  const sample = whiff.outsideActiveContact || whiff.closestApproachRecord;
  const baseLabel = PARRY_WHIFF_CATEGORY_LABELS[whiff.category] || whiff.category || 'UNKNOWN WHIFF';
  const sampledThreat = sample?.interceptDriveReport?.residualStanceReach?.threat;
  const label = sampledThreat?.kneeLineThreat
    ? baseLabel + ' · KNEE-LINE THREAT'
    : sampledThreat?.lowGuardGapThreat ? baseLabel + ' · LOW GUARD GAP' : baseLabel;
  if (!sample) return Object.freeze({ label, detail: `reason ${whiff.reason} · no sweep sample recorded` });
  const phase = String(sample.attackPhase || 'unknown').toUpperCase();
  const ttcMs = sample.timeToContactSeconds == null ? null : sample.timeToContactSeconds * 1000;
  const lead = whiff.category === 'CONTACT_OUTSIDE_ACTIVE_WINDOW'
    ? `geometric touch at ${phase}`
    : `closest ${phase}`;
  const parts = [lead];
  if (ttcMs != null) parts.push(`TTC ${ttcMs >= 0 ? '+' : ''}${ttcMs.toFixed(0)}ms`);
  if (sample.bladeFraction != null) parts.push(`blade ${(sample.bladeFraction * 100).toFixed(0)}%`);
  if (sample.planeGapMeters != null) parts.push(`plane gap ${(sample.planeGapMeters * 100).toFixed(1)}cm`);
  if (sample.radialGapMeters != null) parts.push(`edge gap ${(sample.radialGapMeters * 100).toFixed(1)}cm`);
  if (sample.radialDistanceMeters != null && sample.shieldRadiusMeters != null) {
    parts.push(`shield ${(sample.radialDistanceMeters * 100).toFixed(1)}/${(sample.shieldRadiusMeters * 100).toFixed(1)}cm`);
  }
  const required = whiff.tracking?.requiredDistanceMeters;
  const applied = whiff.tracking?.appliedDistanceMeters;
  if (required != null) {
    parts.push(`tracking ${(required * 100).toFixed(1)}→${((applied ?? whiff.tracking.limitMeters) * 100).toFixed(1)}cm${whiff.tracking.clamped ? ' CLAMP' : ''}`);
  }
  const drive = sample.interceptDriveReport;
  if (drive) {
    const driveSource = drive.selectionSource === 'measured-current-sweep-closest-approach' ? 'MEASURED' : drive.selectionSource === 'linear-predicted-threat' ? 'LINEAR' : 'NONE';
    const edgeCorrection = drive.measuredRadialContactCorrectionMeters == null ? '—' : `${(drive.measuredRadialContactCorrectionMeters * 100).toFixed(1)}cm`;
    const shieldStep = drive.shieldStepTranslationMeters == null ? '—' : `${(drive.shieldStepTranslationMeters * 100).toFixed(1)}cm`;
    const driveFrame = drive.drivePlanSource === 'surface-relative-measured-contact-correction' ? 'RELATIVE' : 'CURRENT';
    const directionDot = drive.correctionDirectionDot == null ? '—' : drive.correctionDirectionDot.toFixed(2);
    const formatGap = (value) => value == null ? '—' : `${(value * 100).toFixed(1)}cm`;
    const edgeBefore = formatGap(drive.residualBeforeRefinement?.radialGapMeters);
    const edgeAfter = formatGap(drive.residualAfterRefinement?.radialGapMeters);
    const planeBefore = formatGap(drive.residualBeforeRefinement?.planeGapMeters);
    const planeAfter = formatGap(drive.residualAfterRefinement?.planeGapMeters);
    const refinementStep = formatGap(drive.residualRefinement?.achievedDistance);
    const carryBefore = formatGap(drive.residualCarryBeforeMeters);
    const carryAfter = formatGap(drive.residualCarryAfterMeters);
    const bodyReach = drive.residualBodyReach;
    const armReach = bodyReach?.armExtensionRatio == null
      ? '—'
      : `${(bodyReach.armExtensionRatio * 100).toFixed(0)}%`;
    const wristDegrees = bodyReach?.wristAppliedDegrees == null
      ? '—'
      : `${bodyReach.wristAppliedDegrees.toFixed(1)}°`;
    const wristPlaneBefore = formatGap(bodyReach?.planeGapBeforeMeters);
    const wristPlaneAfter = formatGap(bodyReach?.planeGapAfterWristMeters);
    const torsoDegrees = bodyReach?.appliedDegrees
      ? `${(bodyReach.appliedDegrees.chest + bodyReach.appliedDegrees.spine).toFixed(1)}°`
      : '—';
    const bodyReachBefore = formatGap(magnitude(bodyReach?.bodyReachOffsetBefore));
    const bodyReachAfter = formatGap(bodyReach?.bodyReachDistance);
    const bodyDirection = bodyReach?.bodyDirectionDot == null
      ? '—'
      : bodyReach.bodyDirectionDot.toFixed(2);
    const armEdgeAfter = formatGap(drive.residualAfterArmRefinement?.radialGapMeters);
    const stance = drive.residualStanceReach;
    const threat = stance?.threat;
    const stanceState = stance?.stanceHeld
      ? 'HOLD'
      : stance?.stanceConfirmed
        ? stance?.earlyLowThreatRecruitment ? 'EARLY ACTIVE' : 'ACTIVE'
        : stance?.armStalled ? 'STALL WAIT' : 'OFF';
    const threatZone = threat?.zone || '—';
    const formatHeight = (value) => value == null ? '—' : (value * 100).toFixed(1) + 'cm';
    const threatHeights = [
      threat?.pointY,
      threat?.shieldBottomY,
      threat?.kneeLeftY,
      threat?.kneeRightY,
    ].map(formatHeight).join('/');
    const lowGap = formatGap(threat?.verticalGapBelowShieldMeters);
    const kneeDistance = formatGap(threat?.kneeLineDistanceMeters);
    const earlyStance = stance?.earlyLowThreatRecruitment ? 'YES' : 'NO';
    const stanceThreatSource = stance?.activationSource === 'predicted-future-sword-point'
      ? 'PREDICTED'
      : stance?.activationSource === 'measured-residual-sword-point' ? 'MEASURED' : 'NONE';
    const stanceLead = stance?.anticipatedLeadSeconds == null
      ? '—'
      : `${Math.round(stance.anticipatedLeadSeconds * 1000)}ms`;
    const stanceHold = stance?.stanceHeld ? 'YES' : 'NO';
    const crouchTarget = formatGap(stance?.engagedTargetCrouchMeters);
    const stanceSelection = stance?.threatSelection;
    const anticipatedPlan = stance?.anticipatedPlan;
    const rawPredictedLead = stanceSelection?.anticipatedLeadSeconds;
    const predictedDecision = String(
      stanceSelection?.anticipatedEligibilityReason || 'no-predicted-selection',
    ).toUpperCase().replaceAll('-', '_');
    const predictedLead = rawPredictedLead == null ? '—' : `${Math.round(rawPredictedLead * 1000)}ms`;
    const predictedZone = anticipatedPlan?.threat?.zone || '—';
    const predictedEdge = formatGap(anticipatedPlan?.metrics?.radialGapMeters);
    const predictedPlane = formatGap(anticipatedPlan?.metrics?.planeGapMeters);
    const predictedArm = anticipatedPlan?.arm?.saturated
      ? 'SATURATED'
      : anticipatedPlan?.arm?.stalled ? 'STALLED' : anticipatedPlan?.arm?.attempted ? 'ATTEMPT' : 'NO_ATTEMPT';
    const predictedThreat = anticipatedPlan?.threat;
    const predictedFlags = predictedThreat
      ? `plane ${predictedThreat.planeNear ? 'Y' : 'N'} / down ${predictedThreat.stronglyDownward ? 'Y' : 'N'} / below ${predictedThreat.belowShield ? 'Y' : 'N'} / feet ${predictedThreat.aboveFeet ? 'Y' : 'N'}`
      : '—';
    const downwardRatio = stance?.downwardRatio == null ? '—' : stance.downwardRatio.toFixed(2);
    const crouchBefore = formatGap(stance?.crouchBeforeMeters);
    const crouchAfter = formatGap(stance?.crouchMeters);
    const hipsDegrees = stance?.hipsAppliedDegrees == null ? '—' : `${stance.hipsAppliedDegrees.toFixed(1)}°`;
    const footL = stance?.footPlant?.l?.driftMeters == null ? '—' : `${(stance.footPlant.l.driftMeters * 1000).toFixed(1)}mm`;
    const footR = stance?.footPlant?.r?.driftMeters == null ? '—' : `${(stance.footPlant.r.driftMeters * 1000).toFixed(1)}mm`;
    const planted = stance?.feetPlanted == null ? '—' : stance.feetPlanted ? 'PASS' : 'FAIL';
    parts.push([
      'zone ' + threatZone,
      'y blade/rim/kneeL/kneeR ' + threatHeights,
      'lowgap ' + lowGap,
      'kdist ' + kneeDistance,
      'early ' + earlyStance,
      'stance src ' + stanceThreatSource,
      'lead ' + stanceLead,
      'hold ' + stanceHold,
      'target ' + crouchTarget,
    ].join(' · '));
    if (debugMode) {
      parts.push(`DEBUG pred ${predictedDecision} · plead ${predictedLead} · pzone ${predictedZone} · pedge ${predictedEdge} · pplane ${predictedPlane} · parm ${predictedArm} · pflags ${predictedFlags}`);
    }
    const refinementDirection = drive.residualRefinement?.directionDot == null
      ? '—'
      : drive.residualRefinement.directionDot.toFixed(2);
    parts.push(`selector ${driveSource} · drive ${driveFrame} · edge correction ${edgeCorrection} · acquire ${drive.measuredInsideAcquisitionBand ? 'PASS' : 'FAIL'} · shield step ${shieldStep} · dir ${directionDot} · residual edge ${edgeBefore}→${edgeAfter} · plane ${planeBefore}→${planeAfter} · carry ${carryBefore}→${carryAfter} · refine ${refinementStep} · rdir ${refinementDirection} · arm ${armReach} · aedge ${edgeBefore}→${armEdgeAfter} · wrist ${wristDegrees} · wplane ${wristPlaneBefore}→${wristPlaneAfter} · torso ${torsoDegrees} · reach ${bodyReachBefore}→${bodyReachAfter} · bdir ${bodyDirection} · stance ${stanceState} · down ${downwardRatio} · crouch ${crouchBefore}→${crouchAfter} · hips ${hipsDegrees} · feet ${footL}/${footR} ${planted}`);
  } else {
    parts.push('selector NO ARMED DRIVE FRAME');
  }
  return Object.freeze({ label, detail: parts.join(' · ') });
}
