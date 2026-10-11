import test from 'node:test';
import assert from 'node:assert/strict';

import { createGeopolitics } from '../src/core/geopolitics.js';
import {
  advanceMilitary,
  applyNuclearCompletion,
  canAutogolpe,
  createMilitary,
  evaluateRegime,
  fundNuclearProject,
} from '../src/core/military.js';

const country = { populacao_base: 210_000_000, pib_base: 2_000_000_000_000 };
const economy = {
  gdp: 2_000_000_000_000,
  cash: 150_000_000_000,
  popularity: 55,
  inflation: 0.05,
  unemployment: 0.08,
};

test('raises military power after a month of defense investment', () => {
  const initial = createMilitary(country);
  const updated = advanceMilitary(initial, economy, { defenseSpend: 0.08 }, {});

  assert.ok(updated.military.power > initial.power);
});

test('funds a civil nuclear project only when the treasury can cover it', () => {
  const initial = createMilitary(country);
  const rejected = fundNuclearProject(initial, { ...economy, cash: 0 }, 'civil', 5_000_000_000);
  const funded = fundNuclearProject(initial, economy, 'civil', 5_000_000_000);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.military, initial);
  assert.ok(funded.military.nuclear.civilProgress > initial.nuclear.civilProgress);
  assert.equal(funded.economy.cash, economy.cash - 5_000_000_000);
});

test('applies military nuclear sanctions only once', () => {
  const completed = {
    ...createMilitary(country),
    nuclear: {
      civilProgress: 0,
      militaryProgress: 100,
      civilOnline: false,
      bombBuilt: true,
      diplomaticPenaltyApplied: false,
    },
  };
  const first = applyNuclearCompletion(createGeopolitics(), completed);
  const second = applyNuclearCompletion(first.geopolitics, first.military);

  assert.ok(first.geopolitics.sanctionSeverity > 0);
  assert.equal(second.geopolitics.sanctionSeverity, first.geopolitics.sanctionSeverity);
});

test('permits autogolpe only with strong support and defense', () => {
  assert.equal(canAutogolpe({ type: 'democracy' }, { support: 85 }, { defenseSpend: 0.06 }), true);
  assert.equal(canAutogolpe({ type: 'democracy' }, { support: 84 }, { defenseSpend: 0.06 }), false);
});

test('marks a dictatorship as game over when a forced revolution roll succeeds', () => {
  const result = evaluateRegime(
    { type: 'dictatorship', gameOver: false, outcome: null },
    { ...economy, popularity: 0, inflation: 0.8, unemployment: 0.45 },
    { support: 0 },
    { contacts: [], sanctionSeverity: 1 },
    0,
  );

  assert.equal(result.regime.gameOver, true);
  assert.equal(result.regime.outcome, 'revolucao-popular');
});
