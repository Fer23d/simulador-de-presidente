import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, broadcastShelterSignal, cellCenter, equipShelterGuard, INITIAL_SHELTER_GRID, useShelterMedkit } from '../src/core/shelter_engine.js';
import { createInitialInhabitants, createRpgPlayer, findNearbyTrigger, getElevatorCabinGroundY,
  getElevatorPrompt, getElevatorShaftBounds, normalizeInhabitants, updatePlayer } from '../src/core/rpg_bunker.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { createRpgBunkerEngine, findNearbyInhabitant } from '../src/core/rpg_bunker.js';

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

test('horizontal player movement covers the same distance at 30 and 60 FPS', () => {
  const grid = expandedGrid();
  const start = createRpgPlayer(grid);
  const simulate = (frames, dt) => {
    let player = { ...start };
    for (let index = 0; index < frames; index++) player = updatePlayer(player, { right: true }, grid, dt);
    return player.x - start.x;
  };
  assert.ok(Math.abs(simulate(30, 1 / 30) - simulate(60, 1 / 60)) < 0.01);
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

test('nearby inhabitant prompt uses world coordinates and ignores expedition NPCs', () => {
  const grid = INITIAL_SHELTER_GRID;
  const player = createRpgPlayer(grid);
  const npc = { id: 'doctor-1', role: 'medic', floor: 0, column: 1, offsetX: 0 };
  assert.equal(findNearbyInhabitant(player, grid, [npc])?.npc.id, npc.id);
  assert.match(findNearbyInhabitant(player, grid, [npc])?.label ?? '', /\[ E \] FALAR/);
  assert.equal(findNearbyInhabitant(player, grid, [{ ...npc, is_on_expedition: true }]), null);
});

test('nearby inhabitant search ignores NPCs outside the player room', () => {
  const grid = expandedGrid();
  const player = createRpgPlayer(grid);
  const sameRoom = { id: 'same-room', floor: 0, column: 1, offsetX: 30 };
  const otherRoom = { id: 'other-room', floor: 0, column: 2, offsetX: -100 };
  assert.equal(findNearbyInhabitant(player, grid, [otherRoom, sameRoom])?.npc.id, 'same-room');
});

test('dialogue proximity tracker refreshes every 200ms and can be forced for interaction', async () => {
  const { createNearbyInhabitantTracker } = await import('../src/core/rpg_bunker.js');
  const tracker = createNearbyInhabitantTracker();
  const player = createRpgPlayer(INITIAL_SHELTER_GRID);
  const grid = INITIAL_SHELTER_GRID;
  const npc = { id: 'worker-1', floor: 0, column: 1, offsetX: 0 };
  assert.equal(tracker(player, grid, [npc], 0)?.npc.id, 'worker-1');
  const movedAway = { ...npc, offsetX: 100 };
  assert.equal(tracker(player, grid, [movedAway], 199)?.npc.id, 'worker-1');
  assert.equal(tracker(player, grid, [movedAway], 200), null);
  assert.equal(tracker(player, grid, [npc], 201, true)?.npc.id, 'worker-1');
});

test('first dialogue input reveals all text and the second closes, resuming the bunker', async () => {
  const listeners = new Map();
  const previous = { window: globalThis.window, Image: globalThis.Image,
    document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  globalThis.document = { activeElement: null };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Image = class {
    set src(_value) { queueMicrotask(() => this.onerror?.()); }
  };
  const noop = () => {};
  const ctx = new Proxy({ canvas: { width: 960, height: 600 }, createPattern: () => ({}),
    createRadialGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 0 }) }, {
    get(target, key) { return key in target ? target[key] : noop; },
  });
  const canvas = { width: 960, height: 600, getContext: () => ctx,
    addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
  const opened = [];
  const closed = [];
  let textComplete = false;
  try {
    const engine = createRpgBunkerEngine(canvas, { inhabitants: [
      { id: 'doctor-1', role: 'medic', floor: 0, column: 1, offsetX: 0 },
    ], onDialogue: (npc) => opened.push(npc),
      onDialogueAdvance: () => {
        if (textComplete) return false;
        textComplete = true;
        return true;
      }, onDialogueClose: (npc) => closed.push(npc) });
    await engine.ready;
    listeners.get('keydown')({ key: 'e', repeat: false, preventDefault: noop });
    assert.equal(opened[0]?.id, 'doctor-1');
    assert.equal(engine.getSnapshot().dialogueOpen, true);
    listeners.get('keydown')({ key: 'e', repeat: true, preventDefault: noop });
    assert.equal(engine.getSnapshot().dialogueOpen, true);
    listeners.get('keydown')({ key: 'e', repeat: false, preventDefault: noop });
    assert.equal(engine.getSnapshot().dialogueOpen, true);
    listeners.get('keydown')({ key: 'e', repeat: false, preventDefault: noop });
    assert.equal(engine.getSnapshot().dialogueOpen, false);
    assert.equal(closed[0]?.id, 'doctor-1');
    assert.equal(engine.getSnapshot().dialogueOpen, false);
    engine.destroy();
  } finally {
    globalThis.window = previous.window;
    globalThis.Image = previous.Image;
    globalThis.document = previous.document;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
  }
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

test('NPC walk state survives hydration without leaving the assigned room', () => {
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  const inhabitants = wasteland.inhabitants.map((npc, index) => index === 0
    ? { ...npc, currentState: 'walking_right', targetOffsetX: 96, waitSeconds: 0 }
    : npc);
  const restored = hydrateGameState(JSON.stringify({ ...wasteland, inhabitants }));
  assert.equal(restored.inhabitants[0].currentState, 'walking_right');
  assert.equal(restored.inhabitants[0].targetOffsetX, 96);
  assert.equal(restored.inhabitants[0].floor, 0);
});

test('daily dialogue cooldown persists with the game save', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const saved = { ...base, currentDay: 9, inhabitants: base.inhabitants.map((npc, index) => index === 0
    ? { ...npc, lastTalkedDay: 8, revoltChance: 5 } : npc) };
  const restored = hydrateGameState(JSON.stringify(saved));

  assert.equal(restored.currentDay, 9);
  assert.equal(restored.inhabitants[0].lastTalkedDay, 8);
  assert.equal(restored.inhabitants[0].revoltChance, 5);
});
