import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRoomEconomyProfile,
  getRoomStorageCapacity,
  getRoomUpgradeCost,
} from '../src/core/bunker_economy.js';
import { bunkerView, renderRoomManagement } from '../src/ui/dashboard.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { createGameState } from '../src/core/game-state.js';
import { INITIAL_SHELTER_GRID, normalizeShelterGrid, upgradeShelterRoom } from '../src/core/shelter_engine.js';

function productionState(room, workers = [{ id: 'worker', workFloor: room.floor, workColumn: room.column, loyalty: 100 }]) {
  return { is_wasteland: true, scrap: 5000, country: { populacao_base: 1000 }, shelter_grid: [[null, null, room]], inhabitants: workers };
}

test('generator and greenhouse output follow the five-level production curve', () => {
  const outputs = [1, 2, 3, 4, 5].map((level) => {
    const room = { id: 'producer', type: 'generator', floor: 0, column: 2, level, operational: true };
    return getRoomEconomyProfile(productionState(room), room).production.amount;
  });
  assert.deepEqual(outputs, [100, 250, 400, 550, 700]);

  const greenhouse = { id: 'greenhouse', type: 'greenhouse', floor: 0, column: 2, level: 3 };
  assert.equal(getRoomEconomyProfile(productionState(greenhouse), greenhouse).production.amount, 400);
});
test('only assigned active staff contributes output and low morale halves each worker contribution', () => {
  const room = { id: 'producer', type: 'generator', floor: 0, column: 2, level: 1, operational: true };
  const state = productionState(room, [
    { id: 'worker-a', workFloor: 0, workColumn: 2, loyalty: 100 },
    { id: 'worker-b', workFloor: 0, workColumn: 2, loyalty: 30 },
    { id: 'worker-c', workFloor: 0, workColumn: 2, loyalty: 100, is_on_expedition: true },
  ]);
  const profile = getRoomEconomyProfile(state, room);
  assert.deepEqual(profile.workers, { assigned: 3, active: 2, effective: 1.5, lowMorale: 1 });
  assert.equal(profile.production.amount, 150);

  const empty = getRoomEconomyProfile(productionState(room, []), room);
  assert.equal(empty.production.amount, 0);
});

test('upgrade prices and supported room levels reach level five', () => {
  const room = { id: 'producer', type: 'generator', floor: 0, column: 2, level: 1, operational: true };
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => getRoomUpgradeCost({ ...room, level })), [330, 880, 1650, 2750, null]);

  const grid = normalizeShelterGrid(INITIAL_SHELTER_GRID.map((row) => [...row]));
  grid[0][2] = { ...room, level: 4 };
  const atFour = { is_wasteland: true, scrap: 3000, science: 1500, shelter_grid: grid };
  const upgraded = upgradeShelterRoom(atFour, 0, 2);
  assert.equal(upgraded.shelter_grid[0][2].level, 5);
  assert.equal(upgraded.scrap, 250);
  assert.equal(upgraded.science, 0);
  assert.equal(upgradeShelterRoom(upgraded, 0, 2).shelter_grid[0][2].level, 5);
});

test('resource storage capacity sums the appropriate levelled rooms', () => {
  const grid = normalizeShelterGrid(INITIAL_SHELTER_GRID.map((row) => [...row]));
  grid[0][2] = { type: 'generator', level: 1, operational: true };
  grid[0][3] = { type: 'generator', level: 2, operational: true };
  grid[0][4] = { type: 'greenhouse', level: 3 };
  assert.equal(getRoomStorageCapacity(grid, 'energy'), 1100);
  assert.equal(getRoomStorageCapacity(grid, 'food'), 1100);
});

test('monthly production respects worker output and discards supplies above storage capacity', () => {
  const state = transicionarParaWasteland(createGameState('bra'));
  const grid = normalizeShelterGrid(state.shelter_grid.map((row) => [...row]));
  grid[0][2] = { id: 'generator-0-2', type: 'generator', floor: 0, column: 2, level: 1, operational: true, staffedBy: 'worker-0-2' };
  grid[0][3] = { id: 'generator-0-3', type: 'generator', floor: 0, column: 3, level: 2, operational: true, staffedBy: 'worker-0-3' };
  const inhabitants = [2, 3].map((column) => ({ id: `worker-0-${column}`, workFloor: 0, workColumn: column, loyalty: 100 }));
  const overCapacity = advanceWastelandMonth({
    ...state,
    shelter_grid: grid,
    inhabitants,
    shelter_supplies: { ...state.shelter_supplies, energy: 1090, food: 100 },
  });
  assert.equal(overCapacity.shelter_supplies.energy, 1100);

  const lowMoraleGrid = grid.map((row) => row.map((room) => room?.column === 3 ? { ...room, level: 1 } : room));
  const lowMorale = advanceWastelandMonth({
    ...state,
    shelter_grid: lowMoraleGrid,
    inhabitants: inhabitants.map((npc) => npc.id === 'worker-0-3' ? { ...npc, loyalty: 30 } : npc),
    shelter_supplies: { ...state.shelter_supplies, energy: 0 },
  });
  assert.equal(lowMorale.shelter_supplies.energy, 143);
});

test('room management view shows workers, current and projected production, upgrade cost and max level', () => {
  const room = { id: 'greenhouse', type: 'greenhouse', floor: 0, column: 2, level: 3 };
  const state = { ...productionState(room), scrap: 1000 };
  const markup = renderRoomManagement(state, room);
  assert.match(markup, /Estufa Hidropônica \(NÍVEL 3\)/);
  assert.match(markup, /Produção atual<\/dt><dd>400 comida\/mês/);
  assert.match(markup, /Trabalhadores ativos<\/dt><dd>1 \/ 1/);
  assert.match(markup, /Projeção de melhoria<\/dt><dd>Nível 4: 550 comida\/mês/);
  assert.match(markup, /SUCATA: 1\.650/);
  assert.match(markup, /CIÊNCIA: 500/);
  assert.match(markup, /resource-cost--short/);

  const maxLevelRoom = { ...room, level: 5 };
  assert.match(renderRoomManagement(state, maxLevelRoom), /NÍVEL MÁXIMO ATINGIDO/);
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  grid[0][2] = maxLevelRoom;
  assert.match(bunkerView({ ...state, shelter_grid: grid }), /ENERGIA 0 \/ 200/);
});
