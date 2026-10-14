import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState } from '../src/core/game-state.js';
import {
  automatizarIndustria,
  buildInternalProject,
  calculateInternalMaintenance,
  processarAutomacaoIndustrial,
  processarProjetosInternos,
} from '../src/core/infrastructure.js';

test('creates the internal development ledgers with safe defaults', () => {
  const state = createGameState('bra');

  assert.deepEqual(state.infrastructure, { roads: 0, railways: 0, airports: 0 });
  assert.deepEqual(state.health, { hospitals: 0, clinics: 0 });
  assert.deepEqual(state.industry, { factories: 0, power_plants: 0 });
  assert.equal(state.environment_health, 100);
  assert.equal(state.internal_maintenance_cost, 0);
});

test('builds a road, charges its construction cost, and reports maintenance', () => {
  const state = createGameState('bra');
  const prepared = { ...state, economy: { ...state.economy, cash: 10_000_000_000 } };

  const result = buildInternalProject(prepared, 'roads');

  assert.equal(result.infrastructure.roads, 1);
  assert.equal(result.economy.cash, 5_000_000_000);
  assert.equal(calculateInternalMaintenance(result), 50_000_000);
});

test('industrial projects lower environmental health and can trigger an ecological disaster', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    industry: { ...state.industry, factories: 31 },
    environment_health: 40,
    randomSeed: 1_972,
    economy: { ...state.economy, gdp: 1_000_000_000_000 },
  };

  const result = processarProjetosInternos(prepared);

  assert.equal(result.environment_health, 0);
  assert.equal(result.ecologicalDisaster, true);
  assert.ok(result.economy.gdp < prepared.economy.gdp);
});

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
