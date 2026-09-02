// R23Y.1 — two playtest asks. (1) The fight's log has to be copyable: it already was, from the
// panel button labelled 出刀紀錄 - but the HUD it is shown in is pointer-events:none, so the text
// cannot be selected, and a button named for the player's swings does not read as the fight's log.
// Now the log has a copy button beside it, and both buttons share one text. (2) A blow of 20 made
// a five-blow duel, which testers called too fast; a blow is 10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BODY_HIT_DAMAGE, DUEL_MAX_HEALTH } from '../src/combat/fighter-condition.js';
import { SHIELD_PARRY_LAB_REQUIRED_DOM_IDS } from '../tools/action-studio/shield-parry-r281/lab-dom.js';

test('R23Y.1 a blow costs ten: one cell of the ten-cell bar, ten blows to a kill', () => {
  assert.equal(BODY_HIT_DAMAGE, 10);
  assert.equal(DUEL_MAX_HEALTH / BODY_HIT_DAMAGE, 10);
});

test('R23Y.1 the log has its own copy button in the HUD, and it shares the panel button\'s text', () => {
  assert.ok(SHIELD_PARRY_LAB_REQUIRED_DOM_IDS.includes('copyDuelLog'));
  const ui = readFileSync(new URL('../tools/action-studio/shield-parry-r281/lab-ui.js', import.meta.url), 'utf8');
  // Composition of browser UI, read rather than run: one text, bound to both buttons.
  assert.match(ui, /bindCopyButton\(copyDuelLog, duelLogText\)/);
  const html = readFileSync(new URL('../tools/action-studio/shield-driven-contact-coupling-lab.html', import.meta.url), 'utf8');
  // The HUD swallows no pointer events; the button has to opt back in or it cannot be clicked.
  assert.match(html, /<button id="copyDuelLog" type="button" style="pointer-events:auto[^"]*">複製戰鬥紀錄<\/button>/);
  assert.doesNotMatch(html, /複製出刀紀錄/, 'the panel button is named for the fight, not the player');
});
