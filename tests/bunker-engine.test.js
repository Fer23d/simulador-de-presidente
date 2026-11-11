import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssetManager,
  BUNKER_MAP,
  createProceduralPatterns,
  createBunkerState,
  getCameraOffset,
  getInteractionPrompt,
  moveBunkerPlayer,
  renderBunkerScene,
} from '../src/core/bunker_engine.js';

test('cria um bunker 40x40 com o sobrevivente em uma célula caminhável', () => {
  const bunker = createBunkerState();

  assert.equal(BUNKER_MAP.length, 40);
  assert.equal(BUNKER_MAP.every((row) => row.length === 40), true);
  assert.deepEqual(bunker.player, { x: 10, y: 10 });
  assert.equal(BUNKER_MAP[bunker.player.y][bunker.player.x], 1);
});

test('centraliza a câmera em pixels e limita o deslocamento às bordas do bunker', () => {
  const state = createBunkerState({ player: { x: 20, y: 20 } });
  const camera = getCameraOffset(state, { width: 640, height: 480 }, 32);

  assert.deepEqual(camera, { x: 336, y: 416 });
});

test('AssetManager mantém fallback quando Image não existe no ambiente de testes', async () => {
  const assets = new AssetManager({ floor: 'assets/bunker_floor.png' });
  const loaded = await assets.loadAll();

  assert.equal(loaded, assets);
  assert.equal(assets.get('floor'), null);
});

test('movimento bloqueia paredes e permite corredores', () => {
  const bunker = createBunkerState();
  const blocked = moveBunkerPlayer(bunker, 'ArrowUp');
  const moved = moveBunkerPlayer(bunker, 'ArrowLeft');

  assert.deepEqual(blocked.player, bunker.player);
  assert.deepEqual(moved.player, { x: 9, y: 10 });
});

test('detecta interação adjacente com o gerador', () => {
  const bunker = createBunkerState({ player: { x: 9, y: 5 } });

  assert.equal(getInteractionPrompt(bunker), '> PRESSIONE [E] PARA INSPECIONAR GERADOR');
});

test('cria padrões procedurais para piso metálico e área de cautela', () => {
  const calls = [];
  const patterns = createProceduralPatterns(() => ({
    width: 48,
    height: 48,
    getContext: () => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: (...args) => calls.push(['fillRect', ...args]),
      strokeRect: (...args) => calls.push(['strokeRect', ...args]),
      beginPath: () => calls.push(['beginPath']),
      moveTo: (...args) => calls.push(['moveTo', ...args]),
      lineTo: (...args) => calls.push(['lineTo', ...args]),
      stroke: () => calls.push(['stroke']),
    }),
  }));

  assert.ok(patterns.floorMetal);
  assert.ok(patterns.floorCaution);
  assert.ok(calls.some(([name]) => name === 'stroke'));
});

test('renderiza a cena sem máscara global preta ou destination-out', () => {
  const assignments = [];
  const fills = [];
  const gradients = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    fillRect(...args) { fills.push(args); },
    strokeRect() {},
    fillText() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      const gradient = { addColorStop() {} };
      gradients.push(gradient);
      return gradient;
    },
    set globalCompositeOperation(value) {
      assignments.push(value);
    },
    get globalCompositeOperation() {
      return assignments.at(-1) ?? 'source-over';
    },
  };
  const patterns = { floorMetal: {}, floorCaution: {} };

  const bunker = createBunkerState({ player: { x: 10, y: 5 } });
  renderBunkerScene(ctx, bunker, { get: () => null }, { width: 320, height: 240 }, { x: 10, y: 5 }, patterns);

  assert.equal(assignments.includes('destination-out'), false);
  assert.ok(fills.length > 0);
  assert.ok(gradients.length >= 3);
});
