import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drawDog } from '../src/core/dog_renderer.js';
import { renderMarket } from '../src/core/market_renderer.js';
import { drawCoverArt } from '../src/core/cover_art.js';
import { AssetManager, DEFAULT_ASSETS, OPTIONAL_ASSETS } from '../src/core/sprite_engine.js';
import { rollDarkMarket } from '../src/core/market.js';

function recorder() {
  const calls = [];
  const ctx = new Proxy({}, { get: (target, name) => {
    if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (name === 'measureText') return () => ({ width: 40 });
    return (...args) => { calls.push({ name, args }); return args; };
  }, set: () => true });
  return { ctx, calls };
}

test('the painted art slots are optional: a missing file never reports a broken texture', async () => {
  for (const key of ['layd_sheet', 'dark_market_stall', 'dark_market_merchant', 'room_radiation_clinic', 'room_laboratory', 'room_life_support']) {
    assert.ok(DEFAULT_ASSETS[key], `${key} is registered`);
    assert.ok(OPTIONAL_ASSETS.has(key), `${key} is optional`);
  }
  class MissingImage { set src(value) { this.onerror?.(); } }
  const manager = new AssetManager({ ...DEFAULT_ASSETS }, MissingImage);
  await manager.preload();
  assert.ok(manager.failedKeys.length > 0, 'required art still reports when missing');
  assert.ok(manager.failedKeys.every((key) => !OPTIONAL_ASSETS.has(key)), 'optional art is not reported');
});

test('the generated production art is present in the project asset pack', () => {
  for (const file of [
    'layd_sheet.png', 'dark_market_stall.png', 'dark_market_merchant.png',
    'room_radiation_clinic.png', 'room_laboratory.png', 'room_life_support.png', 'cover_art.png',
  ]) {
    assert.equal(existsSync(resolve('assets', 'img', file)), true, `missing generated asset ${file}`);
  }
  assert.ok(DEFAULT_ASSETS.cover_art, 'cover art is registered in the shared manifest');
  assert.ok(OPTIONAL_ASSETS.has('cover_art'), 'cover art remains optional for fallback builds');
});

test('Layd is drawn from the painted sheet when it exists, picking the row by pose and sickness', () => {
  const sheet = { width: 800, height: 800 };
  const pick = (options) => {
    const { ctx, calls } = recorder();
    drawDog(ctx, { x: 100, y: 100, scale: 1, sheet, ...options });
    const args = calls.find((call) => call.name === 'drawImage' && call.args[0] === sheet)?.args;
    return args ? { col: Math.round(args[1] / 200), row: Math.round(args[2] / 200), width: args[3] } : null;
  };
  assert.equal(pick({ pose: 'walk', gait: 0 }).width, 200, 'a whole cell when pixels cannot be probed');
  assert.equal(pick({ pose: 'walk', gait: 0 }).row, 0);
  assert.equal(pick({ pose: 'run', gait: 0 }).row, 1);
  assert.equal(pick({ pose: 'stand' }).row, 2);
  assert.equal(pick({ pose: 'walk', gait: 0, sick: true }).row, 3);
  assert.deepEqual([0, 1.6, 3.2, 4.8].map((gait) => pick({ pose: 'walk', gait }).col), [0, 1, 2, 3], 'the stride advances through the four walk frames');
  assert.deepEqual([pick({ pose: 'stand' }), pick({ pose: 'sit' }), pick({ pose: 'sit', happy: true }), pick({ pose: 'sit', sick: true })].map((frame) => frame.col), [0, 1, 2, 3]);
  const { ctx, calls } = recorder();
  drawDog(ctx, { x: 0, y: 0, pose: 'stand' });
  assert.equal(calls.filter((call) => call.name === 'drawImage' && call.args[0] === sheet).length, 0, 'without a sheet she is drawn in code');
});

test('the market draws the painted stall and merchant when they exist', () => {
  const stall = { width: 1000, height: 500 };
  const merchant = { width: 200, height: 400 };
  const { ctx, calls } = recorder();
  renderMarket(ctx, rollDarkMarket(3), { time: 400, stallImage: stall, merchantImage: merchant });
  const drawn = calls.filter((call) => call.name === 'drawImage').map((call) => call.args[0]);
  assert.deepEqual(drawn, [stall, merchant]);
  const fallback = recorder();
  renderMarket(fallback.ctx, rollDarkMarket(3), { time: 400 });
  assert.equal(fallback.calls.filter((call) => call.name === 'drawImage').length, 0);
});

test('the cover keeps working when the painted cover does not exist', () => {
  const { ctx } = recorder();
  assert.doesNotThrow(() => drawCoverArt(ctx, 800, 600, 10));
});

test('large art is only shrunk when a canvas is available and never enlarged', async () => {
  const { prescaleImage } = await import('../src/core/sprite_engine.js');
  const big = { width: 2000, height: 1000 };
  assert.equal(prescaleImage(big, { width: 700 }), big, 'without a document the original image is kept');
  assert.equal(prescaleImage(big, undefined), big);
  const small = { width: 300, height: 200 };
  assert.equal(prescaleImage(small, { width: 700 }), small, 'never enlarged');
});

test('storm animations stay cheap: few draw calls, no full-screen multiply and no shadow blur', async () => {
  const { renderWeather } = await import('../src/core/sprite_engine.js');
  for (const weather of ['dust', 'acid_rain', 'radstorm']) {
    const sets = [];
    const calls = { fill: 0, stroke: 0, fillRect: 0 };
    const ctx = new Proxy({ canvas: { width: 960, height: 600 } }, {
      get: (target, name) => {
        if (name in target) return target[name];
        if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (...args) => { if (name in calls) calls[name] += 1; return args; };
      },
      set: (target, name, value) => { sets.push([name, value]); return true; },
    });
    renderWeather(ctx, { offset_x: 0 }, 300, 4_100, weather);
    assert.ok(!sets.some(([name, value]) => name === 'shadowBlur' && value > 0), `${weather}: no shadow blur`);
    assert.ok(!sets.some(([name, value]) => name === 'globalCompositeOperation' && value === 'multiply'), `${weather}: no multiply`);
    assert.ok(calls.fill + calls.stroke <= 12, `${weather}: batched particles (${calls.fill} fills, ${calls.stroke} strokes)`);
    assert.ok(calls.fillRect <= 30, `${weather}: no per-particle rectangles (${calls.fillRect})`);
  }
});

test('low quality weather is a flat tint with no particles, strokes or bolts', async () => {
  const { renderWeather } = await import('../src/core/sprite_engine.js');
  for (const weather of ['dust', 'acid_rain', 'radstorm']) {
    const calls = { fillRect: 0, fill: 0, stroke: 0 };
    const ctx = new Proxy({ canvas: { width: 960, height: 600 } }, {
      get: (target, name) => (name in target ? target[name] : (name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args) => { if (name in calls) calls[name] += 1; return args; })),
      set: () => true,
    });
    renderWeather(ctx, { offset_x: 0 }, 300, 4_100, weather, true);
    assert.equal(calls.fillRect, 1, `${weather}: a single tint`);
    assert.equal(calls.fill + calls.stroke, 0, `${weather}: no particles`);
  }
});
