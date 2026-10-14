import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/game-state.js';
import { checkStoryChapters, LORE_CHAPTERS } from '../src/core/story_lore.js';
import { storyModeView } from '../src/ui/dashboard.js';

test('starts the Story Mode with the Origin chapter', () => {
  const state = createGameState('bra');

  assert.deepEqual(state.unlocked_chapters, ['cap_1_origem']);
  assert.equal(LORE_CHAPTERS.cap_1_origem.title, 'CAPÍTULO I: A Herança das Cinzas');
});

test('unlocks corruption, war, empire and wasteland chapters exactly once', () => {
  const base = createGameState('bra');
  const marked = checkStoryChapters({
    ...base,
    slush_fund: 1,
    government: 'empire',
    is_wasteland: true,
    history_log: [{ type: 'guerra', text: 'A guerra começou.' }],
  });

  assert.deepEqual(marked.unlocked_chapters, [
    'cap_1_origem',
    'cap_2_corrupcao',
    'cap_3_guerra',
    'cap_4_imperio',
    'cap_5_wasteland',
  ]);
  assert.equal(marked.story_notice, '[ NOVO CAPÍTULO ADICIONADO AO MODO HISTÓRIA ]');

  const unchanged = checkStoryChapters(marked);
  assert.deepEqual(unchanged.unlocked_chapters, marked.unlocked_chapters);
  assert.equal(unchanged, marked);
});

test('renders the unlocked chapters as a personal dossier', () => {
  const state = {
    ...createGameState('bra'),
    unlocked_chapters: ['cap_1_origem', 'cap_2_corrupcao'],
  };
  const markup = storyModeView(state);

  assert.match(markup, /&gt; MODO HISTÓRIA/);
  assert.match(markup, /A Herança das Cinzas/);
  assert.match(markup, /O Preço do Poder/);
  assert.match(markup, /story-book/);
  assert.match(markup, /story-chapter-text/);
});
