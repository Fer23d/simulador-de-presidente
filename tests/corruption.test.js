import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { desviarFundos, isEscapeEligible } from '../src/core/corruption.js';

test('diverts five percent of treasury cash into the slush fund', () => {
  const state = { ...createGameState('bra'), economy: { ...createGameState('bra').economy, cash: 100_000 } };

  const result = desviarFundos(state);

  assert.equal(result.economy.cash, 95_000);
  assert.equal(result.slush_fund, 5_000);
  assert.equal(result.slushFundTransfersThisMonth, 1);
});

test('repeated diversion reduces each present faction without restoring purged ones', () => {
  const state = {
    ...createGameState('bra'),
    economy: { ...createGameState('bra').economy, cash: 100_000 },
    factions: { militares: 50, religiosos: 40 },
    slushFundTransfersThisMonth: 1,
  };

  const result = desviarFundos(state);

  assert.deepEqual(result.factions, { militares: 48, religiosos: 38 });
  assert.equal(Object.hasOwn(result.factions, 'elite'), false);
});

test('treats exactly fifty billion in slush funds as an eligible escape', () => {
  assert.equal(isEscapeEligible({ ...createGameState('bra'), slush_fund: 50_000_000_000 }), true);
  assert.equal(isEscapeEligible({ ...createGameState('bra'), slush_fund: 49_999_999_999 }), false);
});
