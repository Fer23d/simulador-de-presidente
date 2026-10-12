import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { iniciarProjetoMaoMorta, interceptarGameOverComMaoMorta, processarMegaprojetos } from '../src/core/megaprojects.js';

test('Dead Hand charges once and completes after twelve project ticks', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 1_000_000_000_000 },
    country: { ...state.country, uranium: 250 },
    technology: { ...state.technology, points: 1_000 },
    unlocked_techs: ['dead_hand'],
  };
  const started = iniciarProjetoMaoMorta(prepared);
  const completed = Array.from({ length: 12 }).reduce((next) => processarMegaprojetos(next), started);

  assert.equal(started.economy.cash, 0);
  assert.equal(started.country.uranium, 0);
  assert.equal(started.megaprojects.deadHand.uraniumReserve, 250);
  assert.equal(started.technology.points, 0);
  assert.equal(started.megaprojects.deadHand.remainingMonths, 12);
  assert.equal(completed.dead_hand_active, true);
  assert.equal(iniciarProjetoMaoMorta(completed).economy, completed.economy);
});

test('does not start Dead Hand without its military technology', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 1_000_000_000_000 },
    country: { ...state.country, uranium: 250 },
    technology: { ...state.technology, points: 1_000 },
  };

  const result = iniciarProjetoMaoMorta(prepared);

  assert.equal(result.economy, prepared.economy);
  assert.equal(result.country, prepared.country);
  assert.match(result.notice, /I.A. M.o Morta/i);
});

test('Dead Hand devastates the player and uranium-funded foreign targets in contact order', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    dead_hand_active: true,
    country: { ...state.country, uranium: 2 },
    regime: { ...state.regime, gameOver: true, outcome: 'golpe-militar' },
  };
  const result = interceptarGameOverComMaoMorta(prepared);
  const [first, second, third] = result.geopolitics.contacts;

  assert.equal(result.dead_hand_triggered, true);
  assert.equal(result.country.wasteland, true);
  assert.equal(result.country.uranium, 0);
  assert.equal(first.wasteland, true);
  assert.equal(second.wasteland, true);
  assert.notEqual(third.wasteland, true);
});

test('a terminal loss stays normal without an active Dead Hand network', () => {
  const state = { ...createGameState('bra'), regime: { ...createGameState('bra').regime, gameOver: true } };
  const result = interceptarGameOverComMaoMorta(state);

  assert.equal(result, state);
});
