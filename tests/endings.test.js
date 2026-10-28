import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseEnding, createTrophies, DOOR_OPENS_AT_MONTH, ENDINGS, getEndingOptions, getEndingStory, getForcedEnding,
  isDoorOpen, recordTrophy,
} from '../src/core/endings.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { doorView } from '../src/ui/dashboard.js';

function vault(overrides = {}) {
  const base = transicionarParaWasteland(createGameState('bra'), 'ataque-nuclear-inimigo');
  return { ...base, president_selection_pending: false, presidentClass: 'doctor', wasteland_turn: DOOR_OPENS_AT_MONTH,
    inhabitants: base.inhabitants.map((npc) => ({ ...npc, loyalty: 80 })), ...overrides };
}

test('the door opens after three years and blocks further months until an ending is chosen', () => {
  assert.equal(isDoorOpen(vault({ wasteland_turn: DOOR_OPENS_AT_MONTH - 1 })), false);
  const state = vault();
  assert.equal(isDoorOpen(state), true);
  const blocked = advanceWastelandMonth(state);
  assert.equal(blocked.wasteland_turn, state.wasteland_turn);
  assert.match(blocked.notice, /Decida o destino do Vault/);
  assert.match(doorView(state), /A PORTA/);
});

test('each ending checks its requirement and the secret one needs clean hands', () => {
  const options = Object.fromEntries(getEndingOptions(vault()).map((option) => [option.id, option]));
  assert.equal(options.republic.available, true);
  assert.equal(options.empire.available, false);
  assert.equal(options.sealed.available, true);
  assert.equal(options.encounter.available, false);
  assert.equal(options.last_office.available, true);
  assert.equal(getEndingOptions(vault({ slush_fund: 10 })).some((option) => option.id === 'last_office'), false);
  assert.equal(getEndingOptions(vault({ wasteland_reason: 'ataque-nuclear' })).some((option) => option.id === 'last_office'), false);
  assert.equal(getEndingOptions(vault({ shelter_guards: 3 })).find((option) => option.id === 'empire').available, true);
  const prisoners = vault({ inhabitants: vault().inhabitants.map((npc, index) => ({ ...npc, is_prisoner: index === 0 })) });
  assert.equal(getEndingOptions(prisoners).find((option) => option.id === 'republic').available, false);
  assert.equal(chooseEnding(vault(), 'empire').ending, null);
});

test('a colony without loyalty forces the exile ending', () => {
  const angry = vault({ inhabitants: vault().inhabitants.map((npc) => ({ ...npc, loyalty: 10 })) });
  assert.equal(getForcedEnding(angry).id, 'exile');
  assert.equal(chooseEnding(angry, 'sealed').ending, null);
  assert.equal(chooseEnding(angry, 'exile').ending.id, 'exile');
  assert.match(doorView(angry), /OUVIR A ASSEMBLEIA/);
});

test('choosing an ending tells the epilogue, survives the save and becomes a trophy', () => {
  const ended = chooseEnding(vault(), 'republic');
  assert.deepEqual(ended.ending, { id: 'republic', month: DOOR_OPENS_AT_MONTH });
  assert.match(getEndingStory(ended, 'republic'), /Beatriz Okafor/);
  const epilogue = doorView(ended, recordTrophy(createTrophies(), 'republic'));
  assert.match(epilogue, /A NOVA REPÚBLICA/);
  assert.match(epilogue, /FINAIS DESCOBERTOS · 1\/6/);
  assert.match(epilogue, /ending-new-game/);
  const restored = hydrateGameState(JSON.stringify(ended));
  assert.deepEqual(restored.ending, ended.ending);
  assert.equal(restored.wasteland_reason, 'ataque-nuclear-inimigo');
  assert.equal(isDoorOpen(restored), false);
  assert.deepEqual(recordTrophy(recordTrophy(createTrophies(), 'republic'), 'republic').endings, ['republic']);
  assert.equal(Object.keys(ENDINGS).length, 6);
});
