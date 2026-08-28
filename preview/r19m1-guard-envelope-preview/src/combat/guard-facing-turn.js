export const GUARD_FACING_TURN_STAGE = 'R19Q.1';

// R19Q.1: the defender turns their body toward the arc. Stage A of facing.
//
// RIGHT's defence was measured dead three separate ways: its landing and blocking bands do not
// touch (R19L.2), every arm-servo ablation failed including the envelope that saved TOP (R19M.1),
// and its close hilt corridor enters 0.85m wide of the resting shield (R19P.1). All three say the
// same thing - the missing degree of freedom is not in the arm. A person stops a sweep at their
// open side by turning their hips, and the body had no way to turn.
//
// Premise measured before any of this was built, by pre-setting the defender's root yaw and
// replaying RIGHT at its unanswered stances, fresh page per trial:
//
//   yaw      1.6m   1.8m   2.0m        yaw toward the sweep (+) vs away (-)
//    0 deg    -     0/3    0/3
//  -15..-45   -     0/3    0/3         turning away does nothing, as it should
//  +20 deg   4/4    2/4    2/4
//  +25 deg   4/4    0/4    4/4
//  +30 deg   4/4    2/4    4/4
//  +40 deg   4/4    5/8    4/4         far stances 2.2-2.6m stay 12/12 - no regression
//
// 40 degrees is the first angle that answers every stance, and 1.8m stays a rate rather than a
// verdict there (5/8) - it is RIGHT's knife-edge stance, where contact lands exactly on the
// geometric boundary. A rate beating a measured zero is the honest claim; "fixed" is not.
//
// R19Q.2 measured the other two directions the same way, dynamically (the body turning during
// the exchange, fresh page per trial), and each has its own story:
//
//   TOP at its 2.0m rate stance (5/6 shipping):   -25/-15 deg -> 0/3, every swing LANDS
//                                                  +15 deg    -> 8/8   +25 deg -> 8/8
//   LEFT at its 1.6m knife-edge (1/6 shipping):   +10..+40 -> 0/3     -10 -> 0/3
//                                                  -30 -> 6/8   -45 -> 8/8   far stances 12/12
//
// Three findings worth their space. The sign is per-direction because the arcs arrive on
// opposite sides - LEFT turns the body the other way from RIGHT. TOP takes the SMALLER of its
// two working angles, because both saturate and the wrong sign is catastrophic rather than
// merely useless: -15 deg does not degrade TOP, it hands every swing to the body, so staying
// close to square keeps the cliff at a distance. And the angles are not one number: 40/-45/15
// are each that direction's own measured crossing, which is exactly what "the guard covers the
// committed direction" should mean for a body and not just an arm.
//
// Turning stays gated to the chase posture - the close-range clang corridors (R19P.1) were
// measured against an unturned body, and a hold-posture turn would move them unmeasured.
export const MEASURED_GUARD_FACING_TURN_RADIANS = Object.freeze({
  top: (15 * Math.PI) / 180,
  right: (40 * Math.PI) / 180,
  left: (-45 * Math.PI) / 180,
});

// The premise test pre-turned the body; live, the turn must finish before the sweep arrives.
// RIGHT's blade enters its active window around 0.2s after commitment, so 40 degrees needs about
// 200 deg/s with nothing to spare - the rate carries margin over that. The return is slower on
// purpose: snapping back to square reads as teleporting, and nothing about standing back down
// is urgent.
export const GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND = (280 * Math.PI) / 180;
export const GUARD_FACING_RETURN_RATE_RADIANS_PER_SECOND = (120 * Math.PI) / 180;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// What the body should be doing about this attack, decided by guard logic each frame of a block
// exchange. Orientation only: it moves no contact authority, and the parry keeps its own contract
// by never producing a plan at all.
export function planGuardFacingTurn(input = {}) {
  const direction = String(input.direction || '').toLowerCase();
  const engaged = input.engaged === true;
  const posture = String(input.posture || 'chase');
  const target = engaged && posture === 'chase'
    ? finite(MEASURED_GUARD_FACING_TURN_RADIANS[direction])
    : 0;
  return Object.freeze({
    stage: GUARD_FACING_TURN_STAGE,
    direction,
    engaged,
    posture,
    targetRadians: target,
    reason: !engaged ? 'not-engaged-return-square'
      : posture !== 'chase' ? 'hold-posture-clang-corridors-measured-unturned'
        : target !== 0 ? 'turn-into-the-arc' : 'direction-defends-square',
    authority: 'defender-orientation-only-no-contact-authority',
  });
}

// Integrates the actual body yaw toward whatever the current plan asks. Owned by locomotion (the
// lane controller), because body orientation on the ground plane is locomotion state - stage B
// makes that literal. `planIsLive` is the caller's liveness signal: guard logic writes a fresh
// plan every frame it runs, so seeing the same plan twice means the exchange is over and the
// body stands back down.
export function createGuardFacingTurnRuntime(options = {}) {
  const turnRate = Math.max(1e-6, finite(options.turnRateRadiansPerSecond, GUARD_FACING_TURN_RATE_RADIANS_PER_SECOND));
  const returnRate = Math.max(1e-6, finite(options.returnRateRadiansPerSecond, GUARD_FACING_RETURN_RATE_RADIANS_PER_SECOND));
  let yawRadians = 0;
  let lastPlan = null;

  function update(plan, deltaSeconds) {
    const dt = Math.max(0, finite(deltaSeconds));
    const live = plan != null && plan !== lastPlan;
    lastPlan = plan ?? null;
    const target = live ? finite(plan.targetRadians) : 0;
    const delta = target - yawRadians;
    const rate = Math.abs(target) > Math.abs(yawRadians) && Math.sign(target || 0) === Math.sign(delta || 0)
      ? turnRate
      : returnRate;
    const step = Math.min(Math.abs(delta), rate * dt);
    yawRadians += Math.sign(delta) * step;
    return yawRadians;
  }

  return Object.freeze({
    update,
    get yawRadians() { return yawRadians; },
    reset() { yawRadians = 0; lastPlan = null; },
  });
}
