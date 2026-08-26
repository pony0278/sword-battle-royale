export const SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_STAGE = 'R18N.3-v6.4';
export const SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY = 'swept-contact-subframe-authored-active-window';

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value, 0)));
}

export function hasSweptContactTemporalEligibility(contact = {}) {
  return contact?.temporalEligibility?.authority === SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY;
}

export function evaluateSweptContactTemporalEligibility(input = {}) {
  const contactReport = input.contactReport || null;
  if (!contactReport || contactReport.geometricContact !== true) return contactReport;

  const attackSnapshot = input.attackSnapshot || null;
  const runtime = attackSnapshot?.action?.runtime || null;
  const activeStartSeconds = finite(runtime?.activeStartSeconds);
  const activeEndSeconds = finite(runtime?.activeEndSeconds);
  const frameEndElapsedSeconds = finite(attackSnapshot?.elapsedSeconds);
  const previousElapsedMs = finite(attackSnapshot?.previousElapsedMs);
  const fallbackDeltaSeconds = Math.max(0, finite(input.deltaSeconds, 0));
  const fallbackEligible = input.fallbackEligible === true;
  const sweepAlpha = clamp01(contactReport.sweepAlpha);

  const previousElapsedSeconds = frameEndElapsedSeconds == null
    ? null
    : previousElapsedMs != null
      ? Math.max(0, previousElapsedMs / 1000)
      : Math.max(0, frameEndElapsedSeconds - fallbackDeltaSeconds);
  const sweepDurationSeconds = previousElapsedSeconds != null && frameEndElapsedSeconds != null
    ? Math.max(0, frameEndElapsedSeconds - previousElapsedSeconds)
    : null;
  const contactElapsedSeconds = previousElapsedSeconds != null && sweepDurationSeconds != null
    ? previousElapsedSeconds + sweepDurationSeconds * sweepAlpha
    : null;
  const timelineAvailable = activeStartSeconds != null
    && activeEndSeconds != null
    && contactElapsedSeconds != null;
  const eligible = timelineAvailable
    ? contactElapsedSeconds + 1e-7 >= activeStartSeconds
      && contactElapsedSeconds <= activeEndSeconds + 1e-7
    : fallbackEligible;

  return Object.freeze({
    ...contactReport,
    contact: eligible,
    eligible,
    reason: eligible ? 'active-swept-contact' : 'contact-outside-active-window',
    temporalEligibility: Object.freeze({
      stage: SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_STAGE,
      authority: SWEPT_CONTACT_TEMPORAL_ELIGIBILITY_AUTHORITY,
      eligible,
      timelineAvailable,
      sweepAlpha,
      previousElapsedSeconds,
      frameEndElapsedSeconds,
      sweepDurationSeconds,
      contactElapsedSeconds,
      activeStartSeconds,
      activeEndSeconds,
      frameEndPhase: attackSnapshot?.phase || null,
      frameEndPhaseActive: attackSnapshot?.phase === 'attack_active',
      fallbackEligible: timelineAvailable ? null : fallbackEligible,
    }),
  });
}
