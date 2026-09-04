// @ts-check
// The directional triangle, as vocabulary rather than as one weapon's property.
//
// handoff/39 classified this as category B: a name that says "longsword" over a value that has
// nothing to do with what is held. Two module-level assertions state the reason out loud -
// guard-sector.js and attack-direction-as-defended.js both check that the guard sectors and these
// directions are the same three words. A sector is a place on the defender's body; a direction is a
// place on the attacker's swing. They match because the game names them from the same vocabulary,
// and a second weapon swings into the same three sectors as the first.
//
// So this list is shared, and the modules that read it stop importing the longsword to get it.
export const ATTACK_DIRECTIONS = Object.freeze(['top', 'right', 'left']);
