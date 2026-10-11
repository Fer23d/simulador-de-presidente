import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceMonth,
  changeTax,
  createGameState,
  hydrateGameState,
  negotiate,
  voteLaborLaw,
} from '../src/core/game-state.js';

test('creates a game state for Brazil', () => {
  assert.equal(createGameState('bra').country.id, 'bra');
});

test('changes only a recognized tax rate within its limits', () => {
  const state = createGameState('bra');
  const updated = changeTax(state, 'incomeTaxRate', 1);

  assert.equal(updated.budget.incomeTaxRate, 0.17);
  assert.equal(changeTax(state, 'other', 1), state);
});

test('falls back to a valid game state for corrupted serialized data', () => {
  assert.equal(hydrateGameState('{invalid').country.id, 'bra');
});

test('advancing a month updates the calendar and records history', () => {
  const state = createGameState('bra');
  const updated = advanceMonth(state);

  assert.equal(updated.calendar.month, 2);
  assert.equal(updated.history.length, 1);
});

test('negotiation returns a message and preserves a valid state', () => {
  const state = createGameState('bra');
  const updated = negotiate(state, 'center');

  assert.equal(typeof updated.notice, 'string');
  assert.ok(updated.economy.cash >= 0);
});

test('labor vote stores its result after approval or rejection', () => {
  const updated = voteLaborLaw(createGameState('bra'));

  assert.equal(updated.laws.laborReform.voteCompleted, true);
  assert.equal(typeof updated.notice, 'string');
});
