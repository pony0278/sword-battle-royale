// R24J.1 - the left thumb steers and names the direction; the right thumb acts (#40).
//
// Measured on the build before this one, from a person's phone log of 52 exchanges: the player
// blocked ZERO of nine opponent swings and 45% of their attack presses did nothing, with nothing
// on screen to say why. The cause was the layout - seven 50px buttons in one 180px pad under a
// single thumb, movement on the right hand, aiming on the left, and a shield that must be held by
// the same thumb that taps the sword. Measured on four phone sizes: the fighters occupy x 266-604
// of 844, both bottom corners are free, a 45mm thumb arc reaches 259px, and CSS px per mm varies
// only 5.65-5.90, so fixed pixel offsets are physically the same everywhere.
//
// Measured for the input itself: a direction set before the press is readable on the very frame of
// the press - zero frames - where a swipe would have spent 30-60ms of a 120ms parry window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUCH_STICK_PROFILE, planTouchStick } from '../src/game/touch-stick.js';
import { SHIELD_PARRY_LAB_REQUIRED_DOM_IDS } from '../tools/action-studio/shield-parry-r281/lab-dom.js';

const at = (x, y) => planTouchStick({ originX: 0, originY: 0, pointerX: x, pointerY: y });
const html = () => readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');

test('R24J.1 the stick walks before it names, so closing the distance cannot restate the stance', () => {
  assert.ok(TOUCH_STICK_PROFILE.aimDeadZonePx > TOUCH_STICK_PROFILE.moveDeadZonePx * 2,
    'the naming dead zone is more than twice the walking one, because the sector is sticky');
  const nudge = at(0, -TOUCH_STICK_PROFILE.moveDeadZonePx - 1);
  assert.equal(nudge.walking, true);
  assert.equal(nudge.naming, false, 'walking forward names nothing');
  assert.equal(nudge.aim, null);
  const push = at(0, -TOUCH_STICK_PROFILE.aimDeadZonePx - 1);
  assert.equal(push.naming, true);
  assert.ok(push.aim, 'pushed far enough, the thumb is naming a direction');
  assert.equal(at(0, 0).walking, false, 'a resting thumb does nothing at all');
});

test('R24J.1 the intents carry the keyboard\'s own signs, so one game means one thing', () => {
  // R19V.1: ArrowUp is -1 (forward), ArrowDown +1; ArrowLeft -1, ArrowRight +1.
  assert.equal(at(0, -60).laneIntent, -1, 'up is forward');
  assert.equal(at(0, 60).laneIntent, 1, 'down is back');
  assert.equal(at(-60, 0).lateralIntent, -1);
  assert.equal(at(60, 0).lateralIntent, 1);
  const diagonal = at(50, -50);
  assert.deepEqual([diagonal.laneIntent, diagonal.lateralIntent], [-1, 1], 'two arrows at once, as the keyboard allows');
});

test('R24J.1 a retreat is a retreat: pushing back names no sector', () => {
  const back = at(0, 60);
  assert.equal(back.walking, true);
  assert.equal(back.retreating, true);
  assert.equal(back.naming, false, 'there is no downward sector to mean');
  assert.equal(back.aim, null);
  assert.equal(at(-60, 40).naming, true, 'but a mostly-sideways push still names its side');
});

test('R24J.1 the knob stays on its ring and the aim is offered in the stick\'s own frame', () => {
  const far = at(400, 0);
  assert.ok(Math.abs(far.knob.x - TOUCH_STICK_PROFILE.radiusPx) < 1e-9, 'clamped to the ring');
  assert.equal(far.distancePx, 400, 'while the raw distance is still reported');
  assert.equal(far.aim.offsetX, 400, 'the aim planner gets the true offset');
  assert.equal(far.aim.viewportWidth, TOUCH_STICK_PROFILE.radiusPx * 2, 'in a viewport that IS the stick');
});

test('R24J.1 the dodge reads the same expression the keyboard does', () => {
  assert.equal(at(60, 0).dodgeDirection, 'right');
  assert.equal(at(-60, 0).dodgeDirection, 'left');
  assert.equal(at(0, -60).dodgeDirection, 'forward');
  assert.equal(at(0, 60).dodgeDirection, 'back');
  assert.equal(at(0, 0).dodgeDirection, 'back', 'a resting thumb dodges backwards, as the button always did');
});

test('R24J.1 the page carries the controls, and the old pad steps aside on a touch screen', () => {
  const page = html();
  for (const id of ['touchStickZone', 'touchStick', 'touchStickKnob', 'touchAttack', 'touchGuard', 'touchDodge', 'touchNotice']) {
    assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes(id), id);
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  assert.match(page, /@media \(pointer: coarse\)\{\s*\n\s*#touchPad\{display:none\}/, 'one thumb no longer owns seven buttons');
  // The blade is the big one nearest the corner, as a phone player expects; all three clear the
  // fighters, who end at x 604 of 844 - the guard's own left edge is 844-146-68 = 630.
  assert.match(page, /\.touch-attack\{right:32px;bottom:46px;width:88px;height:88px/);
  assert.match(page, /\.touch-guard\{right:146px;bottom:88px;width:68px;height:68px/);
  assert.match(page, /\.touch-dodge\{right:100px;bottom:172px;width:56px;height:56px/);
});

test('R24J.1 a refused press answers with its reason, and the page has somewhere to say it', () => {
  const entry = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab-r281.js', import.meta.url), 'utf8');
  assert.match(entry, /onAttack: \(\) => \(playerAttack\.start\(\) \? null : playerAttack\.refusal\)/);
  const ui = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  for (const reason of ['the-opponent-is-mid-exchange', 'still-being-struck', 'staggered-or-down', 'already-swinging']) {
    assert.ok(ui.includes(`'${reason}'`), reason);
  }
  // The direction is taken at the press and only while an action is being taken.
  assert.match(ui, /function aimNow\(\) \{\n\s*if \(plan\?\.aim\) handlers\.onAim\?\.\(plan\.aim\);/);
  assert.match(ui, /attack: \(\) => \{ aimNow\(\); const refusal = handlers\.onAttack\?\.\(\);/);
});
