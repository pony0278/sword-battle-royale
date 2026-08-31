// R21C.2: where the player is pointing, and nothing else.
//
// This drew two things at once - the player's sector and the attacker's committed direction - as
// two colours on the same three cells, which meant the most important state of all, "my aim matches
// the attack", was a third colour a player had to learn. Two independent variables sharing one
// visual channel.
//
// The threat half is gone rather than moved. A game that asks you to watch your opponent should not
// flash a light at the bottom of the screen at the exact moment you most need to be watching them:
// the amber pulled the eye down during the windup, which is the read it was supposedly helping.
// What it bought is measured and real - R21A.1 put it at 67ms, the gap between the attacker
// committing and the animation separating - and the cost of doing without is that a player reads
// the swing itself. The tells are measurable and sayable: TOP rises at +4.45 m/s, LEFT falls from
// 2.19m at -7.01, RIGHT stays level at -1.79.
//
// The aim half stays because it cannot be read anywhere else. The mouse is absolute and there is no
// pointer lock, so without this the player has no way to know which sector they are in.
//
// It writes only to its own element, and only when the value changed: this runs every frame.
export function createGuardSectorIndicator(root) {
  if (!root) return Object.freeze({ update() {}, get element() { return null; } });
  const cells = new Map();
  root.querySelectorAll('[data-sector]').forEach((cell) => cells.set(cell.dataset.sector, cell));
  let lastSector = Symbol('unset');

  return Object.freeze({
    update({ sector = null } = {}) {
      if (sector === lastSector) return false;
      lastSector = sector;
      for (const [name, cell] of cells) cell.classList.toggle('aimed', name === sector);
      return true;
    },
    get element() { return root; },
  });
}
