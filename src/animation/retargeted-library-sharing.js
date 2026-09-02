export const RETARGETED_LIBRARY_SHARING_STAGE = 'R23D.1';

// R23D.1 — when one fighter's retargeted clips may be played by the other, and why the answer
// used to be assumed rather than asked.
//
// bootstrap loaded five libraries for two fighters and said, in a comment, that the UAL and Skyrim
// packs could not be shared the way KayKit's could, "because the UAL libraries are retargeted onto
// the rig they are loaded with". That reasoning is sound in principle and was false in fact, which
// is the worst combination: it reads as a measurement and had never been one. The cost was that
// the attacker had no guard clip on their rig and the defender had no RIGHT or LEFT - so the
// mirror duel was blocked by an asset asymmetry nobody had checked.
//
// MEASURED, in a browser, on the real packs:
//   * the two fighters are both createDefaultCharacter(THREE) with no arguments, so their rigs
//     carry the SAME frozen definition object - 23 bones, identical rest transforms, world rest
//     pose max delta exactly 0;
//   * the same source retargeted separately onto each rig produced bit-identical clips - every
//     track name, every key time, every value;
//   * the weapon bind calibration came out equal on both;
//   * registering either pack on the other fighter validated, and the resulting sampled pose
//     matched bone for bone to 0.000000 degrees.
//
// WHY it holds, which matters more than the numbers: a retarget emits tracks addressed by BONE
// NAME (sanitizeAnimationTargetName of the target id), and registration is a Map keyed by clip
// name. Nothing in a finished clip points at a particular rig's objects. What the retarget DOES
// bake in is geometry - rest transforms, the motion scale, the basis calibration - and every one
// of those is derived from rig.definition, which is why the definition is the whole question.
//
// So the rule is one line and this module exists to make it a question rather than an assumption:
// clips may be shared exactly when both rigs were built from the same definition. The day fighters
// get different proportions, this refuses out loud instead of quietly playing a tall man's animation
// on a short one.
export function retargetedLibraryMayBeShared(rigA, rigB) {
  if (!rigA?.definition || !rigB?.definition) {
    return frozen(false, 'a-rig-is-missing-its-definition');
  }
  // The fast, exact path, and the one that holds today: both rigs came from the same frozen
  // module constant, so there is nothing to compare.
  if (rigA.definition === rigB.definition) return frozen(true, 'one-definition-built-both-rigs');
  // A definition that is a separate but equal object describes the same body, and refusing it
  // would be a false alarm. Compared structurally rather than by JSON.stringify: key order is not
  // part of the answer, and a stringify comparison would call two identical bodies different for
  // having been written down in a different order.
  if (sameDefinition(rigA.definition, rigB.definition)) {
    return frozen(true, 'two-definitions-describing-the-same-body');
  }
  return frozen(false, 'the-two-rigs-were-built-from-different-definitions');
}

function frozen(shareable, reason) {
  return Object.freeze({
    stage: RETARGETED_LIBRARY_SHARING_STAGE,
    shareable,
    reason,
    // Stated rather than implied: this is WHY a shared clip lands on the right bones, and a future
    // change that moves clip binding away from names invalidates this module rather than bending it.
    mechanism: 'retargeted-tracks-are-addressed-by-bone-name',
    authority: 'asset-sharing-only-no-contact-authority',
  });
}

// Deep structural equality over the small frozen tree a rig definition is. Deliberately not a
// general-purpose deepEqual: it knows that values here are strings, numbers, arrays and plain
// objects, and that an array's order is meaningful (bones are a hierarchy in build order).
function sameDefinition(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return Object.is(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => sameDefinition(value, b[index]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameDefinition(a[key], b[key]));
}
