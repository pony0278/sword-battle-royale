// The greatsword's rig, kept apart from the builder so that it is opt-in.
//
// Everything about drawing it lives in procedural-v3-weapon.js. What is here is only the pairing of
// this weapon's extracted geometry with a rig id, and it is its own module for a cold-start reason:
// the geometry is 82 KB of generated source, and the builder is reached by every page that draws a
// sword. A page that wants a greatsword imports this; a page that does not, does not pay for it.
import { defineV3Weapon } from './procedural-v3-weapon.js';
import { V3_GREATSWORD_GEOMETRY_DEFINITION } from './v3-greatsword-geometry-definition.js';

export const V3_GREATSWORD_DEFINITION = defineV3Weapon({
  id: 'v3_procedural_greatsword',
  weaponType: 'greatsword',
  sourceGeometry: V3_GREATSWORD_GEOMETRY_DEFINITION,
});
