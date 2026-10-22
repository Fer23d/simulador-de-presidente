import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBunkerOxygenConsumption,
  getLifeSupportEnergyMaintenance,
  getLifeSupportOxygenProduction,
  getRoomEconomyProfile,
  getRoomStorageCapacity,
  getRoomUpgradeCosts,
  getDepthAdjustedScrapCost,
} from '../src/core/bunker_economy.js';
import { buildShelterRoom, getShelterBuildCost, INITIAL_SHELTER_GRID, upgradeShelterRoom } from '../src/core/shelter_engine.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { updatePlayer } from '../src/core/rpg_bunker.js';
import { applyOxygenDeprivationOverlay, renderRoom } from '../src/core/sprite_engine.js';
import { bunkerView, renderRoomManagement } from '../src/ui/dashboard.js';

function makeGrid(rooms = []) {
  const grid = Array.from({ length: 6 }, () => Array(7).fill(null));
  grid[0][0] = { type: 'elevator', floor: 0, column: 0, level: 1 };
  grid[0][1] = { type: 'vault', floor: 0, column: 1, level: 1 };
  for (const room of rooms) grid[room.floor][room.column] = room;
  return grid;
}

test('life support produces and stores 300 oxygen per level through level five', () => {
  const outputs = [1, 2, 3, 4, 5].map((level) => getLifeSupportOxygenProduction(makeGrid([
    { type: 'life_support', floor: 0, column: 2, level },
  ])));
  assert.deepEqual(outputs, [300, 600, 900, 1200, 1500]);

  const grid = makeGrid([
    { type: 'life_support', floor: 0, column: 2, level: 1 },
    { type: 'life_support', floor: 1, column: 2, level: 3 },
  ]);
  assert.equal(getLifeSupportOxygenProduction(grid), 1200);
  assert.equal(getRoomStorageCapacity(grid, 'oxygen'), 1500);
  assert.equal(getLifeSupportEnergyMaintenance(grid), 20);
  const profile = getRoomEconomyProfile({ inhabitants: [], shelter_grid: grid }, grid[0][2]);
  assert.equal(profile.production.amount, 300);
  assert.equal(profile.production.resource, 'oxygen');
  assert.equal(profile.oxygen.energyMaintenance, 5);
});

test('oxygen demand counts the President and present NPCs, with room drain scaled by human floor depth', () => {
  const grid = makeGrid([
    { type: 'greenhouse', floor: 0, column: 2, level: 1 },
    { type: 'laboratory', floor: 3, column: 1, level: 1 },
    { type: 'life_support', floor: 4, column: 1, level: 1 },
  ]);
  const state = { inhabitants: [
    { id: 'resident', is_on_expedition: false },
    { id: 'explorer', is_on_expedition: true },
    { id: 'prisoner', is_prisoner: true, is_on_expedition: false },
  ] };

  // President + resident + prisoner = 15; the greenhouse and lab drain 10 + 40.
  assert.equal(getBunkerOxygenConsumption(state, grid), 65);
});

test('depth-scaled build and upgrade prices round scrap upward but preserve science costs', () => {
  assert.equal(getShelterBuildCost('life_support', 0), 198);
  assert.equal(getShelterBuildCost('life_support', 3), 252);
  assert.equal(getShelterBuildCost('unknown', 0), null);
  assert.equal(getDepthAdjustedScrapCost(1, 2), 2);

  assert.deepEqual(getRoomUpgradeCosts({ type: 'greenhouse', floor: 0, level: 1 }), { scrap: 330, science: 0 });
  assert.deepEqual(getRoomUpgradeCosts({ type: 'greenhouse', floor: 3, level: 3 }), { scrap: 2100, science: 500 });
  assert.equal(getRoomUpgradeCosts({ type: 'life_support', floor: 2, level: 5 }), null);
});

test('oxygen demand tolerates missing state and grid inputs', () => {
  assert.equal(getLifeSupportOxygenProduction(INITIAL_SHELTER_GRID), 0);
  assert.equal(getRoomStorageCapacity(INITIAL_SHELTER_GRID, 'oxygen'), 300);
  assert.equal(getBunkerOxygenConsumption({}, INITIAL_SHELTER_GRID), 5);
});

test('life support construction and upgrades charge depth-adjusted scrap and preserve upgrade science costs', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const built = buildShelterRoom({ ...base, scrap: 500 }, 'life_support', 0, 2);
  assert.equal(built.scrap, 302);
  assert.equal(built.shelter_grid[0][2].type, 'life_support');
  assert.equal(built.inhabitants.length, base.inhabitants.length);

  const deepGrid = makeGrid([{ type: 'life_support', floor: 3, column: 1, level: 3 }]);
  const upgraded = upgradeShelterRoom({ ...base, scrap: 2500, science: 500, shelter_grid: deepGrid }, 3, 1);
  assert.equal(upgraded.shelter_grid[3][1].level, 4);
  assert.equal(upgraded.scrap, 400);
  assert.equal(upgraded.science, 0);
});

test('monthly oxygen balance stores reserve, detects production deficit, and charges life-support energy', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const supportedGrid = makeGrid([{ type: 'life_support', floor: 0, column: 2, level: 1 }]);
  const supported = advanceWastelandMonth({
    ...base,
    shelter_grid: supportedGrid,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 100, energy: 100 },
  });
  assert.equal(supported.oxygen_deprived, false);
  assert.equal(supported.oxygen_shortage_turns, 0);
  assert.equal(supported.shelter_supplies.oxygen, 385);
  assert.equal(supported.shelter_supplies.energy, 88);

  const deficient = advanceWastelandMonth({
    ...base,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 300, energy: 100 },
  });
  assert.equal(deficient.oxygen_deprived, true);
  assert.equal(deficient.oxygen_shortage_turns, 1);
  assert.equal(deficient.shelter_supplies.oxygen, 285);
  assert.ok(deficient.inhabitants.every((npc) => npc.loyalty === 75));
});

test('three consecutive oxygen-deficit months unlock seeded asphyxiation deaths and recovery resets the streak', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const atThreshold = advanceWastelandMonth({
    ...base,
    randomSeed: 1,
    wasteland_turn: 2,
    wastelandMonthCounter: 2,
    oxygen_shortage_turns: 2,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 0, food: 100, energy: 100 },
  });
  assert.equal(atThreshold.oxygen_shortage_turns, 3);
  assert.equal(atThreshold.inhabitants.length, base.inhabitants.length - 1);
  assert.match(atThreshold.notice, /ASFIXIA/);

  const recoveryGrid = makeGrid([{ type: 'life_support', floor: 0, column: 2, level: 1 }]);
  const recovered = advanceWastelandMonth({
    ...base,
    shelter_grid: recoveryGrid,
    oxygen_shortage_turns: 2,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 100, energy: 100 },
  });
  assert.equal(recovered.oxygen_deprived, false);
  assert.equal(recovered.oxygen_shortage_turns, 0);
});

test('oxygen save fields hydrate safely, including legacy Wasteland reserves', () => {
  const base = createGameState('bra');
  const normal = hydrateGameState(JSON.stringify(base));
  assert.equal(normal.shelter_supplies.oxygen, 0);
  assert.equal(normal.oxygen_shortage_turns, 0);
  assert.equal(normal.oxygen_deprived, false);

  const legacy = hydrateGameState(JSON.stringify({ ...transicionarParaWasteland(base), shelter_supplies: { food: 10, energy: 10 } }));
  assert.equal(legacy.shelter_supplies.oxygen, 300);
});

test('bunker HUD and life-support management display oxygen, depth demand, production, and maintenance', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const grid = makeGrid([{ type: 'life_support', floor: 3, column: 1, level: 2 }]);
  const state = { ...base, scrap: 1000, shelter_grid: grid, oxygen_deprived: true,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 450 } };
  assert.match(bunkerView(state), /O₂ 450 \/ 900 · ALERTA/);
  assert.match(bunkerView(state), /oxygen-deprived/);
  const roomPanel = renderRoomManagement(state, grid[3][1]);
  assert.match(roomPanel, /600 O₂\/mês/);
  assert.match(roomPanel, /0 O₂\/mês · profundidade 4/);
  assert.match(roomPanel, /10 energia\/mês/);
  assert.match(roomPanel, /SUCATA: 1\.120/);
});

test('oxygen deprivation halves direct player and NPC movement deltas', () => {
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  const player = { x: 280, y: 300, floor: 0, vx: 0, vy: 0, facing: 1, liftTarget: null, liftHeld: false };
  const input = { right: true };
  const normal = updatePlayer(player, input, grid, 0.05, false);
  const deprived = updatePlayer(player, input, grid, 0.05, true);
  assert.equal(deprived.x - player.x, (normal.x - player.x) / 2);
});

test('oxygen Canvas overlay is pulsed and scoped to source pixels; support-room fans animate', () => {
  const calls = [];
  const ctx = {
    canvas: { width: 800, height: 500 },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, translate() {}, rotate(angle) { calls.push(['rotate', angle]); },
    arc() {}, ellipse() {}, fill() {}, fillRect() {}, drawImage() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  applyOxygenDeprivationOverlay(ctx, 800, 500, false, 0);
  assert.equal(calls.length, 0);
  applyOxygenDeprivationOverlay(ctx, 800, 500, true, 400);
  assert.ok(calls.some(([name]) => name === 'save'));
  assert.ok(calls.some(([name]) => name === 'restore'));

  renderRoom(ctx, { type: 'life_support', floor: 0, column: 2, level: 1 }, { getImage: () => null }, 150);
  assert.equal(calls.filter(([name]) => name === 'rotate').length, 15);
});
