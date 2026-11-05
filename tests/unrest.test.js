import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceUnrest, createRegime, evaluateRegime, unrestStageMessage } from '../src/core/military.js';
import { createGameState } from '../src/core/game-state.js';

const calm = { inflation: 0.04, unemployment: 0.06, cash: 1_000, gdp: 1_000_000, fiscalHole: 0 };

test('economia saudavel acalma a tensao social', () => {
  assert.equal(advanceUnrest(10, calm, { trabalhadores: 70 }), 8);
  assert.equal(advanceUnrest(0, calm, { trabalhadores: 70 }), 0);
});

test('inflacao alta, desemprego e povo descontente elevam a tensao', () => {
  const bad = { ...calm, inflation: 0.2, unemployment: 0.2, cash: -5 };
  assert.ok(advanceUnrest(0, bad, { trabalhadores: 30 }) > 8);
});

test('caixa negativo sozinho nao revolta um povo satisfeito', () => {
  assert.equal(advanceUnrest(5, { ...calm, cash: -1_000 }, { trabalhadores: 90 }), 3);
});

test('avisos nas faixas de tensao', () => {
  assert.match(unrestStageMessage(25, 31), /Protestos/);
  assert.match(unrestStageMessage(55, 61), /crise política/);
  assert.match(unrestStageMessage(75, 85), /golpe/);
  assert.match(unrestStageMessage(35, 20), /acalmaram/);
  assert.equal(unrestStageMessage(10, 20), null);
});

test('tensao no limite abre risco de golpe, mas abaixo de 80 nao', () => {
  const military = { support: 50 };
  const geopolitics = { contacts: [] };
  const factions = { militares: 60, trabalhadores: 40 };
  const safe = evaluateRegime({ ...createRegime(), unrest: 79 }, calm, military, geopolitics, 1, factions);
  assert.equal(safe.regime.coupRisk, 0);
  const risky = evaluateRegime({ ...createRegime(), unrest: 95 }, calm, military, geopolitics, 1, factions);
  assert.ok(risky.regime.coupRisk > 0.1);
});

test('jogo novo comeca sem tensao e a tela a mostra', () => {
  assert.equal(createGameState().regime.unrest, 0);
});
