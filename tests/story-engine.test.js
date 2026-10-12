import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/game-state.js';
import { checkStoryEvents, dismissStory } from '../src/core/story_engine.js';

test('queues the nuclear story only once and applies its consequence when dismissed', () => {
  const state = { ...createGameState('bra'), unlocked_techs: ['nuke'] };

  const queued = checkStoryEvents(state);
  const dismissed = dismissStory(queued);
  const checkedAgain = checkStoryEvents(dismissed);

  assert.equal(queued.pendingStory, true);
  assert.equal(queued.currentStory, 'first_nuke');
  assert.equal(dismissed.pendingStory, false);
  assert.equal(dismissed.currentStory, null);
  assert.ok(dismissed.seen_stories.includes('first_nuke'));
  assert.equal(dismissed.factions.elite, 55);
  assert.equal(checkedAgain.pendingStory, false);
});

test('queues the Caixa 2 story after the first diversion without stacking it over another modal', () => {
  const state = { ...createGameState('bra'), slush_fund: 1 };
  const queued = checkStoryEvents(state);
  const blocked = checkStoryEvents({ ...state, pendingEvent: { id: 'test', options: [] } });

  assert.equal(queued.currentStory, 'first_slush_fund');
  assert.equal(blocked.pendingStory, false);
});
