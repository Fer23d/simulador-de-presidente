import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetManager, DEFAULT_ASSETS, drawActorSprite, renderSpriteScene } from '../src/core/sprite_engine.js';
import { cellCenter, INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';

test('asset manager preloads every image and records failed URLs', async () => {
  class FakeImage {
    set src(value) {
      queueMicrotask(() => value.includes('missing') ? this.onerror?.() : (this.width = 512, this.height = 512, this.onload?.()));
    }
  }
  const assets = new AssetManager({ sky: '/sky.png', absent: '/missing.png' }, FakeImage);
  await assets.preload();
  assert.equal(assets.getImage('sky')?.width, 512);
  assert.equal(assets.getImage('absent'), null);
  assert.deepEqual(assets.failedKeys, ['absent']);
  assert.match(DEFAULT_ASSETS.room_atlas, /assets\/img\/room_atlas\.png$/);
});

test('sprite scene draws images, repeats dirt, and never draws procedural geometry', () => {
  const drawn = [];
  const image = { width: 1688, height: 932 };
  const ctx = {
    canvas: { width: 960, height: 600 },
    save() {}, restore() {}, translate() {}, scale() {},
    drawImage(...args) { drawn.push(args); },
    createPattern() { return 'dirt-pattern'; },
    fillRect() { assert.equal(this.fillStyle, 'dirt-pattern'); },
    beginPath() { throw new Error('procedural geometry'); },
    fillText() { throw new Error('canvas UI'); },
  };
  const assets = { getImage: () => image };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID,
    player: { ...cellCenter(0, 1), floor: 0, vx: 170, facing: 1, liftTarget: null },
    camera: { offset_x: 0, offset_y: 0 }, inhabitants: [], cabinFloor: 0, assets, time: 250 });
  assert.ok(drawn.length >= 6);
  assert.ok(drawn.some((args) => args.length === 9));
});

test('character sprite advances walk frames and rests on idle frame', () => {
  const frames = [];
  const ctx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage(...args) { frames.push(args); } };
  const image = { width: 1536, height: 1024 };
  drawActorSprite(ctx, { x: 100, y: 200, vx: 0, facing: 1, role: 'president' }, image, 200);
  drawActorSprite(ctx, { x: 100, y: 200, vx: 170, facing: -1, role: 'president' }, image, 200);
  assert.equal(frames[0].length, 9);
  assert.equal(frames[0][1], 0);
  assert.ok(frames[1][1] > 0);
});

test('missing art produces a magenta error tile instead of procedural scenery', () => {
  const colors = [];
  const ctx = {
    canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    createPattern() { return null; },
    fillRect() { colors.push(this.fillStyle); },
  };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID, player: { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null },
    camera: { offset_x: 0, offset_y: 0 }, assets: { getImage: () => null }, time: 0 });
  assert.ok(colors.length >= 4);
  assert.deepEqual(new Set(colors), new Set(['#ff00ff']));
});
