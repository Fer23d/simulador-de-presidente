import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUDGET,
  advanceEconomy,
  clampTaxRate,
  projectBudget,
} from '../src/core/economy.js';

const economy = {
  gdp: 2_000_000_000_000,
  inflation: 0.05,
  unemployment: 0.08,
  popularity: 55,
  cash: 150_000_000_000,
};

test('projects more revenue with a higher income tax', () => {
  const low = projectBudget(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.1 });
  const high = projectBudget(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.2 });

  assert.ok(high.revenue > low.revenue);
});

test('keeps tax rates inside the configured range', () => {
  assert.equal(clampTaxRate(-1), 0);
  assert.equal(clampTaxRate(2), 0.6);
});

test('advances cash by the projected monthly balance', () => {
  const result = advanceEconomy(economy, DEFAULT_BUDGET, {});

  assert.equal(result.cash, economy.cash + result.monthlyBalance);
});

test('keeps bounded indicators after a monthly update', () => {
  const result = advanceEconomy(economy, DEFAULT_BUDGET, {});

  assert.ok(result.inflation >= 0 && result.inflation <= 0.8);
  assert.ok(result.unemployment >= 0.02 && result.unemployment <= 0.45);
  assert.ok(result.popularity >= 0 && result.popularity <= 100);
});
