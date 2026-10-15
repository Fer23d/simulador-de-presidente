import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, broadcastShelterSignal, cellCenter, equipShelterGuard, INITIAL_SHELTER_GRID, useShelterMedkit } from '../src/core/shelter_engine.js';
import { createInitialInhabitants, createRpgPlayer, findNearbyTrigger, generateDirtPattern, getElevatorCabinGroundY, getElevatorShaftBounds, getRoomLightPalette, normalizeInhabitants, renderInhabitants, renderRpgBunker, updatePlayer } from '../src/core/rpg_bunker.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';

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

test('the soil texture is a repeating Canvas pattern', () => {
  const texture = { width: 256, height: 256 };
  const pattern = { soil: true };
  const calls = [];
  const ctx = { createPattern(image, repetition) { calls.push([image, repetition]); return pattern; } };
  assert.equal(generateDirtPattern(ctx, texture), pattern);
  assert.deepEqual(calls, [[texture, 'repeat']]);
});

test('a single shaft spans connected elevator floors and the gaps between them', () => {
  let state = { is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'elevator', 2, 0);
  const bounds = getElevatorShaftBounds(state.shelter_grid);
  assert.equal(bounds.length, 1);
  assert.equal(bounds[0].floorStart, 0);
  assert.equal(bounds[0].floorEnd, 2);
  assert.ok(bounds[0].height > 2 * 181);
});

test('the elevator cabin follows the rider while travelling and rests at its last floor', () => {
  const grid = expandedGrid();
  const initial = createRpgPlayer(grid);
  assert.equal(getElevatorCabinGroundY(initial, 0), cellCenter(0, 0).y);
  const moving = { ...initial, liftTarget: 1, y: cellCenter(0, 0).y + 84 };
  assert.equal(getElevatorCabinGroundY(moving, 0), moving.y);
  assert.equal(getElevatorCabinGroundY({ ...moving, liftTarget: null }, 1), cellCenter(1, 0).y);
});

test('the Wasteland starts with NPCs and filters stale or invalid residents', () => {
  const seeded = createInitialInhabitants(INITIAL_SHELTER_GRID);
  assert.ok(seeded.length >= 2);
  assert.ok(seeded.every((npc) => npc.id !== 'president' && npc.floor === 0 && npc.column === 1));
  const normalized = normalizeInhabitants([
    ...seeded, { id: 'president', floor: 0, column: 1 },
    { id: 'orphan', floor: 4, column: 4 }, { ...seeded[0] },
  ], INITIAL_SHELTER_GRID);
  assert.deepEqual(normalized, seeded);
});

test('NPC rendering animates independently of player movement', () => {
  const npc = createInitialInhabitants(INITIAL_SHELTER_GRID)[0];
  const translations = [];
  const ctx = {
    save() {}, restore() {}, scale() {}, fillRect() {}, beginPath() {}, ellipse() {}, fill() {},
    stroke() {}, moveTo() {}, lineTo() {}, arc() {}, closePath() {},
    createLinearGradient() { return { addColorStop() {} }; },
    translate(x, y) { translations.push([x, y]); },
  };
  renderInhabitants(ctx, [npc], INITIAL_SHELTER_GRID, 0);
  renderInhabitants(ctx, [npc], INITIAL_SHELTER_GRID, 700);
  assert.equal(translations.length, 2);
  assert.notEqual(translations[0][1], translations[1][1]);
});

test('Wasteland seeds NPCs, builds recruit residents, and hydration restores them', () => {
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  assert.ok(wasteland.inhabitants.length >= 2);
  const expanded = buildShelterRoom(wasteland, 'generator', 0, 2);
  assert.ok(expanded.inhabitants.some((npc) => npc.floor === 0 && npc.column === 2));
  assert.deepEqual(hydrateGameState(JSON.stringify(expanded)).inhabitants, expanded.inhabitants);
  const { inhabitants, ...legacy } = expanded;
  assert.ok(hydrateGameState(JSON.stringify(legacy)).inhabitants.length >= 2);
});

test('the RPG render pipeline includes NPCs and a textured soil pattern', () => {
  const calls = { translate: 0, patterned: false };
  const texture = { width: 256, height: 256 };
  const gradient = { addColorStop() {} };
  const pattern = { dirt: true };
  const ctx = new Proxy({ canvas: { width: 960, height: 600 },
    createPattern(_texture, repeat) { assert.equal(repeat, 'repeat'); return pattern; },
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
    measureText() { return { width: 100 }; },
    translate() { calls.translate++; },
    set fillStyle(value) { if (value === pattern) calls.patterned = true; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const assets = { get: () => texture };
  renderRpgBunker(ctx, { grid: INITIAL_SHELTER_GRID, player: createRpgPlayer(),
    camera: { offset_x: 0, offset_y: 0 }, assets,
    inhabitants: createInitialInhabitants(), time: 700 });
  assert.equal(calls.patterned, true);
  assert.ok(calls.translate >= 3);
});

test('each room type has a distinct lighting identity', () => {
  const generator = getRoomLightPalette('generator');
  const greenhouse = getRoomLightPalette('greenhouse');
  const dormitory = getRoomLightPalette('dormitory');
  assert.notDeepEqual(generator, greenhouse);
  assert.notDeepEqual(greenhouse, dormitory);
  assert.match(greenhouse.glow, /rgba/);
});
