import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, broadcastShelterSignal, cellCenter, equipShelterGuard, INITIAL_SHELTER_GRID, useShelterMedkit } from '../src/core/shelter_engine.js';
import { createRpgPlayer, findNearbyTrigger, updatePlayer } from '../src/core/rpg_bunker.js';
import { advanceWastelandMonth } from '../src/core/wasteland.js';

function expandedGrid() {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  return buildShelterRoom(state, 'generator', 0, 2).shelter_grid;
}

test('A/D move across connected rooms, but not into earth', () => {
  const grid = expandedGrid();
  const start = { ...createRpgPlayer(grid), x: cellCenter(0, 2).x + 100 };
  const blocked = updatePlayer(start, { right: true }, grid, 1);
  assert.ok(blocked.x < cellCenter(0, 2).x + 132);
  assert.equal(blocked.floor, 0);
  const moved = updatePlayer(createRpgPlayer(grid), { left: true }, grid, 0.5);
  assert.ok(moved.x < cellCenter(0, 1).x);
  assert.equal(moved.y, cellCenter(0, 1).y);
});

test('W/S works only inside a connected elevator and arrives on the next floor', () => {
  const grid = expandedGrid();
  const remote = updatePlayer(createRpgPlayer(grid), { down: true }, grid, 0.1);
  assert.equal(remote.liftTarget, null);
  let player = { ...createRpgPlayer(grid), x: cellCenter(0, 0).x };
  player = updatePlayer(player, { down: true }, grid, 0.1);
  assert.equal(player.liftTarget, 1);
  for (let frame = 0; frame < 120; frame++) player = updatePlayer(player, {}, grid, 1 / 60);
  assert.equal(player.floor, 1);
  assert.equal(player.y, cellCenter(1, 0).y);
  assert.equal(player.liftTarget, null);
});

test('holding S stops at one floor until the key is released', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'elevator', 2, 0);
  let player = { ...createRpgPlayer(state.shelter_grid), x: cellCenter(0, 0).x };
  for (let frame = 0; frame < 120; frame++) player = updatePlayer(player, { down: true }, state.shelter_grid, 1 / 60);
  assert.equal(player.floor, 1);
  assert.equal(player.liftTarget, null);
  player = updatePlayer(player, {}, state.shelter_grid, 1 / 60);
  player = updatePlayer(player, { down: true }, state.shelter_grid, 1 / 60);
  assert.equal(player.liftTarget, 2);
});

test('nearby object trigger belongs to current room only', () => {
  const grid = expandedGrid();
  const atGenerator = { ...createRpgPlayer(grid), x: cellCenter(0, 2).x };
  assert.equal(findNearbyTrigger(atGenerator, grid)?.room.type, 'generator');
  assert.equal(findNearbyTrigger(createRpgPlayer(grid), grid)?.room.type, 'vault');
  assert.equal(findNearbyTrigger({ ...atGenerator, x: cellCenter(0, 2).x - 100 }, grid), null);
});

test('new functional rooms can be constructed', () => {
  let state = { is_wasteland: true, scrap: 2000, shelter_grid: INITIAL_SHELTER_GRID };
  for (const type of ['arsenal', 'medical', 'radio', 'office']) {
    const before = state.scrap;
    state = buildShelterRoom(state, type, 0, state.shelter_grid[0].filter(Boolean).length);
    assert.ok(state.scrap < before);
    assert.ok(state.shelter_grid[0].some((room) => room?.type === type));
  }
  state = { ...state, country: { populacao_base: 3000 }, calendar: { month: 1, year: 2026 }, shelter_supplies: { weapons: 0, medkits: 0 } };
  const next = advanceWastelandMonth(state);
  assert.equal(next.shelter_supplies.weapons, 1);
  assert.equal(next.shelter_supplies.medkits, 2);
  assert.equal(next.country.populacao_base, 3005);
  assert.equal(next.scrap, state.scrap + 30);
});

test('room interactions consume supplies and change the vault state immutably', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID,
    shelter_supplies: { weapons: 1, medkits: 1 }, shelter_guards: 0,
    shelter_radiation: 30, country: { populacao: 3000, populacao_base: 3000 } };
  for (const type of ['arsenal', 'medical', 'radio']) {
    state = buildShelterRoom(state, type, 0, state.shelter_grid[0].filter(Boolean).length);
  }
  const armed = equipShelterGuard(state);
  assert.equal(armed.shelter_guards, 1);
  assert.equal(armed.shelter_supplies.weapons, 0);
  assert.equal(state.shelter_supplies.weapons, 1);
  const treated = useShelterMedkit(armed);
  assert.equal(treated.shelter_radiation, 15);
  assert.equal(treated.shelter_supplies.medkits, 0);
  const broadcast = broadcastShelterSignal(treated);
  assert.equal(broadcast.scrap, treated.scrap - 10);
  assert.equal(broadcast.country.populacao_base, 3010);
});
