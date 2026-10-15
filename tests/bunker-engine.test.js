import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNKER_MAP,
  createBunkerState,
  getInteractionPrompt,
  moveBunkerPlayer,
} from '../src/core/bunker_engine.js';

test('cria um bunker 20x20 com o sobrevivente em uma célula caminhável', () => {
  const bunker = createBunkerState();

  assert.equal(BUNKER_MAP.length, 20);
  assert.equal(BUNKER_MAP.every((row) => row.length === 20), true);
  assert.deepEqual(bunker.player, { x: 10, y: 10 });
  assert.equal(BUNKER_MAP[bunker.player.y][bunker.player.x], 1);
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
