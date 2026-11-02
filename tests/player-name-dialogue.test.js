import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeaderName, updatePlayerProfile } from '../src/core/player_profile.js';
import { addressPlayer, chooseDialogueLine } from '../src/core/dialogues.js';
import { getEndingStory } from '../src/core/endings.js';
import { getIntroScenes } from '../src/core/intro_story.js';
import { getCityEpilogue } from '../src/core/city.js';
import { createGameState } from '../src/core/game-state.js';
import { renderDialogueView } from '../src/ui/dialogue_renderer.js';

const named = (name, extra = {}) => updatePlayerProfile({ ...createGameState(), presidentClass: 'worker', ...extra }, { name });

test('the profile name replaces the class leader in stories, and the leader stays as the fallback', () => {
  assert.equal(getLeaderName(named('Fernanda')), 'Fernanda');
  assert.equal(getLeaderName(named('')), 'Joaquim "Quim" Barreto');
  const withName = named('Fernanda', { ending: { id: 'republic', month: 40 } });
  assert.match(getEndingStory(withName, 'republic'), /Fernanda subiu por último/);
  assert.doesNotMatch(getEndingStory(withName, 'republic'), /Quim/);
  assert.match(getEndingStory(named('', {}), 'republic'), /Quim/);
  const intro = getIntroScenes(named('Fernanda')).map((scene) => scene.text).join(' ');
  assert.match(intro, /Fernanda/);
  assert.doesNotMatch(intro, /Quim/);
});

test('the city epilogue also uses the profile name', () => {
  const state = { ...named('Fernanda'), city: { origin: 'republic', result: { outcome: 'struggle' } } };
  const epilogue = getCityEpilogue(state);
  assert.doesNotMatch(epilogue.story, /\{leader\}/);
});

test('residents call the player by the profile name instead of Presidente or Senhor', () => {
  assert.equal(addressPlayer('Área segura, Presidente. Tudo bem.', 'Fernanda'), 'Área segura, Fernanda. Tudo bem.');
  assert.equal(addressPlayer('Está controlada, Senhor.', 'Fernanda'), 'Está controlada, Fernanda.');
  assert.equal(addressPlayer('Área segura, Presidente.', ''), 'Área segura, Presidente.');
  const soldier = { role: 'soldier' };
  const line = chooseDialogueLine(soldier, () => 0, 'Fernanda');
  assert.match(line, /Fernanda/);
  assert.doesNotMatch(line, /Presidente/);
  const doctor = chooseDialogueLine({ role: 'doctor' }, () => 0, 'Fernanda');
  assert.match(doctor, /Fernanda/);
});

test('the dialogue box shows who the player is', () => {
  assert.match(renderDialogueView({ role: 'guard', name: 'Rui' }, '', 'Fernanda'), /CANAL PESSOAL · FERNANDA/);
  assert.match(renderDialogueView({ role: 'guard', name: 'Rui' }), /CANAL PESSOAL \/\/\//);
  assert.match(renderDialogueView({ role: 'guard', name: 'Rui' }, '', '<b>x</b>'), /&lt;B&gt;X&lt;\/B&gt;/);
});
