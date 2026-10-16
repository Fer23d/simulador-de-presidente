import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, broadcastShelterSignal, cellCenter, equipShelterGuard, INITIAL_SHELTER_GRID, useShelterMedkit } from '../src/core/shelter_engine.js';
import * as bunker from '../src/core/rpg_bunker.js';
const { createInitialInhabitants, createRpgPlayer, findNearbyTrigger, getElevatorCabinGroundY,
  getElevatorShaftBounds, getRoomLightPalette, normalizeInhabitants, renderInhabitants,
  renderRpgBunker, updatePlayer } = bunker;
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

test('world-coordinate terrain generates distinct neighboring chunks without a repeating tile', () => {
  assert.equal(typeof bunker.generateTerrainChunk, 'function');
  assert.equal(typeof bunker.terrainColorAt, 'function');
  const factory = () => {
    const canvas = { width: 0, height: 0, pixels: null };
    canvas.getContext = () => new Proxy({
      createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData(image) { canvas.pixels = image.data; },
      createRadialGradient() { return { addColorStop() {} }; },
    }, { get(target, key) { return key in target ? target[key] : () => {}; } });
    return canvas;
  };
  const first = bunker.generateTerrainChunk(0, 0, factory, 32);
  const neighbor = bunker.generateTerrainChunk(1, 0, factory, 32);
  const again = bunker.generateTerrainChunk(0, 0, factory, 32);
  assert.equal(first.pixels.length, 32 * 32 * 4);
  assert.deepEqual(first.pixels, again.pixels);
  assert.notDeepEqual(first.pixels, neighbor.pixels);
  assert.deepEqual(bunker.terrainColorAt(80, 700), bunker.terrainColorAt(80, 700));
  assert.notDeepEqual(bunker.terrainColorAt(80, 700), bunker.terrainColorAt(2080, 700));
});

test('terrain cache generates at most one new chunk per frame and reuses completed chunks', () => {
  assert.equal(typeof bunker.TerrainChunkCache, 'function');
  const generated = [];
  const cache = new bunker.TerrainChunkCache((x, y) => {
    generated.push([x, y]);
    return { x, y };
  });
  cache.beginFrame();
  const first = cache.get(0, 0);
  assert.equal(cache.get(1, 0), null);
  assert.equal(cache.get(0, 0), first);
  assert.deepEqual(generated, [[0, 0]]);
  cache.beginFrame();
  assert.deepEqual(cache.get(1, 0), { x: 1, y: 0 });
  assert.deepEqual(generated, [[0, 0], [1, 0]]);
});

test('surface parallax moves distant ruins slower than the bunker', () => {
  assert.equal(typeof bunker.getParallaxLayers, 'function');
  const layers = bunker.getParallaxLayers({ offset_x: -200, offset_y: -100 });
  assert.equal(layers.farX, -36);
  assert.ok(Math.abs(layers.nearX + 112) < 0.001);
  assert.ok(Math.abs(layers.farY) < 100);
});

test('ruin silhouettes vary by world position but stay stable across frames', () => {
  assert.equal(typeof bunker.getRuinProfile, 'function');
  const first = Array.from({ length: 8 }, (_, index) => bunker.getRuinProfile(index, 0));
  assert.ok(new Set(first.map((profile) => profile.width)).size >= 5);
  assert.ok(new Set(first.map((profile) => profile.height)).size >= 5);
  assert.deepEqual(first[3], bunker.getRuinProfile(3, 0));
});

test('surface is visible above floor zero and disappears after descending underground', () => {
  const fills = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
    fillRect(...args) { fills.push(args); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  bunker.renderWastelandSurface(ctx, { offset_x: 0, offset_y: -100 }, { width: 960, height: 600 });
  assert.ok(fills.some(([x, y, width, height]) => x === 0 && y === 0 && width === 960 && height > 0));
  fills.length = 0;
  bunker.renderWastelandSurface(ctx, { offset_x: 0, offset_y: -400 }, { width: 960, height: 600 });
  assert.equal(fills.length, 0);
});

test('greenhouse draws three separate hydroponic water channels', () => {
  assert.equal(typeof bunker.drawHydroponics, 'function');
  const channels = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
    fillRect(x, y, width, height) { if (width > 150 && height === 10) channels.push(y); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  bunker.drawHydroponics(ctx, 0, 0, 200);
  assert.equal(new Set(channels).size, 3);
});

test('elevator scissor gates leave the cabin visible through crossed bars', () => {
  assert.equal(typeof bunker.drawElevatorCabin, 'function');
  const strokes = [];
  const ctx = new Proxy({
    createLinearGradient() { return { addColorStop() {} }; },
    moveTo(x, y) { strokes.push(['from', x, y]); },
    lineTo(x, y) { strokes.push(['to', x, y]); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  bunker.drawElevatorCabin(ctx, 322, 300, true, false);
  assert.ok(strokes.length >= 16);
  assert.ok(strokes.some(([kind, x, y], index) => kind === 'to' && strokes[index - 1]?.[1] !== x && strokes[index - 1]?.[2] !== y));
});

test('characters use nine-argument spritesheet crops or articulated canvas limbs', () => {
  assert.equal(typeof bunker.drawCharacter, 'function');
  const frames = [];
  const rotations = [];
  const ctx = new Proxy({
    drawImage(...args) { frames.push(args); },
    rotate(angle) { rotations.push(angle); },
    createLinearGradient() { return { addColorStop() {} }; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const actor = { x: 100, y: 200, facing: 1, role: 'engineer', pose: 'working', vx: 70 };
  bunker.drawCharacter(ctx, actor, 300, { width: 512, height: 768 });
  assert.equal(frames[0].length, 9);
  assert.ok(frames[0][1] >= 0 && frames[0][3] > 0);
  bunker.drawCharacter(ctx, actor, 300);
  const firstPose = [...rotations];
  assert.ok(firstPose.length >= 4);
  rotations.length = 0;
  bunker.drawCharacter(ctx, actor, 700);
  assert.notDeepEqual(rotations, firstPose);
});

test('water drips advance with animation time', () => {
  assert.equal(typeof bunker.drawWaterDrips, 'function');
  const droplets = [];
  const ctx = new Proxy({ arc(x, y) { droplets.push([x, y]); } },
    { get(target, key) { return key in target ? target[key] : () => {}; } });
  bunker.drawWaterDrips(ctx, 100, 50, 0);
  const first = droplets.map((point) => [...point]);
  droplets.length = 0;
  bunker.drawWaterDrips(ctx, 100, 50, 300);
  assert.notDeepEqual(droplets, first);
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
  const rotations = [];
  const ctx = new Proxy({
    createLinearGradient() { return { addColorStop() {} }; },
    rotate(angle) { rotations.push(angle); },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  renderInhabitants(ctx, [npc], INITIAL_SHELTER_GRID, 0);
  const initialPose = [...rotations];
  rotations.length = 0;
  renderInhabitants(ctx, [npc], INITIAL_SHELTER_GRID, 700);
  assert.ok(initialPose.length >= 4);
  assert.notDeepEqual(rotations, initialPose);
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

test('the RPG render pipeline draws terrain chunks and NPCs without a repeated soil pattern', () => {
  const calls = { translate: 0, chunks: 0 };
  const texture = { width: 256, height: 256 };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ canvas: { width: 960, height: 600 },
    createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; },
    measureText() { return { width: 100 }; },
    translate() { calls.translate++; },
    drawImage(image) { if (image === texture) calls.chunks++; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const assets = { get: () => ({}), getTerrainChunk: () => texture };
  renderRpgBunker(ctx, { grid: INITIAL_SHELTER_GRID, player: createRpgPlayer(),
    camera: { offset_x: 0, offset_y: 0 }, assets,
    inhabitants: createInitialInhabitants(), time: 700 });
  assert.ok(calls.chunks > 0);
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
