import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssetManager, DEFAULT_ASSETS, applyNightOverlay, drawActorSprite, getActorPlacement, renderRoom, renderSpriteScene,
  ROOM_FLOOR_THICKNESS, SPRITE_BOTTOM_PADDING,
} from '../src/core/sprite_engine.js';
import { buildShelterRoom, cellCenter, FLOOR_SPACING, INITIAL_SHELTER_GRID,
  ROOM_HEIGHT, WORLD_TOP } from '../src/core/shelter_engine.js';
import { Inhabitant } from '../src/core/inhabitant.js';

test('night overlay tints only the canvas scene and restores the previous composition state', () => {
  const calls = [];
  const stack = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
    restore() { [this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
    fillRect(...args) { calls.push([this.fillStyle, ...args]); },
  };

  applyNightOverlay(ctx, 960, 600, false);
  assert.equal(calls.length, 0);
  applyNightOverlay(ctx, 960, 600, true);

  assert.deepEqual(calls, [['#000', 0, 0, 960, 600]]);
  applyNightOverlay(ctx, 960, 600, true, { activeGenerators: 3, surfaceHeight: 180 });
  assert.deepEqual(calls[1], ['#000', 0, 0, 960, 180]);
  applyNightOverlay(ctx, 960, 600, true, { activeGenerators: 2, surfaceHeight: 180 });
  assert.deepEqual(calls[2], ['#000', 0, 0, 960, 600]);
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(ctx.globalCompositeOperation, 'source-over');
});

test('medical and laboratory rooms use separate sprites with distinct localized lighting', () => {
  const draws = [];
  const lights = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    save() {}, restore() {},
    drawImage(...args) { draws.push(args); },
    createRadialGradient(...args) {
      const stops = [];
      const gradient = { addColorStop(...stop) { stops.push(stop); } };
      lights.push({ args, stops });
      return gradient;
    },
    fillRect(...args) { lights.at(-1).rect = args; },
  };
  const atlas = { width: 1200, height: 900 };
  const labSprite = { id: 'dedicated-lab', width: 480, height: 240 };
  const assets = { getImage: (key) => key === 'room_atlas' ? atlas : key === 'room_laboratory' ? labSprite : null };
  const medical = { type: 'medical', floor: 0, column: 0 };
  const laboratory = { type: 'laboratory', floor: 1, column: 2 };

  renderRoom(ctx, medical, assets);
  renderRoom(ctx, laboratory, assets);

  assert.notDeepEqual(draws[0].slice(1, 5), draws[1].slice(1, 5));
  assert.deepEqual(lights[0].rect, [draws[0][5], draws[0][6], draws[0][7], draws[0][8]]);
  assert.match(lights[0].stops[0][1], /200, 240, 255/);
  assert.equal(draws[1][0], labSprite);
  assert.match(lights[1].stops[0][1], /100, 255, 100/);
});

test('laboratory never falls back to the radio room sprite when its dedicated art is unavailable', () => {
  const drawn = [];
  const emptyBase = { id: 'empty-room-base', width: 480, height: 240 };
  const atlas = { id: 'room-atlas', width: 1200, height: 900 };
  const ctx = { save() {}, restore() {}, drawImage(...args) { drawn.push(args); } };
  const assets = { getImage: (key) => key === 'room_base_empty' ? emptyBase : key === 'room_atlas' ? atlas : null };

  renderRoom(ctx, { type: 'laboratory', floor: 0, column: 0 }, assets);

  assert.equal(drawn.length, 1);
  assert.equal(drawn[0][0], emptyBase);
});

test('night surface-only darkness follows the camera while blackout still covers the whole view', () => {
  const blackRects = [];
  const ctx = {
    canvas: { width: 960, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() {}, restore() {}, translate() {}, scale() {},
    createPattern() { return 'soil'; },
    fillRect(x, y, width, height) { if (this.fillStyle === '#000') blackRects.push([x, y, width, height]); },
    drawImage() {}, beginPath() {}, ellipse() {}, fill() {},
  };
  const assets = { getImage: () => ({ width: 1688, height: 932 }) };
  const player = { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null };
  const camera = { offset_x: 0, offset_y: 180 };
  const scene = { grid: [], player, camera, assets, inhabitants: [], cabinFloor: 0, time: 0, isNight: true };

  renderSpriteScene(ctx, { ...scene, activeGenerators: 3 });
  renderSpriteScene(ctx, { ...scene, activeGenerators: 2 });

  assert.deepEqual(blackRects[0], [0, 0, 960, Math.min(600, Math.max(0, WORLD_TOP - 30 + camera.offset_y))]);
  assert.deepEqual(blackRects[1], [0, 0, 960, 600]);
});

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
    beginPath() {}, ellipse() {}, fill() {},
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
  const shadows = [];
  const ctx = { save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    ellipse(...args) { shadows.push({ args, alpha: this.globalAlpha, filter: this.filter }); }, fill() {},
    drawImage(...args) { frames.push(args); } };
  const image = { width: 1536, height: 1024 };
  const room = getActorPlacement({ floor: 0, column: 1, type: 'vault' });
  drawActorSprite(ctx, { x: 100, y: room.floorY, vx: 0, facing: 1, role: 'president' }, image, 200, room);
  drawActorSprite(ctx, { x: 100, y: room.floorY, vx: 170, facing: -1, role: 'president' }, image, 200, room);
  assert.equal(frames[0].length, 9);
  assert.equal(frames[0][1], 0);
  assert.ok(frames[1][1] > 0);
  assert.equal(frames[0][8], room.height);
  assert.equal(frames[0][7] / frames[0][8], (image.width / 4) / (image.height / 2));
  assert.equal(frames[0][6] + frames[0][8], 0);
  assert.equal(shadows.length, 2);
  assert.equal(shadows[0].args[0], 100);
  assert.equal(shadows[0].args[1], room.floorY);
  assert.equal(shadows[0].alpha, .4);
  assert.equal(shadows[0].filter, 'blur(2px)');
});

test('actors stand on the room grate and shrink to the elevator interior', () => {
  const room = getActorPlacement({ floor: 1, column: 1, type: 'dormitory' });
  const lift = getActorPlacement({ floor: 1, column: 0, type: 'elevator' });
  assert.equal(room.floorY, WORLD_TOP + FLOOR_SPACING + ROOM_HEIGHT - ROOM_FLOOR_THICKNESS + SPRITE_BOTTOM_PADDING);
  assert.equal(room.height, room.innerHeight * .55);
  assert.equal(lift.height, lift.innerHeight * .6);
  assert.ok(lift.height < room.height);
  assert.ok(lift.floorY < room.floorY);
});

test('the scene anchors both residents and the president to their own floor', () => {
  const feet = [];
  const image = { width: 1536, height: 1024 };
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {},
    translate() {}, scale() {}, beginPath() {}, fill() {},
    ellipse(x, y) { feet.push([x, y]); },
    drawImage() {}, createPattern() { return 'soil'; }, fillRect() {} };
  const npc = { id: 'resident-a', floor: 0, column: 1, offsetX: 0, role: 'resident', currentState: 'idle' };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID,
    player: { ...cellCenter(0, 0), floor: 0, vx: 0, facing: 1, liftTarget: null },
    inhabitants: [npc], camera: { offset_x: 0, offset_y: 0 },
    assets: { getImage: () => image }, cabinFloor: 0 });
  assert.equal(feet.length, 2);
  assert.equal(feet[0][1], getActorPlacement({ floor: 0, column: 1, type: 'vault' }).floorY);
  assert.equal(feet[1][1], getActorPlacement({ floor: 0, column: 0, type: 'elevator' }).floorY);
});

test('VIP render shows a gold star and specialist name over the distinct scientist sprite row', () => {
  const labels = [];
  const sprites = [];
  const image = { width: 1200, height: 800, key: 'sheet' };
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, ellipse() {}, fill() {}, drawImage(...args) { sprites.push(args); },
    createPattern() { return 'soil'; }, fillRect() {}, fillText(text) { labels.push(text); } };
  const vip = { id: 'vip-scientist', name: 'Dr. Isaac', isVIP: true, modifier: 2,
    floor: 0, column: 1, offsetX: 0, role: 'scientist', currentState: 'idle' };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID,
    player: { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null },
    inhabitants: [vip], camera: { offset_x: 0, offset_y: 0 },
    assets: { getImage: () => image }, cabinFloor: 0, time: 0 });
  assert.ok(labels.includes('⭐ Dr. Isaac'));
  assert.ok(sprites.some((args) => args[0] === image && args[2] > 0));
});

test('opened expedition lootbox is rendered as a blocking overlay above the bunker scene', () => {
  const drawnImages = [];
  const fills = [];
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, ellipse() {}, fill() {}, arc() {}, drawImage(image) { drawnImages.push(image.key); },
    createPattern() { return 'soil'; }, fillRect(...args) { fills.push(args); }, fillText() {} };
  const assets = { getImage(key) { return { width: 1200, height: 800, key }; } };
  const scene = { grid: INITIAL_SHELTER_GRID,
    player: { ...cellCenter(0, 0), floor: 0, vx: 0, facing: 1, liftTarget: null },
    inhabitants: [], camera: { offset_x: 0, offset_y: 0 }, assets, cabinFloor: 0, time: 1500 };
  renderSpriteScene(ctx, { ...scene, lootbox: { opened: true, clickCount: 2, revealed: false, shakeStartedAt: 1200 } });
  assert.ok(drawnImages.includes('loot_crate'));
  drawnImages.length = 0;
  renderSpriteScene(ctx, { ...scene, lootbox: { opened: true, clickCount: 3, revealed: true, revealedAt: 1000 } });

  assert.equal(drawnImages.includes('loot_crate'), false);
  assert.ok(fills.some(([x, y, width, height]) => x === 0 && y === 0 && width === 960 && height === 600));
  assert.ok(fills.filter(([, , width, height]) => width <= 7 && height <= 7).length >= 20);
});

test('an inhabitant chooses a target inside one room, walks, then idles', () => {
  const rolls = [0.1, 0.9];
  const npc = new Inhabitant({ id: 'worker', floor: 0, column: 1, offsetX: 0, role: 'engineer',
    currentState: 'idle', waitSeconds: 0 }, () => rolls.shift() ?? .5);
  npc.update(.1);
  assert.equal(npc.currentState, 'walking_right');
  const start = npc.offsetX;
  for (let index = 0; index < 100 && npc.currentState !== 'idle'; index++) npc.update(.1);
  assert.ok(npc.offsetX > start && npc.offsetX <= 108);
  assert.equal(npc.currentState, 'idle');
  assert.equal(npc.snapshot().currentState, 'idle');
});

test('a worker can return to a control station and face into the room', () => {
  const rolls = [0.1, 0.1];
  const npc = new Inhabitant({ id: 'technician', floor: 0, column: 1, offsetX: 0,
    role: 'engineer', pose: 'working', waitSeconds: 0 }, () => rolls.shift() ?? .5);
  npc.update(.1);
  assert.equal(npc.currentState, 'walking_left');
  for (let index = 0; index < 100 && npc.currentState !== 'idle'; index++) npc.update(.1);
  assert.equal(npc.offsetX, -84);
  assert.equal(npc.facing, 1);
});

test('greenhouse uses a common room base, transparent props and UV light over actors', () => {
  const greenhouse = buildShelterRoom({ is_wasteland: true, scrap: 1000, shelter_grid: INITIAL_SHELTER_GRID }, 'greenhouse', 0, 2).shelter_grid;
  const assetsByKey = Object.fromEntries(['bg_sky', 'bg_mountains', 'fg_wasteland', 'dirt_texture',
    'room_atlas', 'room_base_empty', 'plant_prop_1', 'uv_light_prop', 'elevator_cabin',
    'character_sheet', 'npc_walk_sheet'].map((key) => [key, { key, width: 1200, height: 800 }]));
  const calls = [];
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    createPattern() { return 'soil'; }, createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {}, ellipse() {}, fill() {},
    drawImage(image) { calls.push(image.key); },
    fillRect() { if (this.globalCompositeOperation === 'screen') calls.push('uv-glow'); },
  };
  renderSpriteScene(ctx, { grid: greenhouse, player: { ...cellCenter(0, 2), floor: 0, vx: 0, facing: 1, liftTarget: null },
    camera: { offset_x: 0, offset_y: 0 }, assets: { getImage: (key) => assetsByKey[key] }, time: 100 });
  assert.ok(calls.includes('room_base_empty'));
  assert.ok(calls.filter((key) => key === 'plant_prop_1').length >= 2);
  assert.ok(calls.includes('uv_light_prop'));
  assert.ok(calls.lastIndexOf('uv-glow') > calls.lastIndexOf('character_sheet'));
});

test('missing art produces a magenta error tile instead of procedural scenery', () => {
  const colors = [];
  const ctx = {
    canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, ellipse() {}, fill() {},
    createPattern() { return null; },
    fillRect() { colors.push(this.fillStyle); },
  };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID, player: { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null },
    camera: { offset_x: 0, offset_y: 0 }, assets: { getImage: () => null }, time: 0 });
  assert.ok(colors.length >= 4);
  assert.deepEqual(new Set(colors), new Set(['#ff00ff']));
});

test('expedition NPCs are hidden, rebels show an alert, and detention cells draw bars in front', () => {
  const grid = buildShelterRoom({ is_wasteland: true, scrap: 500, shelter_grid: INITIAL_SHELTER_GRID }, 'detention', 0, 2).shelter_grid;
  const assetsByKey = Object.fromEntries(['bg_sky', 'bg_mountains', 'fg_wasteland', 'dirt_texture', 'room_atlas',
    'elevator_cabin', 'character_sheet', 'npc_walk_sheet'].map((key) => [key, { key, width: 1200, height: 800 }]));
  const npcDraws = [];
  const alerts = [];
  let barsDrawn = 0;
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    createPattern() { return 'soil'; }, beginPath() {}, ellipse() {}, fill() {}, moveTo() {}, lineTo() {},
    stroke() { barsDrawn++; }, drawImage(image) { if (image.key === 'npc_walk_sheet') npcDraws.push(image.key); },
    fillText(text) { alerts.push(text); }, fillRect() {} };
  renderSpriteScene(ctx, { grid, player: { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null },
    inhabitants: [
      { id: 'away', floor: 0, column: 1, offsetX: -40, role: 'resident', is_on_expedition: true },
      { id: 'sad', floor: 0, column: 1, offsetX: 0, role: 'resident', loyalty: 30 },
      { id: 'rebel', floor: 0, column: 1, offsetX: 40, role: 'resident', currentState: 'rebel' },
    ], camera: { offset_x: 0, offset_y: 0 }, assets: { getImage: (key) => assetsByKey[key] }, time: 300 });

  assert.equal(npcDraws.length, 2);
  assert.deepEqual(alerts, ['⚠', '!']);
  assert.equal(barsDrawn, 2);
});
