import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { conquerTerritory, continueBattle, normalizeMissionMode, revealMissionTurn, startMissionMatch } from '../src/core/mission_mode.js';
import { clampDice, getBattleOdds, roundOutcomes } from '../src/core/war_odds.js';
import { WarRoom } from '../src/core/war_online.js';
import { WAR_ADJACENCY } from '../src/data/war_adjacency.js';
import { battleOddsHtml, warScreenView } from '../src/ui/war_view.js';

const near = (value, expected, tolerance = 1e-9) => assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);

function battleState({ attackers = 5, defenders = 3, fortified = false } = {}) {
  const started = revealMissionTurn(startMissionMatch(createGameState('bra'), 2, ['Você', 'Rival'], () => 0.37));
  const contacts = started.geopolitics.contacts.map((country) => ({ ...country, ownerId: country.id === 'arg' ? 'player-2' : 'player-1' }));
  return { ...started, country: { ...started.country, ownerId: 'player-1' }, geopolitics: { ...started.geopolitics, contacts }, world: contacts,
    missionMode: { ...started.missionMode, troopsByCountry: { ...started.missionMode.troopsByCountry, bra: attackers + 1, arg: defenders }, fortifiedCountries: fortified ? { arg: true } : {} } };
}

test('rodada: probabilidades exatas do Risk (3x2, 2x1, 1x1)', () => {
  const get = (list, a, d) => list.find((item) => item.attackerLosses === a && item.defenderLosses === d)?.p ?? 0;
  const r32 = roundOutcomes(3, 2, false);
  near(get(r32, 0, 2), 2890 / 7776);
  near(get(r32, 1, 1), 2611 / 7776);
  near(get(r32, 2, 0), 2275 / 7776);
  near(roundOutcomes(1, 1, false).find((item) => item.defenderLosses === 1).p, 15 / 36);
  near(roundOutcomes(2, 1, false).find((item) => item.defenderLosses === 1).p, 125 / 216);
  for (const list of [r32, roundOutcomes(2, 2, true), roundOutcomes(3, 1, true)]) near(list.reduce((sum, item) => sum + item.p, 0), 1);
});

test('chance de conquistar: casos conhecidos, fortificacao e numero de dados', () => {
  near(getBattleOdds({ attacking: 1, defending: 1, diceCount: 3 }).win, 15 / 36);
  assert.equal(getBattleOdds({ attacking: 4, defending: 0 }).win, 1);
  assert.equal(getBattleOdds({ attacking: 0, defending: 3 }).win, 0);
  const normal = getBattleOdds({ attacking: 8, defending: 4, diceCount: 3 });
  const fortified = getBattleOdds({ attacking: 8, defending: 4, fortified: true, diceCount: 3 });
  const oneDie = getBattleOdds({ attacking: 8, defending: 4, diceCount: 1 });
  assert.ok(fortified.win < normal.win, 'fortificar reduz a chance');
  assert.ok(oneDie.win < normal.win, 'menos dados reduzem a chance de conquistar');
  assert.ok(oneDie.expectedAttackerLosses > 0 && normal.expectedSurvivors <= 8);
  assert.equal(clampDice(5, 2), 2);
  assert.equal(clampDice(0, 9), 1);
  assert.equal(clampDice(null, 9), 3);
});

test('o calculo exato bate com a simulacao do proprio jogo (6 contra 4)', () => {
  let seed = 123456789;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const base = battleState({ attackers: 6, defenders: 4 });
  let wins = 0;
  const N = 3000;
  for (let i = 0; i < N; i += 1) {
    let s = conquerTerritory(base, 'arg', 'bra', 6, random);
    while (s.missionMode.activeBattle) s = continueBattle(s, random);
    if (s.missionMode.lastBattle.won) wins += 1;
  }
  const exact = getBattleOdds({ attacking: 6, defending: 4, diceCount: 3 }).win;
  assert.ok(Math.abs(wins / N - exact) < 0.035, `simulado ${wins / N} vs exato ${exact}`);
});

test('escolher 1, 2 ou 3 dados de ataque vale na primeira rodada e ao continuar', () => {
  const base = battleState({ attackers: 5, defenders: 4 });
  const one = conquerTerritory(base, 'arg', 'bra', 5, () => 0.5, 1);
  assert.equal(one.missionMode.lastBattle.attackDice.length, 1);
  assert.equal(one.missionMode.activeBattle.diceCount, 1);
  const two = continueBattle(one, () => 0.5, 2);
  assert.equal(two.missionMode.lastBattle.attackDice.length, 2);
  assert.equal(two.missionMode.activeBattle?.diceCount ?? 2, 2);
  const keep = continueBattle(two, () => 0.5);
  assert.equal(keep.missionMode.lastBattle.attackDice.length, 2, 'sem escolha nova, mantem a anterior');
  const full = conquerTerritory(base, 'arg', 'bra', 5, () => 0.5);
  assert.equal(full.missionMode.lastBattle.attackDice.length, 3, 'padrao: maximo de dados');
  const few = conquerTerritory(battleState({ attackers: 1, defenders: 3 }), 'arg', 'bra', 1, () => 0.5, 3);
  assert.equal(few.missionMode.lastBattle.attackDice.length, 1, 'nao rola mais dados que tropas');
  const bogus = conquerTerritory(base, 'arg', 'bra', 5, () => 0.5, 9);
  assert.equal(bogus.missionMode.lastBattle.attackDice.length, 3);
});

test('o numero de dados sobrevive ao salvar e a sala online repassa a escolha', () => {
  const battle = conquerTerritory(battleState({ attackers: 5, defenders: 4 }), 'arg', 'bra', 5, () => 0.5, 2);
  const reloaded = normalizeMissionMode(JSON.parse(JSON.stringify(battle.missionMode)));
  assert.equal(reloaded.activeBattle.diceCount, 2);
  const room = new WarRoom(createGameState('bra'), 'Host', () => 0.5);
  room.join('Guest', 'a'.repeat(20));
  room.start();
  const mode = room.state.missionMode;
  const [sourceId, targetId] = (() => {
    const owner = (id) => room.state.geopolitics.contacts.find((c) => c.id === id)?.ownerId;
    for (const [target, origins] of Object.entries(WAR_ADJACENCY)) { const source = origins.find((o) => owner(o) === mode.currentPlayerId && owner(target) !== mode.currentPlayerId); if (source) return [source, target]; }
    return [];
  })();
  room.state = { ...room.state, missionMode: { ...mode, troopsByCountry: { ...mode.troopsByCountry, [sourceId]: 6 } } };
  room.command(mode.currentPlayerId === 'player-1' ? 'player-1' : 'player-2', { action: 'attack', targetId, sourceId, amount: 4, dice: 1, revision: room.revision });
  assert.equal(room.state.missionMode.lastBattle.attackDice.length, 1);
});

test('tela do War: mostra as chances, a escolha de dados e os pares de dados com bonus de fortificacao', () => {
  const state = battleState({ attackers: 5, defenders: 3, fortified: true });
  const html = warScreenView(state, { selected: 'arg', attackSourceId: 'bra' });
  assert.match(html, /data-war-attack-dice/);
  assert.match(html, /data-war-odds/);
  assert.match(html, /Chance de conquistar/);
  const fought = conquerTerritory(state, 'arg', 'bra', 5, () => 0.5, 3);
  const after = warScreenView(fought, { selected: 'arg', attackSourceId: 'bra' });
  assert.match(after, /war-die is-(win|loss)/);
  assert.match(after, /\d\+1/, 'mostra o +1 da fortificacao no dado da defesa');
  assert.match(after, /data-war-continue-dice/);
  assert.match(battleOddsHtml(3, 0, false, 3), /conquista garantida/);
  assert.match(battleOddsHtml(0, 3, false, 3), /Envie ao menos 1 tropa/);
});

