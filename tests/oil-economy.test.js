import test from 'node:test';
import assert from 'node:assert/strict';
import { getGeneratorFuelPlan, getOilSaleOffer, sellOil, toggleGeneratorFuel } from '../src/core/oil_economy.js';
import { getRaidChance } from '../src/core/defense.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';

function vaultState(extra = {}) {
  const base = transicionarParaWasteland(createGameState());
  const grid = base.shelter_grid.map((row) => row.slice());
  grid[1][0] = { type: 'elevator', floor: 1, column: 0, level: 1, operational: true };
  grid[1][1] = { type: 'generator', floor: 1, column: 1, level: 2, operational: true };
  grid[1][2] = { type: 'radio', floor: 1, column: 2, level: 1, operational: true };
  const worker = { id: 'eng-1', name: 'Eng', role: 'engineer', floor: 1, column: 1, workFloor: 1, workColumn: 1, loyalty: 100, currentState: 'idle', needs: { satiety: 100, rest: 100, morale: 100 } };
  return { ...base, inhabitants: [...base.inhabitants, worker], presidentClass: 'worker', president_selection_pending: false, wasteland_cinematic_pending: false,
    wasteland_cinematic_ready: false, shelter_grid: grid, oil: 500, ...extra };
}

test('generator fuel costs 3 barrels per generator level and needs enough oil', () => {
  const state = vaultState();
  assert.deepEqual(getGeneratorFuelPlan(state), { enabled: false, cost: 6, generators: 1, funded: true, active: false, multiplier: 1 });
  const on = toggleGeneratorFuel(state);
  assert.equal(on.generator_fuel, true);
  assert.equal(getGeneratorFuelPlan(on).multiplier, 1.5);
  assert.equal(getGeneratorFuelPlan({ ...on, oil: 5 }).active, false, 'not enough oil: back to normal');
  assert.equal(toggleGeneratorFuel(on).generator_fuel, false);
  assert.equal(toggleGeneratorFuel({ ...state, is_wasteland: false }).generator_fuel, false, 'only works in the Vault');
});

test('a fuelled month burns the oil and produces more energy than a normal one', () => {
  const state = vaultState({ shelter_supplies: { weapons: 0, medkits: 0, food: 200, energy: 0, oxygen: 300 } });
  const normal = advanceWastelandMonth(state, 0);
  const fuelled = advanceWastelandMonth({ ...state, generator_fuel: true }, 0);
  assert.ok(fuelled.shelter_supplies.energy > normal.shelter_supplies.energy, 'more energy with fuel');
  assert.equal(fuelled.oil, 500 - 6);
  assert.equal(normal.oil, 500);
  const dry = advanceWastelandMonth({ ...state, generator_fuel: true, oil: 3 }, 0);
  assert.equal(dry.oil, 3, 'nothing burned without enough oil');
  assert.equal(dry.shelter_supplies.energy, normal.shelter_supplies.energy);
  assert.match(dry.notice, /Sem petróleo para os geradores/);
});

test('selling oil on the radio pays scrap, needs a radio room and calms hostile factions', () => {
  const horde = { id: 'mutant-horde', name: 'Horda Mutante do Norte', relation: 17, militaryPower: 46 };
  const friends = { id: 'scrap-brotherhood', name: 'Irmandade de Sucateiros', relation: 25, militaryPower: 32 };
  const state = vaultState({ scrap: 100, wasteland_turn: 4, geopolitics: { contacts: [horde, friends] },
    oil_derricks: [{ level: 1, collectedAt: 0, upgradeUntil: 0 }, null, null] });
  assert.deepEqual(getOilSaleOffer(horde), { batch: 50, scrap: 69, relationGain: 4 });
  assert.equal(getOilSaleOffer(friends).scrap, 73, 'friends pay a better price');
  assert.ok(getRaidChance(state) > 0, 'a hostile faction can raid');
  const sold = sellOil(state, 'mutant-horde');
  assert.equal(sold.oil, 450);
  assert.equal(sold.scrap, 169);
  assert.equal(sold.geopolitics.contacts[0].relation, 21);
  assert.equal(getRaidChance({ ...sold, geopolitics: { contacts: [sold.geopolitics.contacts[0]] } }), 0, 'trade ended the hostility');
  assert.match(sellOil({ ...state, oil: 10 }, 'mutant-horde').notice, /Venda mínima/);
  assert.match(sellOil({ ...state, shelter_grid: state.shelter_grid.map((row) => row.map((room) => (room?.type === 'radio' ? null : room))) }, 'mutant-horde').notice, /Sala de Rádio/);
  assert.match(sellOil(state, 'nobody').notice, /indisponível/);
});

test('the fuel switch survives saving and loading, and the panels show the new options', async () => {
  const loaded = hydrateGameState(JSON.stringify({ ...vaultState({ generator_fuel: true }), version: createGameState().version }));
  assert.equal(loaded.generator_fuel, true);
  assert.equal(hydrateGameState(JSON.stringify({ ...vaultState(), version: createGameState().version })).generator_fuel, false);
  const { generatorFuelView, oilTradeView } = await import('../src/ui/dashboard.js');
  const state = vaultState({ generator_fuel: true });
  assert.match(generatorFuelView(state), /LIGADO · \+50% ENERGIA/);
  assert.match(generatorFuelView({ ...state, oil: 1 }), /SEM PETRÓLEO/);
  assert.match(generatorFuelView(vaultState()), /DESLIGADO/);
  const trade = oilTradeView({ ...state, geopolitics: { contacts: [{ id: 'mutant-horde', name: 'Horda', relation: -60 }] } });
  assert.match(trade, /data-action="oil-sell" data-contact="mutant-horde"/);
  assert.match(trade, /HOSTIL: vender acalma os ataques/);
  assert.match(oilTradeView({ ...state, oil: 10, geopolitics: { contacts: [{ id: 'x', name: 'X', relation: 50 }] } }), /disabled/);
});
