import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AssetManager,
  BUNKER_MAP,
  createBunkerState,
  getCameraOffset,
  getInteractionPrompt,
  moveBunkerPlayer,
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
