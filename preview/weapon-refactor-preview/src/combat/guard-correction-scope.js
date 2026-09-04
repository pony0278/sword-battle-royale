// @ts-check
// Which bones a guard correction is allowed to touch, and how far it may move each one.
//
// handoff/39 classified this as category B. Nothing in it names a weapon: it is the right arm
// chain, the torso, the off hand, and the mount socket the hand carries - the rig's own anatomy,
// with a degree budget per bone measured against that rig. The forbidden list is the same
// statement from the other side: a guard pose is an upper-body correction, so the root, the hips
// and both legs stay where the source animation put them, whatever is being held.
//
// The one bone here that touches equipment is handslot.r, and the policy caps it at 15 degrees of
// trim. That cap is about the socket, not about what is socketed - a greatsword hangs off the same
// bone as a longsword, and moving it further would move the arm's silhouette rather than the grip.

export const GUARD_CORRECTION_SCOPE = Object.freeze({
  requiredBones: Object.freeze([
    'upperarm.r',
    'lowerarm.r',
    'wrist.r',
  ]),
  optionalBones: Object.freeze([
    'chest',
    'upperarm.l',
    'lowerarm.l',
    'wrist.l',
    'handslot.r',
  ]),
  forbiddenBones: Object.freeze([
    'root',
    'hips',
    'upperleg.l',
    'upperleg.r',
    'lowerleg.l',
    'lowerleg.r',
    'foot.l',
    'foot.r',
    'toes.l',
    'toes.r',
  ]),
  maxLocalCorrectionDegrees: Object.freeze({
    chest: 8,
    'upperarm.r': 40,
    'lowerarm.r': 50,
    'wrist.r': 65,
    'upperarm.l': 20,
    'lowerarm.l': 25,
    'wrist.l': 30,
    'handslot.r': 15,
  }),
  policy: Object.freeze({
    preserveRootAndLowerBody: true,
    preserveSourceTorsoWeight: true,
    preserveOffHandUnlessNeeded: true,
    equipmentTrimOnly: true,
    equipmentTrimMaxDegrees: 15,
  }),
});

export function getGuardCorrectionBones() {
  return Object.freeze([
    ...GUARD_CORRECTION_SCOPE.requiredBones,
    ...GUARD_CORRECTION_SCOPE.optionalBones,
  ]);
}
