import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState } from '../src/core/game-state.js';
import { automatizarIndustria, processarAutomacaoIndustrial } from '../src/core/infrastructure.js';

test('industrial automation spends cash and research points only once', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 300_000_000_000 },
    technology: { ...state.technology, points: 500 },
  };

  const result = automatizarIndustria(prepared);

  assert.equal(result.country.industry_automated, true);
  assert.equal(result.economy.cash, 100_000_000_000);
  assert.equal(result.technology.points, 250);
  assert.equal(automatizarIndustria(result).economy.cash, result.economy.cash);
});

test('automation triples monthly steel production and lowers worker support', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    country: { ...state.country, steel: 1_000, industry_automated: true },
    factions: { ...state.factions, trabalhadores: 70 },
  };

  const result = processarAutomacaoIndustrial(prepared);

  assert.equal(result.country.steel, 4_000);
  assert.equal(result.factions.trabalhadores, 65);
});

test('the monthly engine applies the automation steel output and worker debuff', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    country: { ...state.country, steel: 1_000, industry_automated: true },
    factions: { ...state.factions, trabalhadores: 100 },
    randomSeed: 1,
  };

  const result = advanceMonth(prepared);

  assert.ok(result.country.steel >= 4_000);
  assert.ok(result.factions.trabalhadores <= 95);
});
