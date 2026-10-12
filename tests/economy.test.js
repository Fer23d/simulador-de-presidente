import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUDGET,
  advanceEconomy,
  setBudgetRate,
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

test('sets defense spending inside its configured range', () => {
  assert.equal(setBudgetRate(DEFAULT_BUDGET, 'defenseSpend', 0.2).defenseSpend, 0.15);
});

test('includes defense spending in monthly expenses', () => {
  const base = projectBudget(economy, { ...DEFAULT_BUDGET, defenseSpend: 0 });
  const armed = projectBudget(economy, { ...DEFAULT_BUDGET, defenseSpend: 0.06 });

  assert.ok(armed.expenses > base.expenses);
});

test('advances cash by the projected monthly balance', () => {
  const result = advanceEconomy(economy, DEFAULT_BUDGET, {});

  assert.equal(result.cash, economy.cash + result.monthlyBalance);
});

test('keeps bounded indicators after a monthly update', () => {
  const result = advanceEconomy(economy, DEFAULT_BUDGET, {});

  assert.ok(result.inflation >= 0 && result.inflation <= 0.8);
  assert.ok(result.unemployment >= 0.02 && result.unemployment <= 0.45);
  assert.equal(Object.hasOwn(result, 'popularity'), false);
});

test('applies high-tax and civil-energy modifiers during an economic month', () => {
  const lowTax = advanceEconomy(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.1 });
  const highTax = advanceEconomy(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.55 });
  const baseProjection = projectBudget(economy, DEFAULT_BUDGET);
  const energyProjection = projectBudget(economy, DEFAULT_BUDGET, { infrastructureCostModifier: -0.1 });

  assert.ok(highTax.gdp < lowTax.gdp);
  assert.ok(energyProjection.expenses < baseProjection.expenses);
});
