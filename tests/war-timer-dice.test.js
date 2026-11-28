import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { advanceMissionTurn, conquerTerritory, expireMissionTurn, extendMissionDeadline, getCountryOwner, renewMissionDeadline, revealMissionTurn, startMissionMatch } from '../src/core/mission_mode.js';
import { WarRoom, applyWarSnapshot } from '../src/core/war_online.js';

function match(players = 3, { fortified = false, troops = {} } = {}) {
  const names = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Fabio'].slice(0, players);
  const started = revealMissionTurn(startMissionMatch(createGameState('bra'), players, names, () => 0.37));
  return { ...started, missionMode: { ...started.missionMode, fortifiedCountries: fortified ? { arg: true } : {}, troopsByCountry: { ...started.missionMode.troopsByCountry, ...troops } } };
}

// Gerador deterministico (mulberry32) para medir as probabilidades sem flutuar entre execucoes.
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const duelBases = new Map();
function duel(attackers, defenders, fortified, random) {
  const key = [attackers, defenders, fortified].join('-');
  if (!duelBases.has(key)) {
    const state = match(2, { fortified, troops: { bra: attackers + 1, arg: defenders } });
    const contacts = state.geopolitics.contacts.map((c) => ({ ...c, ownerId: c.id === 'arg' ? 'player-2' : 'player-1' }));
    duelBases.set(key, { ...state, country: { ...state.country, ownerId: 'player-1' }, geopolitics: { ...state.geopolitics, contacts }, world: contacts });
  }
  return conquerTerritory(duelBases.get(key), 'arg', 'bra', attackers, random).missionMode.lastBattle;
}

test('dados do War: distribuicao igual a do Risk classico (3 contra 2)', () => {
  const random = seeded(7);
  const N = 20000;
  let defLosses2 = 0; let split = 0; let attLosses2 = 0;
  for (let i = 0; i < N; i += 1) {
    const r = duel(3, 2, false, random);
    if (r.defenderLosses === 2) defLosses2 += 1; else if (r.attackerLosses === 2) attLosses2 += 1; else split += 1;
  }
  // Teoria: 37,17% / 33,58% / 29,26%.
  assert.ok(Math.abs(defLosses2 / N - 0.3717) < 0.016, `defensor perde 2: ${defLosses2 / N}`);
  assert.ok(Math.abs(split / N - 0.3358) < 0.016, `1 para cada: ${split / N}`);
  assert.ok(Math.abs(attLosses2 / N - 0.2926) < 0.016, `atacante perde 2: ${attLosses2 / N}`);
});

test('dados do War: 1 contra 1 e empate favorecendo a defesa (41,7% de vitoria do ataque)', () => {
  const random = seeded(11);
  const N = 20000;
  let wins = 0;
  for (let i = 0; i < N; i += 1) if (duel(1, 1, false, random).defenderLosses === 1) wins += 1;
  assert.ok(Math.abs(wins / N - 15 / 36) < 0.016, `ataque vence 1x1: ${wins / N}`);
});

test('fortificacao: +1 so no melhor dado da defesa (efeito moderado, nao dobra a defesa)', () => {
  const random = seeded(5);
  const N = 15000;
  let normal = 0; let fort = 0;
  for (let i = 0; i < N; i += 1) {
    if (duel(3, 2, false, random).defenderLosses === 2) normal += 1;
    if (duel(3, 2, true, random).defenderLosses === 2) fort += 1;
  }
  assert.ok(fort < normal, 'fortificar ajuda a defesa');
  // Antes (+1 em cada dado) o ataque so vencia ambas as rodadas em ~19%; agora fica por volta de 28%.
  assert.ok(fort / N > 0.23 && fort / N < 0.33, `ataque vence 2 dados fortificado: ${fort / N}`);
  // O segundo dado da defesa nunca recebe bonus.
  const sample = duel(3, 2, true, () => 0);
  assert.deepEqual(sample.defenseDice, [6, 6]);
  const second = duel(3, 2, true, seeded(1));
  assert.ok(second.defenseDice.every((d) => d >= 1 && d <= 6));
});

test('cronometro estourado: passa o turno, avisa de quem era o tempo e renova o prazo', () => {
  const state = match(3);
  const expired = { ...state, missionMode: { ...state.missionMode, turnDeadline: Date.now() - 1000 } };
  const out = expireMissionTurn(expired);
  assert.notEqual(out.missionMode.currentPlayerId, state.missionMode.currentPlayerId);
  assert.match(out.notice, /O tempo de Ana acabou\./);
  assert.ok(out.missionMode.handoffRequired, 'partida local pede para passar o aparelho');
  const revealed = revealMissionTurn(out);
  assert.ok(revealed.missionMode.turnDeadline > Date.now() + 50_000, 'prazo do proximo jogador renovado');
});

test('cronometro estourado no meio de uma batalha: as tropas recuam e nada se perde', () => {
  const state = match(2, { troops: { bra: 6, arg: 3 } });
  const contacts = state.geopolitics.contacts.map((c) => ({ ...c, ownerId: c.id === 'arg' ? 'player-2' : 'player-1' }));
  let s = { ...state, country: { ...state.country, ownerId: 'player-1' }, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
  s = conquerTerritory(s, 'arg', 'bra', 5, () => 0.5);
  assert.ok(s.missionMode.activeBattle, 'batalha em andamento');
  const total = (m) => Object.values(m.troopsByCountry).reduce((a, b) => a + b, 0);
  const before = total(s.missionMode);
  const out = expireMissionTurn({ ...s, missionMode: { ...s.missionMode, turnDeadline: Date.now() - 1 } });
  assert.equal(out.missionMode.activeBattle, null);
  assert.notEqual(out.missionMode.currentPlayerId, s.missionMode.currentPlayerId);
  assert.equal(total(out.missionMode), before + s.missionMode.activeBattle.attackingRemaining, 'sobreviventes voltaram para a origem');
  assert.equal(getCountryOwner(out, 'arg'), 'player-2');
});

test('o cronometro nao corre parado: prazo e adiado e save antigo ganha relogio novo', () => {
  const state = match(2);
  const old = { ...state, missionMode: { ...state.missionMode, turnDeadline: Date.now() - 3_600_000 } };
  const renewed = renewMissionDeadline(old);
  assert.ok(renewed.missionMode.turnDeadline > Date.now() + 50_000, 'save de horas atras nao passa o turno sozinho');
  const deadline = state.missionMode.turnDeadline;
  assert.equal(extendMissionDeadline(state, 5000).missionMode.turnDeadline, deadline + 5000);
  assert.equal(extendMissionDeadline(state, 0), state);
  assert.equal(renewMissionDeadline({ ...state, missionMode: { ...state.missionMode, handoffRequired: true } }).missionMode.handoffRequired, true);
});

test('jogador eliminado e pulado quando o tempo acaba; jogo terminado nao muda', () => {
  const state = match(3);
  const contacts = state.geopolitics.contacts.map((c) => ({ ...c, ownerId: c.ownerId === 'player-2' ? 'player-3' : c.ownerId }));
  const withoutBeto = { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts, missionMode: { ...state.missionMode, currentPlayerId: 'player-1' } };
  assert.equal(advanceMissionTurn(withoutBeto).missionMode.currentPlayerId, 'player-3');
  const finished = { ...state, missionMode: { ...state.missionMode, finished: true } };
  assert.equal(expireMissionTurn(finished), finished);
});

test('sala online: o convidado recebe o tempo restante e nao o horario do anfitriao', () => {
  const room = new WarRoom(createGameState('bra'), 'Host', seeded(3));
  room.join('Guest', 'a'.repeat(20));
  room.start();
  room.state = { ...room.state, missionMode: { ...room.state.missionMode, turnDeadline: Date.now() + 42_000 } };
  const snap = room.snapshot('player-2');
  assert.ok(snap.mode.turnRemainingMs > 40_000 && snap.mode.turnRemainingMs <= 42_000);
  const skewed = { ...snap, mode: { ...snap.mode, turnDeadline: 1 } };
  const guest = applyWarSnapshot(createGameState('bra'), skewed);
  assert.ok(guest.missionMode.turnDeadline > Date.now() + 38_000, 'relogio do convidado nao depende do relogio do anfitriao');
});
