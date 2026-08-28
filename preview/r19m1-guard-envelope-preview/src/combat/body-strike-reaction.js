export const BODY_STRIKE_REACTION_STAGE = 'R19K.1';

// R19K.1: what a fighter does about a blade that reached them.
//
// Until now nothing did. The lifecycle has probed the body since the hurtbox existed and publishes
// a `body-struck` event when the swept blade genuinely lands, but the only consumer was a line of
// status text - so a hit that got through produced no motion at all, and the sword simply passed
// through a defender who went on holding a guard that had just failed. That is the "the attack goes
// through the defender" this answers.
//
// The signal is the event, never `latestBodyHit`. That field holds the nearest body reading of the
// exchange and body-hurtbox stores near-misses in it too, so a reaction driven from it would fire
// on blocks and parries where the blade only swept past. R19J.2 records that trap in full; this is
// the module that would have shipped it.
//
// The reaction is a takeover, not an overlay. Measured on the clip: Hit_B drives 23 bones
// including root, hips, spine, both legs and BOTH arms - the shield arm among them. There is no
// subset to lift the way the walk's legs were lifted in R19E, and there should not be: a blade that
// reached the body went past the guard, so the guard losing its shape is the honest reading rather
// than something to preserve. It follows that this must be applied after every other writer on the
// defender, and that it ends by giving the fighter back rather than by blending two intents.
export const BODY_STRIKE_REACTION_CLIP_ID = 'Hit_B';

// Measured off the loaded clip rather than authored: 0.867s over 23 bones in the KayKit `general`
// pack. KayKit clips run on the character's own rig, so this needs no retarget - the reason it was
// preferred over UAL2's Hit_Knockback, which would have needed a defender-fitted copy and brought
// the retargeted-versus-native pelvis disagreement that cost R19E a screenshot.
export const BODY_STRIKE_REACTION_DURATION_SECONDS = 0.867;

// Every band the hurtbox can report, mapped to the one reaction that exists. Written as a map
// rather than a constant so that giving the head a different flinch from the knees later is a data
// change: Hit_A and Melee_Block_Hit arrived in the same pack and are the obvious next entries.
export const BODY_STRIKE_REACTION_BY_BAND = Object.freeze({
  head: BODY_STRIKE_REACTION_CLIP_ID,
  chest: BODY_STRIKE_REACTION_CLIP_ID,
  waist: BODY_STRIKE_REACTION_CLIP_ID,
  knees: BODY_STRIKE_REACTION_CLIP_ID,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// The plan for one landed blow. Returns null for anything that is not a real strike, which is the
// gate that keeps near-misses out: callers pass the lifecycle's body contact straight in.
export function planBodyStrikeReaction(bodyContact) {
  if (bodyContact?.contact !== true) return null;
  const band = String(bodyContact.band || '').toLowerCase();
  const clipId = BODY_STRIKE_REACTION_BY_BAND[band] || BODY_STRIKE_REACTION_CLIP_ID;
  return Object.freeze({
    stage: BODY_STRIKE_REACTION_STAGE,
    clipId,
    band: band || null,
    durationSeconds: BODY_STRIKE_REACTION_DURATION_SECONDS,
    ownsWholeFighter: true,
    authority: 'presentation-takeover-only-no-contact-authority',
  });
}

// Where the reaction is at, given how long it has been running. Pure: the caller owns the clock and
// the sampling, this owns only what "how far in" means.
export function sampleBodyStrikeReaction(plan, elapsedMs) {
  if (!plan) return null;
  const durationSeconds = Math.max(0.001, finite(plan.durationSeconds, BODY_STRIKE_REACTION_DURATION_SECONDS));
  const elapsedSeconds = Math.max(0, finite(elapsedMs) / 1000);
  const complete = elapsedSeconds >= durationSeconds;
  return Object.freeze({
    stage: BODY_STRIKE_REACTION_STAGE,
    clipId: plan.clipId,
    // Held at the last frame rather than wrapped: the clip plays once and the fighter is handed
    // back on completion, so looping would restart a stagger nobody was hit for a second time.
    timeSeconds: Math.min(elapsedSeconds, durationSeconds),
    progress: Math.min(1, elapsedSeconds / durationSeconds),
    complete,
  });
}
