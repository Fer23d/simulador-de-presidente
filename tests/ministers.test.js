import test from 'node:test';
import assert from 'node:assert/strict';

import { createMinisters, dismissMinister, getMinisterModifiers, hireMinister } from '../src/core/ministers.js';

test('hires an economy minister and applies the tax revenue bonus', () => {
  const economy = { cash: 10_000_000_000, popularity: 50 };
  const hired = hireMinister(createMinisters(), economy, 'economy');

  assert.equal(hired.ok, true);
  assert.equal(hired.ministers.economy.id, 'economy');
  assert.equal(getMinisterModifiers(hired.ministers).taxRevenueModifier, 0.05);
  assert.ok(hired.economy.cash < economy.cash);
});

test('dismisses a minister for an immediate popularity boost', () => {
  const ministers = { economy: { id: 'economy' }, defense: null };
  const result = dismissMinister(ministers, { cash: 1, popularity: 42 }, 'economy');

  assert.equal(result.ministers.economy, null);
  assert.ok(result.economy.popularity > 42);
});
