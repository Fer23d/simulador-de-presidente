import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState, transicionarParaWasteland } from '../src/core/game-state.js';
import { bunkerView } from '../src/ui/dashboard.js';
import { advanceWastelandMonth } from '../src/core/wasteland.js';
import {
  INITIAL_BUNKER_ROOMS,
  ROOM_TYPES,
  buildBunkerRoom,
  calculateBunkerCapacity,
  cartesianToIsometric,
  getBuildSlots,
  getRoomAt,
  moveIsometricActor,
  normalizeBunkerRooms,
  normalizeBunkerPlayer,
  repairBunkerGenerator,
  renderIsometricBunker,
  stepBunkerNpcs,
} from '../src/core/isometric_bunker.js';

test('projecao isometrica usa losangos com largura e altura independentes', () => {
  assert.deepEqual(cartesianToIsometric(3, 2, 80, 40), { x: 40, y: 100 });
});

test('o Vault comeca sozinho e pode expandir em quatro paredes externas', () => {
  assert.equal(INITIAL_BUNKER_ROOMS.length, 1);
  assert.equal(INITIAL_BUNKER_ROOMS[0].type, 'vault');
  assert.equal(getBuildSlots(INITIAL_BUNKER_ROOMS).length, 4);
  assert.equal(calculateBunkerCapacity(INITIAL_BUNKER_ROOMS), 3500);
});

test('compra dormitorio com sucata e conecta a nova sala pela porta central', () => {
  const state = { is_wasteland: true, scrap: 250, bunker_rooms: INITIAL_BUNKER_ROOMS };
  const built = buildBunkerRoom(state, 'dormitory', 'vault', 'east');

  assert.equal(built.scrap, 170);
  assert.equal(built.bunker_rooms.length, 2);
  assert.equal(getRoomAt(built.bunker_rooms, 5, 2)?.type, 'dormitory');
  assert.equal(calculateBunkerCapacity(built.bunker_rooms), 4000);
  assert.equal(moveIsometricActor({ x: 4, y: 2 }, 'd', built.bunker_rooms).x, 5);
  assert.deepEqual(moveIsometricActor({ x: 4, y: 1 }, 'd', built.bunker_rooms), { x: 4, y: 1 });
  assert.equal(getBuildSlots(built.bunker_rooms).length, 6);
  assert.equal(state.scrap, 250);
});

test('impede compras sem recursos, sobrepostas ou fora do Wasteland', () => {
  const state = { is_wasteland: true, scrap: 250, bunker_rooms: INITIAL_BUNKER_ROOMS };
  const first = buildBunkerRoom(state, 'generator', 'vault', 'east');
  assert.equal(first.scrap, 130);
  assert.equal(buildBunkerRoom(first, 'greenhouse', 'vault', 'east').bunker_rooms.length, 2);
  assert.equal(buildBunkerRoom({ ...state, scrap: 10 }, 'generator', 'vault', 'north').bunker_rooms.length, 1);
  assert.equal(buildBunkerRoom({ ...state, is_wasteland: false }, 'generator', 'vault', 'north').bunker_rooms.length, 1);
});

test('WASD percorre diagonais isometricas e respeita limites da sala', () => {
  assert.deepEqual(moveIsometricActor({ x: 2, y: 2 }, 'w', INITIAL_BUNKER_ROOMS), { x: 2, y: 1 });
  assert.deepEqual(moveIsometricActor({ x: 2, y: 2 }, 'a', INITIAL_BUNKER_ROOMS), { x: 1, y: 2 });
  assert.deepEqual(moveIsometricActor({ x: 0, y: 0 }, 'a', INITIAL_BUNKER_ROOMS), { x: 0, y: 0 });
  assert.equal(ROOM_TYPES.greenhouse.cost, 100);
});

test('NPCs percorrem apenas celulas caminhaveis e saves invalidos voltam ao Vault', () => {
  const rooms = normalizeBunkerRooms([{ id: 'vault', type: 'vault', x: 0, y: 0 }, { id: 'bad', type: 'generator', x: 500, y: 500 }]);
  assert.equal(rooms.length, 1);
  const npc = [{ id: 'resident', x: 4, y: 1, facing: 'down' }];
  const moved = stepBunkerNpcs(npc, rooms, () => .8);
  assert.equal(getRoomAt(rooms, moved[0].x, moved[0].y)?.id, 'vault');
});

test('as salas compradas persistem no save e aparecem no modo construcao', () => {
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  const built = buildBunkerRoom(wasteland, 'greenhouse', 'vault', 'north');
  const restored = hydrateGameState(JSON.stringify(built));
  assert.equal(restored.bunker_rooms.length, 2);
  assert.equal(restored.bunker_rooms[1].type, 'greenhouse');
  assert.match(bunkerView(restored), /data-action="bunker-build-mode"/);
  assert.match(bunkerView(restored), /data-module="generator"/);
  assert.match(bunkerView(restored), /id="bunker-build-slot"/);
  assert.match(bunkerView(restored), /data-action="bunker-place"/);
  assert.match(bunkerView(restored), /CAPACIDADE/);
});

test('a posicao do presidente persiste, mas saves com coordenadas invalidas regressam ao Vault', () => {
  const wasteland = transicionarParaWasteland(createGameState('bra'));
  const built = buildBunkerRoom(wasteland, 'dormitory', 'vault', 'east');
  const moved = { ...built, bunker_player: { x: 6, y: 2, facing: 'east' } };
  assert.deepEqual(hydrateGameState(JSON.stringify(moved)).bunker_player, moved.bunker_player);
  assert.deepEqual(normalizeBunkerPlayer({ x: 999, y: 999 }, built.bunker_rooms), { x: 2, y: 2, facing: 'south' });
});

test('o render desenha losangos e quatro pontos clicaveis de expansao', () => {
  let shapes = 0;
  const gradient = { addColorStop() {} };
  const ctx = {
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { shapes += 1; },
    stroke() {},
    arc() {},
    ellipse() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillText() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  const slots = renderIsometricBunker(ctx, INITIAL_BUNKER_ROOMS, { x: 2, y: 2, facing: 'south' }, [], { width: 960, height: 600 }, true);

  assert.ok(shapes > 25);
  assert.equal(slots.length, 4);
  assert.ok(slots.every((slot) => Number.isFinite(slot.screenX) && Number.isFinite(slot.screenY)));
});

test('estufa sustenta crescimento ate a capacidade e gerador recupera sucata mensal', () => {
  const wasteland = { ...transicionarParaWasteland(createGameState('bra')), scrap: 350 };
  const expanded = buildBunkerRoom(buildBunkerRoom(buildBunkerRoom(wasteland, 'dormitory', 'vault', 'east'), 'greenhouse', 'vault', 'north'), 'generator', 'vault', 'west');
  const idle = advanceWastelandMonth(expanded);
  assert.equal(idle.scrap, expanded.scrap + 25);
  const generatorId = expanded.bunker_rooms.find((room) => room.type === 'generator').id;
  const repaired = repairBunkerGenerator(expanded, generatorId);
  assert.equal(repaired.scrap, expanded.scrap - 25);
  assert.equal(repaired.bunker_rooms.find((room) => room.id === generatorId).operational, true);
  assert.equal(repairBunkerGenerator(repaired, generatorId).scrap, repaired.scrap);
  const month = advanceWastelandMonth(repaired);
  assert.equal(month.scrap, repaired.scrap + 40);
  assert.equal(month.country.populacao_base, expanded.country.populacao_base + 5);
  assert.ok(month.country.populacao_base <= calculateBunkerCapacity(month.bunker_rooms));
});
