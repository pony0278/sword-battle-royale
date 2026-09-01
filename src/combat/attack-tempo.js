export const ATTACK_TEMPO_STAGE = 'R21O.1';

// R21O.1 - the swing is not unreadable. It is unreadable IN TIME.
//
// R21N.1 made one press name the direction and be the timed input, and the tally then said the
// input was fixed and the reading was not: across two runs and 50 well-timed presses, 28% named
// the right direction against 33% for a coin (z = -0.80). Telling the player the direction in
// advance - the drive's own upcoming swing, read off the HUD - moved that to 19 of 22, 86%,
// z = +5.3. So the window is wide enough, the press is fast enough, and the hand knows what to do.
// What is missing is the answer, at a moment early enough to act on.
//
// Measuring the blade tip every 4ms of sim time says exactly when the answer exists. Closest pair
// of the three tips, on screen (lateral and height; depth is foreshortened, so counting it would
// credit the player with information the screen does not carry):
//
//   elapsed   4ms  1.13m      <- the poses are already distinct at the first frame
//            60ms  0.92m
//           116ms  0.28m      <- and at their most alike exactly here
//           220ms  0.76m
//           260ms  1.26m      <- the window opens
//           360ms  2.41m
//
// The direction is loudest at the first frame, decays to nothing by 116ms, and only recovers past
// 220ms. A player notices a swing when it starts MOVING, which is the middle of that dip; by the
// time the arcs separate again there is no reaction left to spend. Contact is at 430ms.
//
// So: the same swing, given more time to be seen. Not a new pose, not a telegraph, not a HUD.
//
//   answer legible from  220ms      (the three stay >= 0.75m apart from here on)
//   human reaction        300ms      (measured this session: presses land 285-347ms after start)
//   window                contact-180 .. contact-60, fixed - the press stays as hard as it was
//
// Scaling the whole attack by k moves the answer to 220k and contact to 430k, so a press launched
// the moment the answer exists lands at 220k + 300, and it must fall inside the window:
//
//   430k - 180 <= 220k + 300   ->  k <= 2.29
//   220k + 300 <= 430k -  60   ->  k >= 1.71
//
// The band is narrow because both ends move: too slow and the read arrives so early the press is
// premature; too fast and it arrives after the window has shut.
//
// That band is for ONE reaction time. A person is a distribution, and this one was measured: the
// presses land 285-347ms after the swing starts. Solving the same pair for the whole 250-350ms
// spread rather than its middle closes the band hard:
//
//   250ms reaction must not be early:  220k + 250 >= 430k - 180  ->  k <= 2.05
//   350ms reaction must not be late:   220k + 350 <= 430k -  60  ->  k >= 1.95
//
// 2.0 is the centre of that, and driving the built page at each scale confirms it end to end -
// contact 860ms, the three tips back above 0.75m apart at 440ms (the model says 220 * 2 = 440),
// window 680-800ms, every reaction from 250 to 350ms landing inside. 1.8 was the first choice here
// and it was wrong: it covers 250-300ms only, which clips the slower half of the measured spread.
//
// This is an EXPERIMENT, and it is built to be falsified. If direction accuracy jumps at 1.8, the
// animation was always readable and only the clock was wrong, and the next question is how much of
// the speed can be bought back by making the windup diverge earlier. If it stays at chance, the
// poses carry no directional meaning at any speed - LEFT prepares by raising the blade to 2.22m,
// which no one reads as "a cut from the left" - and no amount of slowing will fix that.
export const DEFAULT_ATTACK_TEMPO_SCALE = 1;

// The scale the R21O.1 playtest runs at. Not the default: the golden grid and the parry gate are a
// committed record of the exchange at 1x, and an experiment that quietly moved every measured
// contact time out from under them would be indistinguishable from a regression.
export const EXPERIMENT_ATTACK_TEMPO_SCALE = 2;

// Two bands, because they answer two different questions. The single-reaction one is the wider
// claim "a 300ms player could parry at all"; the measured-spread one is "this player, as they
// actually press, can". Only the second is worth shipping an experiment at.
export const READABLE_TEMPO_SCALE_BOUNDS = Object.freeze({
  min: 1.71,
  max: 2.29,
  answerLegibleFromMs: 220,
  reactionMs: 300,
  contactMs: 430,
  windowMs: Object.freeze({ opensAtTtc: 180, closesAtTtc: 60 }),
});

export const MEASURED_REACTION_SPREAD_MS = Object.freeze({ fastest: 250, slowest: 350 });

export const TEMPO_SCALE_COVERING_THE_SPREAD = Object.freeze({
  min: 1.95,
  max: 2.05,
  verifiedInThePage: Object.freeze({
    scale: 2,
    contactMs: 860,
    answerLegibleFromMs: 440,
    windowMs: Object.freeze({ opens: 680, closes: 800 }),
    reactionsInsideMs: Object.freeze([250, 275, 300, 325, 350]),
  }),
});

export const ATTACK_TEMPO_EVIDENCE = Object.freeze({
  readingTheBlade: Object.freeze({ correct: 14, of: 50, z: -0.8 }),
  toldTheAnswer: Object.freeze({ correct: 19, of: 22, z: 5.3 }),
  closestPairMeters: Object.freeze({ atFirstFrame: 1.13, at116ms: 0.28, at220ms: 0.76, at260ms: 1.26 }),
  authority: 'timing-scale-only-no-contact-authority',
});

// A scale below 1 would speed the fight up, which no measurement here supports, and an unbounded
// one turns a typo in a query string into a swing that never lands.
export const ATTACK_TEMPO_SCALE_RANGE = Object.freeze({ min: 1, max: 3 });

export function clampAttackTempoScale(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return DEFAULT_ATTACK_TEMPO_SCALE;
  return Math.min(ATTACK_TEMPO_SCALE_RANGE.max, Math.max(ATTACK_TEMPO_SCALE_RANGE.min, scale));
}

// Whether a scale would actually put the answer inside the window, by the derivation above. Used
// to label a run rather than to refuse one: a tester is allowed to try 1.2 and see it fail.
export function tempoScalePutsAnswerInsideWindow(value) {
  const scale = clampAttackTempoScale(value);
  return scale >= READABLE_TEMPO_SCALE_BOUNDS.min && scale <= READABLE_TEMPO_SCALE_BOUNDS.max;
}
