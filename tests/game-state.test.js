import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceMonth,
  changeTax,
  createGameState,
  attemptAutogolpe,
  fundNuclear,
  hydrateGameState,
  negotiate,
  proposeTreaty,
  setBudget,
  startWar,
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

test('falls back to a valid game state for structurally corrupted saved arrays', () => {
  const corrupted = JSON.stringify({
    ...createGameState('bra'),
    congress: { blocs: [null] },
    history: [null],
  });
  const hydrated = hydrateGameState(corrupted);

  assert.equal(hydrated.congress.blocs.length, 4);
  assert.deepEqual(hydrated.history, []);
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

test('labor law needs negotiation before it wins a majority in Brazil', () => {
  const state = createGameState('bra');
  const rejected = voteLaborLaw(state);
  const negotiated = negotiate(state, 'center');
  const approved = voteLaborLaw(negotiated);

  assert.equal(rejected.laws.laborReform.approved, false);
  assert.equal(approved.laws.laborReform.approved, true);
});

test('migrates a version 1 save with negative cash intact', () => {
  const legacy = createGameState('bra');
  legacy.version = 1;
  legacy.economy.cash = -500;

  assert.equal(hydrateGameState(JSON.stringify(legacy)).economy.cash, -500);
});

test('blocks progression after a terminal regime outcome', () => {
  const state = {
    ...createGameState('bra'),
    regime: { type: 'democracy', gameOver: true, outcome: 'golpe-militar' },
  };

  assert.deepEqual(advanceMonth(state).calendar, state.calendar);
});

test('updates a spending slider through the state command', () => {
  assert.equal(setBudget(createGameState('bra'), 'defenseSpend', 0.07).budget.defenseSpend, 0.07);
});

test('approves labor law by decree in dictatorship', () => {
  const state = {
    ...createGameState('bra'),
    regime: { type: 'dictatorship', gameOver: false, outcome: null },
  };

  assert.equal(voteLaborLaw(state).laws.laborReform.approved, true);
});

test('integrates diplomatic, nuclear, and war commands', () => {
  const state = createGameState('bra');
  const treaty = proposeTreaty(state, 'arg');
  const war = startWar(state, 'arg');
  const nuclear = fundNuclear(state, 'civil', 5_000_000_000);

  assert.equal(treaty.geopolitics.contacts.find((item) => item.id === 'arg').tradeTreaty, true);
  assert.equal(war.geopolitics.contacts.find((item) => item.id === 'arg').atWar, true);
  assert.ok(nuclear.military.nuclear.civilProgress > 0);
});

test('can change to dictatorship only after the military conditions are met', () => {
  const state = setBudget(createGameState('bra'), 'defenseSpend', 0.06);
  const eligible = { ...state, military: { ...state.military, support: 85 } };

  assert.equal(attemptAutogolpe(eligible).regime.type, 'dictatorship');
});

test('blocks state-changing commands after the game ends', () => {
  const state = { ...createGameState('bra'), regime: { ...createGameState('bra').regime, gameOver: true } };

  assert.equal(startWar(state, 'arg').geopolitics, state.geopolitics);
  assert.equal(setBudget(state, 'defenseSpend', 0.1).budget, state.budget);
});

test('keeps a saved zero spending rate and recovers malformed military data', () => {
  const saved = createGameState('bra');
  saved.budget.defenseSpend = 0;
  saved.military = {};
  const hydrated = hydrateGameState(JSON.stringify(saved));

  assert.equal(hydrated.budget.defenseSpend, 0);
  assert.ok(hydrated.military.nuclear);
});
