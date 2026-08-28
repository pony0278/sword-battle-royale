// R18M.3 — stance debug UI/query controller.
// This controller mutates only debug presentation guidance values and DOM/query state.

export function createStanceDebugController({
  documentRef,
  windowRef,
  debugMode,
  debugQuery,
  profileDefaults,
  elements,
}) {
  const controls = Object.freeze([
    Object.freeze({ id: 'debugLeadMs', query: 'leadMs', profileKey: 'anticipatoryLeadMaxSeconds', scale: 0.001, defaultValue: profileDefaults.anticipatoryLeadMaxSeconds * 1000, precision: 0, unit: 'ms' }),
    Object.freeze({ id: 'debugMaxCrouchCm', query: 'crouchCm', profileKey: 'maxCrouchMeters', scale: 0.01, defaultValue: profileDefaults.maxCrouchMeters * 100, precision: 1, unit: 'cm' }),
    Object.freeze({ id: 'debugCrouchSpeed', query: 'crouchSpeed', profileKey: 'crouchSpeedMps', scale: 1, defaultValue: profileDefaults.crouchSpeedMps, precision: 2, unit: 'm/s' }),
    Object.freeze({ id: 'debugEdgeCm', query: 'edgeCm', profileKey: 'edgeActivationMeters', scale: 0.01, defaultValue: profileDefaults.edgeActivationMeters * 100, precision: 1, unit: 'cm' }),
    Object.freeze({ id: 'debugPlaneCm', query: 'planeCm', profileKey: 'kneeThreatPlaneMeters', scale: 0.01, defaultValue: profileDefaults.kneeThreatPlaneMeters * 100, precision: 1, unit: 'cm' }),
    Object.freeze({ id: 'debugLowGapCm', query: 'lowGapCm', profileKey: 'lowGapVerticalActivationMeters', scale: 0.01, defaultValue: profileDefaults.lowGapVerticalActivationMeters * 100, precision: 1, unit: 'cm' }),
    Object.freeze({ id: 'debugDownRatio', query: 'downRatio', profileKey: 'kneeThreatDownRatio', scale: 1, defaultValue: profileDefaults.kneeThreatDownRatio, precision: 2, unit: '' }),
    Object.freeze({ id: 'debugKneeBandCm', query: 'kneeBandCm', profileKey: 'kneeLineBandMeters', scale: 0.01, defaultValue: profileDefaults.kneeLineBandMeters * 100, precision: 0, unit: 'cm' }),
    Object.freeze({ id: 'debugArmAttemptCm', query: 'armAttemptCm', profileKey: 'armAttemptActivationMeters', scale: 0.01, defaultValue: profileDefaults.armAttemptActivationMeters * 100, precision: 1, unit: 'cm' }),
  ]);
  const profile = {};

  function clampControl(input, value) {
    return Math.max(Number(input.min), Math.min(Number(input.max), Number(value)));
  }

  function refresh(syncUrl = true) {
    if (!debugMode) return;
    const url = new URL(windowRef.location.href);
    for (const spec of controls) {
      const input = documentRef.getElementById(spec.id);
      const value = clampControl(input, input.value);
      input.value = String(value);
      profile[spec.profileKey] = value * spec.scale;
      documentRef.getElementById(`${spec.id}Value`).textContent = `${value.toFixed(spec.precision)}${spec.unit}`;
      if (syncUrl) url.searchParams.set(spec.query, String(value));
    }
    if (syncUrl) windowRef.history.replaceState(null, '', url);
    elements.debugProfileSummary.textContent = `ACTIVE · lead ${Math.round(profile.anticipatoryLeadMaxSeconds * 1000)}ms · crouch ${(profile.maxCrouchMeters * 100).toFixed(1)}cm @ ${profile.crouchSpeedMps.toFixed(2)}m/s · edge ${(profile.edgeActivationMeters * 100).toFixed(1)}cm · plane ${(profile.kneeThreatPlaneMeters * 100).toFixed(1)}cm · lowgap ${(profile.lowGapVerticalActivationMeters * 100).toFixed(1)}cm · down ${profile.kneeThreatDownRatio.toFixed(2)} · knee ±${(profile.kneeLineBandMeters * 100).toFixed(0)}cm · arm gate ${(profile.armAttemptActivationMeters * 100).toFixed(1)}cm`;
  }

  function initialize() {
    elements.stanceDebugPanel.hidden = !debugMode;
    documentRef.documentElement.dataset.debugMode = debugMode ? 'on' : 'off';
    if (!debugMode) return;
    for (const spec of controls) {
      const input = documentRef.getElementById(spec.id);
      const rawQueryValue = debugQuery.get(spec.query);
      const queryValue = rawQueryValue == null || rawQueryValue.trim() === ''
        ? Number.NaN
        : Number(rawQueryValue);
      input.value = String(Number.isFinite(queryValue)
        ? clampControl(input, queryValue)
        : spec.defaultValue);
      input.addEventListener('input', () => refresh(true));
    }
    refresh(false);
  }

  function resetDefaults() {
    for (const spec of controls) {
      documentRef.getElementById(spec.id).value = String(spec.defaultValue);
    }
    refresh(true);
  }

  return Object.freeze({
    profile,
    controls,
    initialize,
    refresh,
    resetDefaults,
  });
}
