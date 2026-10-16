import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, dispensarHistoria } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';
import { renderStoryCard, resolveStoryCardAction } from '../src/ui/dashboard.js';

function pendingDilemma() {
  return {
    ...transicionarParaWasteland(createGameState('bra')),
    pendingBunkerEvent: { id: 'ration-emergency' },
  };
}

test('renders Wasteland decisions inside the shared story dialog', () => {
  const markup = renderStoryCard(pendingDilemma());

  assert.match(markup, /class="story-dialog"/);
  assert.match(markup, /A Ração de Emergência/);
  assert.match(markup, /data-option="support-scientists"/);
  assert.match(markup, /data-option="refuse-ration-cuts"/);
  assert.doesNotMatch(markup, /bunker-event-dialog|resolve-bunker-event/);
});

test('keeps the legacy story dismissal button', () => {
  const markup = renderStoryCard({ pendingStory: true, currentStory: 'first_nuke' });

  assert.match(markup, /data-action="dismiss-story"/);
});

test('shows and dismisses a legacy story before the queued Wasteland dilemma', () => {
  const state = {
    ...pendingDilemma(),
    pendingStory: true,
    currentStory: 'first_nuke',
  };
  const storyMarkup = renderStoryCard(state);

  assert.match(storyMarkup, /O NASCIMENTO DE UM DEUS/);
  assert.doesNotMatch(storyMarkup, /A Ração de Emergência/);
  assert.match(storyMarkup, /data-action="dismiss-story"/);

  const dismissed = resolveStoryCardAction(state, 'dismiss-story');

  assert.equal(dismissed.pendingStory, false);
  assert.deepEqual(dismissed.pendingBunkerEvent, { id: 'ration-emergency' });
  assert.match(renderStoryCard(dismissed), /A Ração de Emergência/);
});

test('routes a shared-card choice to the pending Wasteland event', () => {
  const state = pendingDilemma();

  const result = resolveStoryCardAction(state, 'resolve-story-card', 'support-scientists');

  assert.equal(result.pendingBunkerEvent, null);
  assert.equal(result.shelter_supplies.food, state.shelter_supplies.food + 200);
});

test('preserves the existing story dismissal path', () => {
  const state = { ...createGameState('bra'), pendingStory: true, currentStory: 'first_nuke' };

  assert.deepEqual(resolveStoryCardAction(state, 'dismiss-story'), dispensarHistoria(state));
});

test('ignores unrelated shared-card actions without changing the pending dilemma', () => {
  const state = pendingDilemma();

  const result = resolveStoryCardAction(state, 'unrelated-action', 'support-scientists');

  assert.equal(result, state);
  assert.deepEqual(result.pendingBunkerEvent, { id: 'ration-emergency' });
});
