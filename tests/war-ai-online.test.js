import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { allCountries, startMissionMatch, advanceMissionTurn, getCountryRegion, territoryCounts } from '../src/core/mission_mode.js';
import { chooseBotTarget, stepBotTurn, createBotRunner } from '../src/core/war_ai.js';
import { WarRoom, applyWarSnapshot } from '../src/core/war_online.js';
import { warScreenView } from '../src/ui/war_view.js';

const botGame = (difficulty = 'hard') => advanceMissionTurn(startMissionMatch(createGameState('bra'), 3, ['Você', 'Bot 1', 'Bot 2'], () => .3, { playStyle: 'bots', difficulty }));
const newRoom = () => {
  const room = new WarRoom(createGameState('bra'), 'Ana', () => .1);
  room.join('Bruno', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  return room;
};

test('all three AI difficulties persist, act once and never require hotseat handoff', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const state = botGame(difficulty);
    assert.equal(state.missionMode.handoffRequired, false);
    const saved = hydrateGameState(JSON.stringify(state));
    assert.equal(saved.missionMode.difficulty, difficulty);
    assert.equal(saved.missionMode.players[1].isBot, true);
    const next = stepBotTurn(saved, () => 0);
    assert.equal(next.missionMode.actionUsed, true);
    assert.equal(next.missionMode.lastBattle.roll, 6);
    const ended = stepBotTurn(next);
    assert.equal(ended.missionMode.currentPlayerId, 'player-3');
    assert.equal(ended.missionMode.handoffRequired, false);
    assert.equal(saved.missionMode.actionUsed, false);
    assert.deepEqual(territoryCounts(saved), territoryCounts(state));
  }
});

test('easy chooses any legal target; medium and hard focus their own region without reading rival missions', () => {
  for (const difficulty of ['medium', 'hard']) {
    const state = botGame(difficulty);
    state.missionMode.players[1].mission = { kind: 'region', regionId: 'europe' };
    for (const player of state.missionMode.players.filter((p) => p.id !== 'player-2')) {
      Object.defineProperty(player, 'mission', { get() { throw new Error('Secret mission accessed'); } });
    }
    assert.equal(getCountryRegion(chooseBotTarget(state, () => .5)), 'europe');
  }
  const easy = botGame('easy');
  const targets = allCountries(easy).filter((country) => country.ownerId !== 'player-2');
  assert.equal(chooseBotTarget(easy, () => 0), targets[0].id);
  const failed = stepBotTurn(easy, () => .99);
  assert.equal(failed.missionMode.lastBattle.roll, 1);
  assert.equal(failed.missionMode.lastBattle.won, false);
});

test('AI runner cancels old timers and cannot play while paused or overwrite newer state', () => {
  let state = botGame(), paused = false, nextId = 0, commits = 0;
  const timers = new Map();
  const runner = createBotRunner({ getState: () => state, isPaused: () => paused,
    commit: (next) => { state = next; commits++; },
    schedule: (fn) => { timers.set(++nextId, fn); return nextId; }, cancel: (id) => timers.delete(id) });
  runner.sync(); runner.sync();
  assert.equal(timers.size, 1);
  paused = true; runner.sync();
  assert.equal(timers.size, 0);
  paused = false; runner.sync();
  const callback = [...timers.values()][0];
  state = { ...state, notice: 'new' };
  callback();
  assert.equal(commits, 0);
  runner.stop();
});

test('bot turn UI reveals the human mission, never the acting bot mission', () => {
  const state = botGame();
  state.missionMode.players[0].mission = { kind: 'territories', target: 60, title: 'HUMAN SECRET', description: 'HUMAN DESCRIPTION' };
  state.missionMode.players[1].mission = { kind: 'territories', target: 70, title: 'BOT SECRET', description: 'BOT DESCRIPTION' };
  const html = warScreenView(state, { missionVisible: true });
  assert.ok(html.includes('HUMAN SECRET'));
  assert.ok(!html.includes('BOT SECRET'));
  assert.match(html, /data-action="mission-mode-end-turn" disabled/);
});

test('room requires 2–6 authenticated seats, rejects unknown tokens and duplicate live connections', () => {
  const room = new WarRoom(createGameState(), 'Ana');
  assert.throws(() => room.start());
  assert.throws(() => room.join('x', '<invalid>'));
  for (let i = 2; i <= 6; i++) room.join('Player ' + i, ('token' + i).repeat(4));
  assert.throws(() => room.join('Extra', 'extratoken'.repeat(3)));
  assert.throws(() => room.join('Again', 'token2'.repeat(4)));
  room.start();
  assert.equal(room.state.missionMode.players.length, 6);
  assert.equal(room.state.missionMode.handoffRequired, false);
  assert.throws(() => room.join('Extra', 'newtoken'.repeat(3)));
});

test('snapshots send only the recipient mission; tokens and campaign state never leave host', () => {
  const room = newRoom();
  room.start();
  const snapshot = room.snapshot('player-2');
  assert.equal(snapshot.mode.players[0].mission.kind, 'secret');
  assert.deepEqual(snapshot.mode.players[1].mission, room.state.missionMode.players[1].mission);
  assert.equal(JSON.stringify(snapshot).includes('bbbbbbbb'), false);
  assert.equal(snapshot.economy, undefined);
  assert.equal(Object.keys(snapshot.owners).length, 100);
  assert.throws(() => room.snapshot('outsider'));
  const base = createGameState('bra');
  const next = applyWarSnapshot(base, snapshot);
  assert.deepEqual(territoryCounts(next), territoryCounts(room.state));
  assert.equal(base.missionMode.active, false);
});

test('authority rejects forged identity, double rolls, stale revisions and illegal targets', () => {
  const room = newRoom(); room.start();
  const targetId = allCountries(room.state).find((country) => country.ownerId === 'player-2').id;
  const command = { action: 'attack', targetId, revision: room.revision };
  assert.throws(() => room.command('player-2', command), /turno/);
  assert.throws(() => room.command('player-1', { ...command, targetId: 'not-a-country' }));
  room.command('player-1', command);
  assert.throws(() => room.command('player-1', command), /mudou/);
  assert.throws(() => room.command('player-1', { ...command, revision: room.revision }));
  room.command('player-1', { action: 'end-turn', revision: room.revision });
  assert.equal(room.state.missionMode.currentPlayerId, 'player-2');
});

test('disconnect pauses play; same token reconnects to same mission and current turn', () => {
  const room = newRoom(); room.start();
  const mission = room.snapshot('player-2').mode.players[1].mission;
  room.disconnect('player-2');
  assert.equal(room.snapshot('player-1').paused, true);
  assert.throws(() => room.command('player-1', { action: 'end-turn', revision: room.revision }), /pausada/);
  assert.equal(room.join('Bruno again', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'player-2');
  assert.deepEqual(room.snapshot('player-2').mode.players[1].mission, mission);
  assert.equal(room.snapshot('player-1').paused, false);
});

test('lobby departures leave correct ownership and elimination targets when remaining seats are not consecutive', () => {
  const room = newRoom();
  room.join('Carla', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  room.disconnect('player-2'); room.start();
  assert.deepEqual(room.state.missionMode.players.map((p) => p.id), ['player-1', 'player-3']);
  assert.deepEqual(Object.keys(territoryCounts(room.state)), ['player-1', 'player-3']);
  assert.equal(territoryCounts(room.state)['player-3'], 50);
  for (const player of room.state.missionMode.players) {
    if (player.mission.kind === 'eliminate') assert.notEqual(player.mission.targetPlayerId, 'player-2');
  }
});

test('online views escape names, preserve own mission during rival turn and disable out-of-turn controls', () => {
  const room = newRoom(); room.seats[1].name = '<script>evil</script>'; room.start();
  const snap = room.snapshot('player-2');
  const html = warScreenView(applyWarSnapshot(createGameState('bra'), snap), {
    missionVisible: true, online: { ...snap, status: 'connected', host: false },
  });
  assert.ok(html.includes('&lt;script&gt;evil&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-action="mission-mode-end-turn" disabled/);
  assert.ok(html.includes(snap.mode.players[1].mission.title));
});
