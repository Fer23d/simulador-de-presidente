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
  comprarEquipamento,
  comprarBlindados,
  comprarCacas,
  comprarNavios,
  getPoderTotal,
  recrutarSoldado,
} from '../src/core/military.js';

const country = { populacao_base: 210_000_000, pib_base: 2_000_000_000_000, steel: 1_000_000, uranium: 10_000 };
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
  const rejected = fundNuclearProject(initial, { ...economy, cash: 0 }, 'civil', 5_000_000_000, country);
  const funded = fundNuclearProject(initial, economy, 'civil', 5_000_000_000, country);

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

test('permits autogolpe only with military support and a strong land force', () => {
  const strongArmy = { support: 61, exercito: { soldados: 200_000, blindados: 25 } };
  assert.equal(canAutogolpe({ type: 'democracy' }, strongArmy), true);
  assert.equal(canAutogolpe({ type: 'democracy' }, { ...strongArmy, support: 60 }), false);
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

test('recruits soldiers and purchases equipment when treasury can pay', () => {
  const initial = createMilitary(country);
  const recruited = recrutarSoldado(initial, economy, 10_000, country);
  const equipped = comprarEquipamento(recruited.military, recruited.economy, 'tanks', recruited.resources);

  assert.ok(recruited.military.soldiers > initial.soldiers);
  assert.ok(equipped.military.equipmentMultiplier > recruited.military.equipmentMultiplier);
  assert.equal(equipped.economy.cash, economy.cash - 120_000_000 - 4_000_000_000);
});

test('leaves state untouched when a military purchase cannot be funded', () => {
  const initial = createMilitary(country);
  const result = comprarEquipamento(initial, { ...economy, cash: 1 }, 'jets', country);

  assert.equal(result.ok, false);
  assert.equal(result.military, initial);
  assert.equal(result.economy.cash, 1);
});

test('manages army, navy and air force as separate military branches', () => {
  const initial = createMilitary(country);
  const withTanks = comprarBlindados(initial, economy, 2, country);
  const withShips = comprarNavios(withTanks.military, withTanks.economy, 1, withTanks.resources);
  const withJets = comprarCacas(withShips.military, withShips.economy, 2, withShips.resources);

  assert.equal(withTanks.military.exercito.blindados, initial.exercito.blindados + 2);
  assert.equal(withShips.military.marinha.navios, initial.marinha.navios + 1);
  assert.equal(withJets.military.aeronautica.cacas, initial.aeronautica.cacas + 2);
  assert.ok(getPoderTotal(withJets.military) > getPoderTotal(initial));
});
