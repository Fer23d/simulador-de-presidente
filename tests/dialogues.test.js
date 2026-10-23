import test from 'node:test';
import assert from 'node:assert/strict';
import { DIALOGUES, chooseDialogueLine, applyDialoguePacification } from '../src/core/dialogues.js';
import { DIALOGUE_CHAR_INTERVAL_MS, renderDialogueView } from '../src/ui/dialogue_renderer.js';

test('dialogue typewriter reveals characters at a comfortable 15 to 20ms interval', () => {
  assert.ok(DIALOGUE_CHAR_INTERVAL_MS >= 15 && DIALOGUE_CHAR_INTERVAL_MS <= 20);
});

test('dialogue catalog covers bunker professions and uses worker dialogue as the resident fallback', () => {
  for (const role of ['medic', 'doctor', 'engineer', 'guard', 'soldier', 'resident', 'worker']) {
    assert.ok(chooseDialogueLine({ role }, () => 0));
  }
  assert.equal(DIALOGUES.doctor.length >= 3, true);
  assert.equal(DIALOGUES.engineer.length >= 3, true);
  assert.equal(DIALOGUES.soldier.length >= 3, true);
  assert.equal(DIALOGUES.worker.length >= 3, true);
});

test('first conversation each bunker day raises loyalty and lowers revolt chance by fifteen points', () => {
  const state = { currentDay: 4, inhabitants: [{ id: 'medic-1', role: 'medic', loyalty: 40, revoltChance: 20, lastTalkedDay: 0 }] };
  const result = applyDialoguePacification(state, 'medic-1');
  const npc = result.state.inhabitants[0];

  assert.equal(result.pacified, true);
  assert.equal(npc.loyalty, 55);
  assert.equal(npc.revoltChance, 5);
  assert.equal(npc.lastTalkedDay, 4);
  assert.equal(npc.rebellionCheckDone, false);
});

test('same-day conversations remain narrative only and do not stack pacification', () => {
  const npc = { id: 'worker-1', role: 'resident', loyalty: 55, revoltChance: 5, lastTalkedDay: 4 };
  const state = { currentDay: 4, inhabitants: [npc] };
  const result = applyDialoguePacification(state, npc.id);

  assert.equal(result.pacified, false);
  assert.equal(result.state, state);
  assert.equal(result.state.inhabitants[0].loyalty, 55);
  assert.equal(result.state.inhabitants[0].revoltChance, 5);
});

test('dialogue box escapes NPC names and exposes a typewriter text region and portrait', () => {
  const markup = renderDialogueView({ id: 'engineer-1', name: '<Técnico>', role: 'engineer' }, 'O gerador está estável.');
  assert.match(markup, /&lt;Técnico&gt;/);
  assert.match(markup, /data-dialogue-text/);
  assert.match(markup, /dialogue-portrait--engineer/);
  assert.match(markup, /data-action="close-dialogue"/);
});
