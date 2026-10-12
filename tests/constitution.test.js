import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { promulgarConstituicao, aplicarModificadoresConstitucionais } from '../src/core/constitution.js';
import { getFactionSupport } from '../src/core/factions.js';

test('promulgates a stratocratic constitution with a permanent inflation floor', () => {
  const state = { ...createGameState('bra'), factions: { elite: 50, trabalhadores: 50, militares: 100, religiosos: 50 } };
  const result = promulgarConstituicao(state, 'stratocratic');

  assert.equal(result.regime.constitution, 'stratocratic');
  assert.equal(result.regime.stratocraticInflationFloor, state.economy.inflation * 2);
});

test('technocratic and theocratic constitutions apply their permanent monthly rules', () => {
  const state = createGameState('bra');
  const technocratic = promulgarConstituicao({ ...state, factions: { ...state.factions, elite: 100 } }, 'technocratic');
  const theocratic = promulgarConstituicao({ ...state, factions: { ...state.factions, elite: 100 } }, 'theocratic');
  const technoMonth = aplicarModificadoresConstitucionais(technocratic, { cashBeforeMonth: 1_000, economy: { cash: 1_400, revenue: 500, expenses: 100 }, factions: { elite: 10, trabalhadores: 20, militares: 30, religiosos: 40 }, technology: { points: 20, generated: 10 } });
  const theoMonth = aplicarModificadoresConstitucionais(theocratic, { cashBeforeMonth: 1_000, economy: { cash: 1_400, revenue: 500, expenses: 100 }, factions: { ...state.factions }, technology: { points: 20, generated: 10 } });

  assert.deepEqual(technoMonth.factions, { elite: 50, trabalhadores: 50, militares: 50, religiosos: 50 });
  assert.equal(technoMonth.economy.cash, 1_250);
  assert.equal(theoMonth.technology.generated, 0);
  assert.equal(Object.hasOwn(theoMonth.factions, 'elite'), false);
  assert.equal(Object.hasOwn(theoMonth.factions, 'trabalhadores'), false);
  assert.equal(getFactionSupport(theoMonth.factions), 50);
});
