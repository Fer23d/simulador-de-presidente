import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState, transicionarParaWasteland } from '../src/core/game-state.js';
import { bunkerView } from '../src/ui/dashboard.js';
import { advanceWastelandMonth } from '../src/core/wasteland.js';
import {
  INITIAL_SHELTER_GRID,
  Inhabitant,
  buildShelterRoom,
  cellCenter,
  createShelterEngine,
  drawRoomLevelIndicators,
  findBuildSlots,
  findRoute,
  getCellAtPoint,
  getRoom,
  migrateLegacyRooms,
  normalizeShelterInhabitants,
  normalizeShelterGrid,
  repairShelterGenerator,
  upgradeShelterRoom,
} from '../src/core/shelter_engine.js';

test('o Vault comeca como uma sala inteira ao lado do elevador', () => {
  assert.equal(INITIAL_SHELTER_GRID[0][0].type, 'elevator');
  assert.equal(INITIAL_SHELTER_GRID[0][1].type, 'vault');
  assert.equal(findBuildSlots(INITIAL_SHELTER_GRID, 'dormitory').some((slot) => slot.floor === 0 && slot.column === 2), true);
  assert.equal(findBuildSlots(INITIAL_SHELTER_GRID, 'elevator').some((slot) => slot.floor === 1 && slot.column === 0), true);
});

test('construcao desconta sucata, exige suporte e nao altera o estado anterior', () => {
  const state = { is_wasteland: true, scrap: 200, shelter_grid: INITIAL_SHELTER_GRID };
  const built = buildShelterRoom(state, 'dormitory', 0, 2);
  assert.equal(built.scrap, 112);
  assert.equal(getRoom(built.shelter_grid, 0, 2).type, 'dormitory');
  assert.equal(getRoom(state.shelter_grid, 0, 2), null);
  assert.equal(buildShelterRoom(state, 'dormitory', 1, 2).shelter_grid, state.shelter_grid);
  assert.equal(buildShelterRoom({ ...state, scrap: 10 }, 'dormitory', 0, 2).shelter_grid, state.shelter_grid);
});

test('elevador liga andares e habitantes percorrem uma rota real', () => {
  let state = { is_wasteland: true, scrap: 400, shelter_grid: INITIAL_SHELTER_GRID };
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'generator', 1, 1);
  const route = findRoute(state.shelter_grid, { floor: 0, column: 1 }, { floor: 1, column: 1 });
  assert.deepEqual(route.map(({ floor, column }) => `${floor}:${column}`), ['0:1', '0:0', '1:0', '1:1']);
  assert.equal(findRoute(INITIAL_SHELTER_GRID, { floor: 0, column: 1 }, { floor: 1, column: 1 }), null);
  const inhabitant = new Inhabitant('president', 0, 1, true);
  assert.equal(inhabitant.assign(state.shelter_grid, 1, 1), true);
  assert.equal(inhabitant.route.length, 3);
  for (let frame = 0; frame < 1200 && inhabitant.route.length; frame++) inhabitant.update(1 / 60);
  assert.equal(inhabitant.floor, 1);
  assert.equal(inhabitant.column, 1);
});

test('arrastar desloca a camara; clique curto seleciona habitante e slot de construcao', () => {
  const listeners = new Map();
  const ctx = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  }, set(target, key, value) { target[key] = value; return true; } });
  const canvas = {
    width: 960, height: 600, clientWidth: 960, clientHeight: 600,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  let selected = null;
  let construction = null;
  const engine = createShelterEngine(canvas, {
    grid: INITIAL_SHELTER_GRID,
    onSelect: (actor) => { selected = actor; },
    onBuild: (type, floor, column) => { construction = { type, floor, column }; },
  });
  const actors = engine.getSnapshot().inhabitants;
  assert.notEqual(actors.find((actor) => actor.id === 'president').x, actors.find((actor) => actor.id === 'vault-resident').x);
  const original = engine.getSnapshot().camera;
  listeners.get('pointerdown')({ clientX: 300, clientY: 250, pointerId: 1 });
  listeners.get('pointermove')({ clientX: 380, clientY: 280 });
  listeners.get('pointerup')({ clientX: 380, clientY: 280 });
  assert.equal(engine.getSnapshot().camera.offset_x, original.offset_x + 80);
  assert.equal(engine.getSnapshot().camera.offset_y, original.offset_y + 30);

  const camera = engine.getSnapshot().camera;
  const person = cellCenter(0, 1);
  listeners.get('pointerdown')({ clientX: person.x + camera.offset_x, clientY: person.y + camera.offset_y - 20 });
  listeners.get('pointerup')({ clientX: person.x + camera.offset_x, clientY: person.y + camera.offset_y - 20 });
  assert.ok(selected);

  engine.setBuildMode(true);
  const slotX = 60 + 2 * 264 + 130 + camera.offset_x;
  const slotY = 176 + 70 + camera.offset_y;
  listeners.get('pointerdown')({ clientX: slotX, clientY: slotY });
  listeners.get('pointerup')({ clientX: slotX, clientY: slotY });
  assert.deepEqual(construction, { type: 'dormitory', floor: 0, column: 2 });
  engine.destroy();
  assert.equal(listeners.size, 0);

  const expanded = buildShelterRoom({ is_wasteland: true, scrap: 200, shelter_grid: INITIAL_SHELTER_GRID }, 'dormitory', 0, 2);
  let savedActors = [];
  const routedEngine = createShelterEngine(canvas, { grid: expanded.shelter_grid, onActorsChanged: (actors) => { savedActors = actors; } });
  const routedCamera = routedEngine.getSnapshot().camera;
  const president = routedEngine.getSnapshot().inhabitants.find((actor) => actor.id === 'president');
  const press = (x, y) => {
    listeners.get('pointerdown')({ clientX: x, clientY: y });
    listeners.get('pointerup')({ clientX: x, clientY: y });
  };
  press(president.x + routedCamera.offset_x, president.y + routedCamera.offset_y - 20);
  const destination = cellCenter(0, 2);
  press(destination.x + routedCamera.offset_x, destination.y + routedCamera.offset_y - 80);
  assert.deepEqual(savedActors.find((actor) => actor.id === 'president').route, [{ floor: 0, column: 2 }]);
  routedEngine.destroy();
});

test('cliques convertem coordenadas da camara para a sala correta', () => {
  assert.deepEqual(getCellAtPoint(422, 268, { offset_x: 90, offset_y: -20 }), { floor: 0, column: 1 });
  assert.equal(getCellAtPoint(10, 10, { offset_x: 0, offset_y: 0 }), null);
});

test('gerador precisa de reparo; upgrades geram beneficios persistentes', () => {
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  const built = buildShelterRoom(wasteland, 'generator', 0, 2);
  assert.equal(advanceWastelandMonth(built).scrap, built.scrap + 25);
  const repaired = repairShelterGenerator(built, 0, 2);
  assert.equal(repaired.scrap, built.scrap - 25);
  assert.equal(advanceWastelandMonth(repaired).scrap, repaired.scrap + 40);
  const readyToUpgrade = { ...repaired, scrap: 330 };
  const upgraded = upgradeShelterRoom(readyToUpgrade, 0, 2);
  assert.equal(getRoom(upgraded.shelter_grid, 0, 2).level, 2);
  assert.equal(upgraded.scrap, 0);
  assert.equal(advanceWastelandMonth(upgraded).scrap, 55);
});

test('saves antigos migram para a grelha lateral sem perder salas', () => {
  const old = [{ id: 'vault', type: 'vault', x: 0, y: 0 }, { id: 'room-1', type: 'greenhouse', x: 5, y: 0 }, { id: 'room-2', type: 'generator', x: 0, y: 5, operational: true }];
  const migrated = migrateLegacyRooms(old);
  assert.equal(migrated.flat().filter(Boolean).length, 4);
  assert.equal(migrated.flat().some((room) => room?.type === 'greenhouse'), true);
  assert.equal(migrated.flat().some((room) => room?.type === 'generator' && room.operational), true);
  assert.equal(normalizeShelterGrid(migrated)[0][1].type, 'vault');
  const state = createGameState('bra');
  const restored = hydrateGameState(JSON.stringify({ ...state, version: 15, bunker_rooms: old, bunker_player: { x: 6, y: 2, facing: 'east' }, shelter_grid: undefined, shelter_inhabitants: undefined }));
  assert.equal(restored.shelter_grid.flat().filter(Boolean).length, 4);
  assert.equal(restored.shelter_inhabitants.find((actor) => actor.id === 'president')?.column, 2);
  assert.equal(restored.version, 20);
});

test('grid normalization preserves a clamped quarantine timer only on greenhouses', () => {
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  grid[0][2] = { type: 'greenhouse', level: 1, disabledMonthsRemaining: 2.8 };
  grid[0][3] = { type: 'generator', level: 1, disabledMonthsRemaining: 4 };
  const normalized = normalizeShelterGrid(grid);
  assert.equal(normalized[0][2].disabledMonthsRemaining, 2);
  assert.equal(Object.hasOwn(normalized[0][3], 'disabledMonthsRemaining'), false);

  grid[0][2] = { type: 'greenhouse', level: 1, disabledMonthsRemaining: -3 };
  assert.equal(normalizeShelterGrid(grid)[0][2].disabledMonthsRemaining, 0);
});

test('room levels hydrate up to five and clamp invalid higher values', () => {
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  grid[0][2] = { type: 'greenhouse', level: 5 };
  grid[0][3] = { type: 'generator', level: 9 };
  const normalized = normalizeShelterGrid(grid);
  assert.equal(normalized[0][2].level, 5);
  assert.equal(normalized[0][3].level, 5);
});

test('canvas level indicator draws five active and inactive pips', () => {
  const fills = [];
  const ctx = {
    fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
  };
  drawRoomLevelIndicators(ctx, { x: 10, y: 20, width: 240 }, 3);
  assert.equal(fills.length, 5);
  assert.equal(fills.filter((pip) => pip.color === '#69d879').length, 3);
  assert.equal(fills.filter((pip) => pip.color === '#343c3a').length, 2);
});

test('destinos e posicoes dos habitantes sobrevivem ao save e entradas invalidas sao descartadas', () => {
  const state = buildShelterRoom(transicionarParaWasteland(createGameState('bra')), 'dormitory', 0, 2);
  const saved = { id: 'president', floor: 0, column: 1, x: 410, y: 303, facing: 1, route: [{ floor: 0, column: 2 }] };
  const restored = hydrateGameState(JSON.stringify({ ...state, shelter_inhabitants: [saved, { id: '<bad>', x: Infinity }] }));
  assert.deepEqual(restored.shelter_inhabitants, [saved]);
  assert.deepEqual(normalizeShelterInhabitants([{ ...saved, route: [{ floor: 5, column: 6 }] }], state.shelter_grid)[0].route, []);
});

test('a interface oferece controle direto, gestão de salas e expansão', () => {
  const state = transicionarParaWasteland(createGameState('bra'));
  const markup = bunkerView(state);
  assert.match(markup, /data-action="shelter-build-mode"/);
  assert.match(markup, /id="shelterCanvas"/);
  assert.match(markup, /PRESIDENTE EM PATRULHA/);
  assert.match(markup, /A e D movem o Presidente/);
  assert.doesNotMatch(markup, /Arraste para explorar/);
  assert.doesNotMatch(markup, /WASD/);
  assert.match(markup, /data-action="advance"/);
  assert.match(markup, /id="shelter-room-select"/);
  assert.match(markup, /data-action="shelter-open-room"/);
});
