import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { aplicarEfeitosSoftPower, candidatarJogosMundiais, getSoftPowerModifiers, verificarSedeGlobal } from '../src/core/soft_power.js';

test('opens a global games bid every 120 months', () => {
  const state = { ...createGameState('bra'), monthCounter: 120 };
  const result = verificarSedeGlobal(state);

  assert.equal(result.pendingGlobalBid.status, 'pending');
});

test('a successful global games bid funds tourism and locks ONU reputation', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    monthCounter: 120,
    randomSeed: 1,
    economy: { ...state.economy, gdp: 100_000_000_000_000, cash: 100_000_000_000 },
    geopolitics: { ...state.geopolitics, onuScore: 100 },
    pendingGlobalBid: { status: 'pending' },
  };

  const result = candidatarJogosMundiais(prepared);

  assert.equal(result.host_global_event, true);
  assert.equal(result.economy.cash, 50_000_000_000);
  assert.equal(result.onuReputationLockedUntil, 156);
});

test('active games preserve a 50 percent tourism revenue modifier and the ONU lock', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    monthCounter: 130,
    host_global_event: true,
    globalEventTourismUntil: 132,
    onuReputationLockedUntil: 156,
    geopolitics: { ...state.geopolitics, onuScore: 40 },
  };

  const result = aplicarEfeitosSoftPower(prepared);

  assert.equal(result.geopolitics.onuScore, 100);
  assert.equal(getSoftPowerModifiers(prepared).cashRevenueModifier, 0.5);
});
