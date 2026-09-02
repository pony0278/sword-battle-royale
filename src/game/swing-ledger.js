export const SWING_LEDGER_STAGE = 'R23M.1';

// R23L.1 — every swing the player throws leaves a line, on the page, in the words a person reads.
//
// WHY THIS EXISTS. R23K.1 measured the player's swing in six scenarios that a probe could drive -
// stationary sweeps from 1.0m to 2.7m, the opponent-first flow in three modes, a driven session,
// real clicks at the right edge, lock-on movement, parry-then-counter - and landed RIGHT in every
// one of them, while the person playing the same build reported RIGHT doing nothing. When the
// probe and the player disagree, the measurement has to move to where the player is. This is the
// instrument: what the swing asked for, whether the game let it start and if not why, how far
// apart the fighters stood when the button went down, and what the blade found when it arrived.
//
// It is a ring rather than a stream. The HUD shows the newest few, because a HUD line is read
// between exchanges by someone holding a mouse and six is what fits in an eye's worth of
// attention; the ring behind it is longer, because R23M.1 added a button that copies the whole
// thing, and a run pasted into a conversation is worth more than the last six lines of it.
export function createSwingLedger({ capacity = 40, shown = 6 } = {}) {
  const entries = [];
  let count = 0;
  let open = null;

  const meters = (value) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}m` : '—');
  // Newest first BY NUMBER, not by when it settled: a refusal that lands while a swing is still in
  // the air is numbered after it and must read after it, or the page tells the story out of order.
  const push = (entry) => {
    entries.push(entry);
    entries.sort((a, b) => b.n - a.n);
    while (entries.length > capacity) entries.pop();
  };

  function recordRefusal({ direction = null, reason = 'unknown', separationMeters = null } = {}) {
    count += 1;
    push(Object.freeze({ n: count, direction, started: false, reason: String(reason), separationAtPress: separationMeters }));
  }

  function recordSwing({ direction = null, separationMeters = null, mount = null, mode = null, locked = null } = {}) {
    if (open) settle({});
    count += 1;
    open = { n: count, direction, started: true, separationAtPress: separationMeters, mountAtPress: mount, mode, locked };
  }

  // The mount the blade actually wore while it was in the air. Read at the press it is still the
  // guard's (the dial writes next frame), and read at the falling edge it is the guard's again
  // (the runtime goes inactive before the snapshot empties), so the only honest reading is the
  // one taken mid-swing - which is what this is for. The last value noted wins.
  function note({ mount = null } = {}) {
    if (!open || mount == null) return false;
    open.mountInFlight = mount;
    return true;
  }

  function settle({ bodyHit = null, outcome = null, separationMeters = null } = {}) {
    if (!open) return false;
    const approach = bodyHit?.closestApproach || {};
    push(Object.freeze({
      ...open,
      separationAtEnd: separationMeters,
      mountInFlight: open.mountInFlight ?? null,
      probed: bodyHit != null,
      hit: bodyHit?.contact === true,
      band: bodyHit?.band ?? null,
      shortMeters: Number(approach.planeGapMeters ?? 0),
      besideMeters: Number(approach.radialGapMeters ?? 0),
      outcome: outcome ?? null,
    }));
    open = null;
    return true;
  }

  function line(entry) {
    const dir = String(entry.direction || '?').toUpperCase();
    if (!entry.started) return `#${entry.n} ${dir} ${meters(entry.separationAtPress)} 沒出招: ${entry.reason}`;
    const span = `${meters(entry.separationAtPress)}→${meters(entry.separationAtEnd)}`;
    const mount = entry.mountInFlight ? ` 掛點 ${String(entry.mountInFlight).split('-')[0]}` : '';
    if (entry.hit) return `#${entry.n} ${dir} ${span} 命中 ${entry.band}${mount}`;
    if (!entry.probed) return `#${entry.n} ${dir} ${span} 沒量到刀${entry.outcome ? ` (${entry.outcome})` : ''}${mount}`;
    return `#${entry.n} ${dir} ${span} 落空 短${entry.shortMeters.toFixed(2)} 偏${entry.besideMeters.toFixed(2)}${entry.outcome ? ` (${entry.outcome})` : ''}${mount}`;
  }

  return Object.freeze({
    stage: SWING_LEDGER_STAGE,
    recordRefusal,
    recordSwing,
    note,
    settle,
    reset() { entries.length = 0; open = null; count = 0; },
    get open() { return open ? Object.freeze({ ...open }) : null; },
    get report() {
      const lines = entries.map(line);
      return Object.freeze({
        stage: SWING_LEDGER_STAGE,
        count,
        entries: Object.freeze(entries.slice()),
        lines: Object.freeze(lines),
        hudLines: Object.freeze(lines.slice(0, shown)),
      });
    },
  });
}

// R23M.1 — the pasteable form. A line without the run it came from cannot be compared to the next
// one, so the copy carries the build, the mode, the lock, the mount dial and the health alongside
// the swings. Newest first, as on the HUD, so the two read the same way.
export function formatSwingLedgerReport({ report = null, context = {} } = {}) {
  const yesNo = (value) => (value === true ? '是' : value === false ? '否' : '—');
  const mount = context.weaponMount
    ? `${context.weaponMount.mode ?? '—'}(${context.weaponMount.reason ?? '—'}) 現在 ${String(context.weaponMount.applied ?? '—').split('-')[0]}`
    : '—';
  const health = context.duel
    ? `你 ${context.duel.player?.health ?? '—'} / 對手 ${context.duel.opponent?.health ?? '—'}`
    : '—';
  const head = [
    `build ${context.build ?? 'unknown'}`,
    `模式 ${context.mode ?? '—'} · 鎖定 ${yesNo(context.locked)} · 掛點 ${mount} · 對手 ${context.opponent ?? '手動'}`,
    `血量 ${health}`,
  ];
  const lines = report?.lines ?? [];
  if (lines.length === 0) return [...head, '出刀 0 次（尚未出刀）'].join('\n');
  return [...head, `出刀 ${report.count} 次，最近 ${lines.length} 筆（新→舊）：`, ...lines].join('\n');
}
