function updateSlider(id, value, digits = 2, suffix = '') {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}Value`);
  if (!input || !output) return;
  input.value = String(value);
  output.textContent = `${Number(value).toFixed(digits)}${suffix}`;
}

export function createStudioCombatFeelController(preview) {
  let externalImpactReleaseTimer = null;

  function applyProfile(slot) {
    const select = document.getElementById(`feelProfile${slot}`);
    const name = select?.value || 'light';
    const applied = preview.applyFeelProfile(name);
    updateSlider('hitstop', applied.hitstop, applied.hitstop % 0.01 === 0 ? 2 : 3, 's');
    updateSlider('shake', applied.shake);
    updateSlider('knockback', applied.knockback);
    const status = document.getElementById('feelProfileStatus');
    if (status) status.textContent = `Active ${slot} · ${applied.label} · same animation, different impact response`;
    document.getElementById('feelUseA')?.classList.toggle('on', slot === 'A');
    document.getElementById('feelUseB')?.classList.toggle('on', slot === 'B');
  }

  function releaseExternalImpact(hitstopSeconds) {
    preview.consumeHitstop(hitstopSeconds + 0.001);
    preview.consumeHitstop(0);
  }

  function handleExternalImpact() {
    if (externalImpactReleaseTimer !== null) clearTimeout(externalImpactReleaseTimer);
    preview.triggerImpact();
    const hitstopSeconds = Math.max(0, Number(preview.feel?.hitstop) || 0);
    if (hitstopSeconds <= 0) {
      releaseExternalImpact(0);
      return;
    }
    externalImpactReleaseTimer = setTimeout(() => {
      externalImpactReleaseTimer = null;
      releaseExternalImpact(hitstopSeconds);
    }, hitstopSeconds * 1000);
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('action-studio-external-impact', handleExternalImpact);
  }

  const controls = document.getElementById('feelAbControls');
  if (!controls) return { applyProfile, handleExternalImpact };
  document.getElementById('feelUseA')?.addEventListener('click', () => applyProfile('A'));
  document.getElementById('feelUseB')?.addEventListener('click', () => applyProfile('B'));
  document.getElementById('feelProfileA')?.addEventListener('change', () => {
    if (document.getElementById('feelUseA')?.classList.contains('on')) applyProfile('A');
  });
  document.getElementById('feelProfileB')?.addEventListener('change', () => {
    if (document.getElementById('feelUseB')?.classList.contains('on')) applyProfile('B');
  });
  applyProfile('A');
  return { applyProfile, handleExternalImpact };
}
