import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { WarRoom, BOT_TAKEOVER_MS } from '../src/core/war_online.js';
import { stepBotTurn } from '../src/core/war_ai.js';
import { warScreenView } from '../src/ui/war_view.js';

const TOKEN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TOKEN_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function startedRoom(players = 2) {
  const clock = { t: 1_000_000 };
  const room = new WarRoom(createGameState('bra'), 'Ana', () => 0.3, () => clock.t);
  room.join('Bruno', TOKEN_B);
  if (players > 2) room.join('Caio', TOKEN_C);
  room.start();
  return { room, clock };
}

test('jogador que cai pausa a partida; so apos 60 s um bot assume', () => {
  const { room, clock } = startedRoom();
  room.disconnect('player-2');
  assert.equal(room.isPaused(), true);
  assert.equal(room.snapshot('player-1').paused, true);
  assert.equal(room.takeoverIn(), 60);
  assert.throws(() => room.command('player-1', { action: 'end-turn', revision: room.revision }), /pausada/);

  clock.t += BOT_TAKEOVER_MS - 1000;
  assert.equal(room.tick(), false, 'ainda dentro do prazo');
  assert.equal(room.takeoverIn(), 1);
  clock.t += 1000;
  assert.equal(room.tick(), true);
  assert.equal(room.isPaused(), false, 'com o bot no lugar a partida segue');
  assert.equal(room.takeoverIn(), null);
  const snap = room.snapshot('player-1');
  assert.equal(snap.mode.players.find((p) => p.id === 'player-2').isBot, true);
  assert.equal(snap.members.find((m) => m.id === 'player-2').bot, true);
  assert.match(room.state.notice, /Bruno perdeu a conexão/);
  assert.equal(room.tick(), false, 'nao assume duas vezes');
});

test('o bot joga o turno do ausente e passa a vez; quem esta presente continua jogando', () => {
  const { room, clock } = startedRoom();
  room.disconnect('player-2');
  clock.t += BOT_TAKEOVER_MS;
  room.tick();
  room.command('player-1', { action: 'end-turn', revision: room.revision });
  assert.equal(room.state.missionMode.currentPlayerId, 'player-2');
  assert.equal(room.hasBotTurn(), true);
  let steps = 0;
  while (room.hasBotTurn() && steps < 40) { room.stepBot(); steps += 1; }
  assert.equal(room.state.missionMode.currentPlayerId, 'player-1', 'o bot terminou e devolveu a vez');
  assert.equal(room.hasBotTurn(), false);
});

test('quem volta (mesmo token) retoma o comando e o bot sai; voltar cedo nem aciona o bot', () => {
  const { room, clock } = startedRoom();
  room.disconnect('player-2');
  clock.t += 10_000;
  assert.equal(room.join('Bruno', TOKEN_B), 'player-2');
  assert.equal(room.isPaused(), false);
  clock.t += BOT_TAKEOVER_MS;
  assert.equal(room.tick(), false, 'voltou antes: sem bot');

  room.disconnect('player-2');
  clock.t += BOT_TAKEOVER_MS;
  room.tick();
  assert.equal(room.state.missionMode.players[1].isBot, true);
  assert.equal(room.join('Bruno', TOKEN_B), 'player-2');
  assert.equal(room.state.missionMode.players[1].isBot, false);
  assert.match(room.state.notice, /Bruno voltou e retomou o comando/);
  assert.throws(() => room.join('Intruso', 'dddddddd-dddd-dddd-dddd-dddddddddddd'), /já começou/);
});

test('com tres jogadores, so o ausente vira bot; o outro segue conectado', () => {
  const { room, clock } = startedRoom(3);
  room.disconnect('player-3');
  clock.t += BOT_TAKEOVER_MS;
  room.tick();
  assert.equal(room.state.missionMode.players.map((p) => p.isBot).join(), 'false,false,true');
  assert.equal(room.isPaused(), false);
});

test('stepBotTurn aceita partidas online e a tela mostra a contagem para o bot assumir', () => {
  const { room } = startedRoom();
  room.state = { ...room.state, missionMode: { ...room.state.missionMode, currentPlayerId: 'player-2', players: room.state.missionMode.players.map((p) => (p.id === 'player-2' ? { ...p, isBot: true } : p)) } };
  const next = stepBotTurn(room.state, () => 0.3);
  assert.notEqual(next, room.state);
  room.disconnect('player-2');
  const snap = room.snapshot('player-1');
  const html = warScreenView(room.state, { online: { ...snap, host: true, status: 'connected', playerId: 'player-1' } });
  assert.match(html, /bot assume em 60s/);
});
