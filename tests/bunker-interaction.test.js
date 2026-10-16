import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterRoom, cellCenter, INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';
import { createRpgBunkerEngine, findNearbyRebel } from '../src/core/rpg_bunker.js';

function fakeBrowser() {
  const listeners = new Map();
  globalThis.window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  globalThis.document = { activeElement: { tagName: 'BODY', isContentEditable: false } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {};
  const canvas = { width: 960, height: 600, getContext: () => ctx,
    addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
  return { canvas, listeners };
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
