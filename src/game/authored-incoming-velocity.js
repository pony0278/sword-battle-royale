// R20Z.3: the blade velocity a contact falls back on when nothing measured one.
//
// This lived in direct-old-b3-diagnostic.js, which is a lab tool that fabricates a whole coupling
// report to force a reaction without a real exchange. The velocity table is not that. It is the
// authored answer the contact handoff uses in play, per direction, when the swept probe has no
// measured incoming velocity to hand it - gameplay wearing a diagnostic's name, and the only thing
// in this folder that made a game module import a lab one.
//
// The numbers are unchanged, and the diagnostic still uses them: a forced reaction should arrive
// with the same velocity a real one would.
export function authoredIncomingVelocity(direction) {
  if (direction === 'left') return Object.freeze({ x: -4.8, y: -0.4, z: 2.0 });
  if (direction === 'top') return Object.freeze({ x: 0.2, y: -6.4, z: 0.6 });
  return Object.freeze({ x: 4.8, y: -0.4, z: 2.0 });
}
