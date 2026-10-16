import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, broadcastShelterSignal, cellCenter, equipShelterGuard, INITIAL_SHELTER_GRID, useShelterMedkit } from '../src/core/shelter_engine.js';
import { createInitialInhabitants, createRpgPlayer, findNearbyTrigger, getElevatorCabinGroundY,
  getElevatorPrompt, getElevatorShaftBounds, normalizeInhabitants, updatePlayer } from '../src/core/rpg_bunker.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';

function expandedGrid() {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  return buildShelterRoom(state, 'generator', 0, 2).shelter_grid;
}

test('A/D crosses connected rooms and stops before earth', () => {
  const grid = expandedGrid();
  const start = { ...createRpgPlayer(grid), x: cellCenter(0, 2).x + 100 };
  const blocked = updatePlayer(start, { right: true }, grid, 1);
  assert.ok(blocked.x < cellCenter(0, 2).x + 132);
  const moved = updatePlayer(createRpgPlayer(grid), { left: true }, grid, .5);
  assert.ok(moved.x < cellCenter(0, 1).x);
});

test('W/S only uses connected elevators and ends at an exact floor', () => {
  const grid = expandedGrid();
  assert.equal(updatePlayer(createRpgPlayer(grid), { down: true }, grid, .1).liftTarget, null);
  let player = { ...createRpgPlayer(grid), x: cellCenter(0, 0).x };
  assert.match(getElevatorPrompt(player, grid), /DESCER/);
  player = updatePlayer(player, { down: true }, grid, .1);
  assert.equal(player.liftTarget, 1);
  for (let frame = 0; frame < 120; frame++) player = updatePlayer(player, {}, grid, 1 / 60);
  assert.equal(player.floor, 1);
  assert.equal(player.y, cellCenter(1, 0).y);
});

test('holding S stops after one floor until the key is released', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'elevator', 2, 0);
  let player = { ...createRpgPlayer(state.shelter_grid), x: cellCenter(0, 0).x };
  for (let frame = 0; frame < 120; frame++) player = updatePlayer(player, { down: true }, state.shelter_grid, 1 / 60);
  assert.equal(player.floor, 1);
  player = updatePlayer(player, {}, state.shelter_grid, 1 / 60);
  player = updatePlayer(player, { down: true }, state.shelter_grid, 1 / 60);
  assert.equal(player.liftTarget, 2);
});

test('object trigger belongs to the current room', () => {
  const grid = expandedGrid();
  const atGenerator = { ...createRpgPlayer(grid), x: cellCenter(0, 2).x };
  assert.equal(findNearbyTrigger(atGenerator, grid)?.room.type, 'generator');
  assert.equal(findNearbyTrigger({ ...atGenerator, x: atGenerator.x - 100 }, grid), null);
});

test('new functional rooms can be constructed and produce resources', () => {
  let state = { is_wasteland: true, scrap: 2000, shelter_grid: INITIAL_SHELTER_GRID };
  for (const type of ['arsenal', 'medical', 'radio', 'office']) {
    const before = state.scrap;
    state = buildShelterRoom(state, type, 0, state.shelter_grid[0].filter(Boolean).length);
    assert.ok(state.scrap < before);
  }
  state = { ...state, country: { populacao_base: 3000 }, calendar: { month: 1, year: 2026 }, shelter_supplies: { weapons: 0, medkits: 0 } };
  const next = advanceWastelandMonth(state);
  assert.equal(next.shelter_supplies.weapons, 1);
  assert.equal(next.shelter_supplies.medkits, 2);
});

test('room interactions consume supplies immutably', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID,
    shelter_supplies: { weapons: 1, medkits: 1 }, shelter_guards: 0,
    shelter_radiation: 30, country: { populacao: 3000, populacao_base: 3000 } };
  for (const type of ['arsenal', 'medical', 'radio']) {
    state = buildShelterRoom(state, type, 0, state.shelter_grid[0].filter(Boolean).length);
  }
  const armed = equipShelterGuard(state);
  assert.equal(armed.shelter_guards, 1);
  assert.equal(state.shelter_supplies.weapons, 1);
  const treated = useShelterMedkit(armed);
  assert.equal(treated.shelter_radiation, 15);
  assert.equal(broadcastShelterSignal(treated).scrap, treated.scrap - 10);
});

test('shaft spans connected floors and cabin tracks the rider', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'elevator', 2, 0);
  const [shaft] = getElevatorShaftBounds(state.shelter_grid);
  assert.equal(shaft.floorEnd, 2);
  assert.ok(shaft.height > 2 * 181);
  const moving = { ...createRpgPlayer(state.shelter_grid), liftTarget: 1, y: 384 };
  assert.equal(getElevatorCabinGroundY(moving, 0), 384);
});

test('NPCs survive save hydration and invalid residents are filtered', () => {
  const seeded = createInitialInhabitants(INITIAL_SHELTER_GRID);
  assert.ok(seeded.length >= 2);
  assert.deepEqual(normalizeInhabitants([...seeded, { id: 'orphan', floor: 4, column: 4 }], INITIAL_SHELTER_GRID), seeded);
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  assert.ok(wasteland.inhabitants.length >= 2);
  const expanded = buildShelterRoom(wasteland, 'generator', 0, 2);
  assert.deepEqual(hydrateGameState(JSON.stringify(expanded)).inhabitants, expanded.inhabitants);
});
