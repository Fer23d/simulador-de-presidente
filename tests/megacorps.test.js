import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, voteLaw } from '../src/core/game-state.js';
import { estatizarMegacorporacoes, getMegacorpModifiers, processarMegacorporacoes } from '../src/core/megacorps.js';

test('active privatization and deregulation grow corporate power and tax revenue', () => {
  const state = createGameState('bra');
  const prepared = { ...state, activeLawIds: ['privatization', 'deregulation'] };
  const result = processarMegacorporacoes(prepared);

  assert.equal(result.megacorp_power, 6);
  assert.equal(getMegacorpModifiers(result.megacorp_power).taxRevenueModifier, 0.2);
});

test('corporate lobby automatically blocks environmental and wealth tax laws above eighty power', () => {
  const state = createGameState('bra');
  const result = voteLaw({ ...state, megacorp_power: 81 }, 'environmental-protection');

  assert.equal(result.laws.environmentalProtection.voteCompleted, true);
  assert.match(result.notice, /lobby das Megacorporacoes/);
});

test('nationalization resets corporate power but can trigger an elite coup', () => {
  const state = createGameState('bra');
  const result = estatizarMegacorporacoes({ ...state, megacorp_power: 90, randomSeed: 1 });

  assert.equal(result.megacorp_power, 0);
  assert.equal(result.regime.gameOver, true);
});
