import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, cellCenter, INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';
import { createRpgBunkerEngine, findNearbyRebel } from '../src/core/rpg_bunker.js';

function fakeBrowser() {
  const listeners = new Map();
  const canvasListeners = new Map();
  globalThis.window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  globalThis.document = { activeElement: { tagName: 'BODY', isContentEditable: false } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {};
  const canvas = { width: 960, height: 600, getContext: () => ctx,
    addEventListener(type, listener) { canvasListeners.set(type, listener); },
    removeEventListener(type) { canvasListeners.delete(type); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
  return { canvas, listeners, canvasListeners };
}

test('pressing E beside a rebel invokes detention only when a cell exists', async () => {
  const original = { window: globalThis.window, document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  try {
    const resident = { id: 'rebel-1', floor: 0, column: 1, offsetX: 0, currentState: 'rebel', loyalty: 0 };
    const center = cellCenter(0, 1);
    assert.match(findNearbyRebel({ ...center, floor: 0, liftTarget: null }, INITIAL_SHELTER_GRID, [resident]).label, /CONSTRUA UMA CELA/);
    let grid = INITIAL_SHELTER_GRID;
    grid = buildShelterRoom({ is_wasteland: true, scrap: 500, shelter_grid: grid }, 'detention', 0, 2).shelter_grid;
    assert.match(findNearbyRebel({ ...center, floor: 0, liftTarget: null }, grid, [resident]).label, /PRENDER DISSIDENTE/);

    const { canvas, listeners } = fakeBrowser();
    const detained = [];
    const engine = createRpgBunkerEngine(canvas, { grid, player: { ...center, floor: 0 }, inhabitants: [resident],
      onDetain: (id) => detained.push(id) });
    await engine.ready;
    listeners.get('keydown')({ key: 'e', repeat: false, preventDefault() {} });
    assert.deepEqual(detained, ['rebel-1']);
    engine.destroy();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('an open lootbox captures canvas clicks on the chest and ignores clicks outside it', async () => {
  const original = { window: globalThis.window, document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  try {
    const { canvas, canvasListeners } = fakeBrowser();
    let clicks = 0;
    const engine = createRpgBunkerEngine(canvas, { lootbox: { opened: true, clickCount: 0 },
      onLootboxClick: () => { clicks++; } });
    await engine.ready;
    const click = canvasListeners.get('click');
    click({ clientX: 480, clientY: 300 });
    click({ clientX: 30, clientY: 30 });
    assert.equal(clicks, 1);
    engine.destroy();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
