// R21A.2: the three-sector guard indicator, and the direction being thrown at you.
//
// Two things a player cannot otherwise know. Their own sector is invisible because the guard is a
// shield in front of a body the camera crops; the attacker's committed direction is invisible
// because R21A.1 measured that the three windups are told apart by the tip's vertical velocity -
// +4.45 m/s rising for TOP, -1.79 level for RIGHT, -7.01 falling for LEFT - inside 167 to 333ms.
// That is not something eyes read off a blocky silhouette, which is why every game with directional
// defence draws it rather than hoping.
//
// It writes only to its own element, and only when a value actually changed: this runs every frame.
export function createGuardSectorIndicator(root) {
  if (!root) return Object.freeze({ update() {}, get element() { return null; } });
  const cells = new Map();
  root.querySelectorAll('[data-sector]').forEach((cell) => cells.set(cell.dataset.sector, cell));
  let lastSector = Symbol('unset');
  let lastThreat = Symbol('unset');

  return Object.freeze({
    update({ sector = null, threatDirection = null } = {}) {
      if (sector === lastSector && threatDirection === lastThreat) return false;
      lastSector = sector;
      lastThreat = threatDirection;
      for (const [name, cell] of cells) {
        cell.classList.toggle('aimed', name === sector);
        cell.classList.toggle('threat', name === threatDirection);
      }
      root.classList.toggle('has-threat', threatDirection != null);
      return true;
    },
    get element() { return root; },
  });
}
