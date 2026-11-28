import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { HISTORY_LIMIT, advanceMissionTurn, conquerTerritory, continueBattle, expireMissionTurn, fortifyTerritory, logMissionEvent, mobilizeTroops, normalizeHistory, normalizeMissionMode, retreatBattle, revealMissionTurn, startMissionMatch } from '../src/core/mission_mode.js';
import { WarRoom } from '../src/core/war_online.js';
import { warScreenView } from '../src/ui/war_view.js';

function match({ attackers = 6, defenders = 3 } = {}) {
  const started = revealMissionTurn(startMissionMatch(createGameState('bra'), 2, ['Ana', 'Beto'], () => 0.37));
  const contacts = started.geopolitics.contacts.map((country) => ({ ...country, ownerId: country.id === 'arg' ? 'player-2' : country.id === 'bra' ? 'player-1' : country.ownerId }));
  return { ...started, country: { ...started.country, ownerId: 'player-1' }, geopolitics: { ...started.geopolitics, contacts }, world: contacts,
    missionMode: { ...started.missionMode, mobilizedThisTurn: 0, actionUsed: false, troopsByCountry: { ...started.missionMode.troopsByCountry, bra: attackers + 1, arg: defenders } } };
}
const types = (state) => state.missionMode.history.map((item) => item.type);

test('a partida comeca com um registro e cada jogada entra no historico, a mais nova primeiro', () => {
  const state = match();
  assert.equal(types(state).at(-1), 'info');
  const moved = mobilizeTroops(state, 'bra', 1);
  assert.equal(types(moved)[0], 'reinforce');
  assert.match(moved.missionMode.history[0].text, /Ana reforçou .* \(\+1\)/);
  const fortified = fortifyTerritory(moved, 'bra');
  assert.equal(types(fortified)[0], 'fortify');
  const fought = conquerTerritory(fortified, 'arg', 'bra', 5, () => 0.5, 2);
  const [first, ...rest] = fought.missionMode.history;
  assert.equal(first.type === 'battle' || first.type === 'conquest' || first.type === 'retreat', true);
  assert.ok(types(fought).includes('battle'));
  const battle = fought.missionMode.history.find((item) => item.type === 'battle');
  assert.match(battle.text, /Ana: .* → .* · dados \d( \d)* × \d( \d)* · perdas \d\/\d/);
  assert.ok(rest.length > 0);
});

test('conquista, recuo, troca de turno e tempo esgotado ficam registrados', () => {
  const scripted = (values) => { let i = 0; return () => values[i++] ?? 0.999; };
  let s = conquerTerritory(match({ attackers: 8, defenders: 1 }), 'arg', 'bra', 8, scripted([0, 0, 0, 0.999]), 3);
  assert.ok(types(s).includes('conquest'));
  assert.match(s.missionMode.history.find((item) => item.type === 'conquest').text, /Ana conquistou/);

  const open = conquerTerritory(match({ attackers: 5, defenders: 6 }), 'arg', 'bra', 5, () => 0.5);
  assert.ok(open.missionMode.activeBattle, 'batalha segue aberta');
  const retreated = retreatBattle(open);
  assert.equal(types(retreated)[0], 'retreat');

  const passed = advanceMissionTurn(match());
  assert.equal(types(passed)[0], 'turn');
  assert.match(passed.missionMode.history[0].text, /Rodada \d+: vez de Beto/);
  const expired = expireMissionTurn({ ...match(), missionMode: { ...match().missionMode, turnDeadline: Date.now() - 1 } });
  assert.deepEqual(types(expired).slice(0, 2), ['turn', 'timeout']);
  assert.match(expired.missionMode.history[1].text, /O tempo de Ana acabou/);
});

test('historico tem limite, sobrevive ao salvar e descarta lixo', () => {
  let s = match();
  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) s = logMissionEvent(s, 'info', `evento ${i}`);
  assert.equal(s.missionMode.history.length, HISTORY_LIMIT);
  assert.equal(s.missionMode.history[0].text, `evento ${HISTORY_LIMIT + 19}`);
  const reloaded = normalizeMissionMode(JSON.parse(JSON.stringify(s.missionMode)));
  assert.equal(reloaded.history.length, HISTORY_LIMIT);
  assert.deepEqual(normalizeHistory('x'), []);
  assert.deepEqual(normalizeHistory([{ text: 'ok', type: 'zzz', turn: -4 }, { nada: 1 }, null]), [{ turn: 1, type: 'info', playerId: null, text: 'ok' }]);
});

test('sala online envia o historico aos convidados sem expor missoes', () => {
  const room = new WarRoom(createGameState('bra'), 'Host', () => 0.3);
  room.join('Guest', 'a'.repeat(20));
  room.start();
  const snapshot = room.snapshot('player-2');
  assert.ok(snapshot.mode.history.length >= 1);
  assert.ok(snapshot.mode.history.every((item) => !/miss/i.test(item.text)));
});

test('tela: historico fica abaixo de Como jogar, recolhe e a animacao dos dados mostra um dado por lado', () => {
  const state = match();
  const html = warScreenView(mobilizeTroops(state, 'bra', 1), { selected: 'arg', attackSourceId: 'bra' });
  assert.ok(html.indexOf('war-rules') > 0 && html.indexOf('war-history') > html.indexOf('war-rules'), 'histórico depois de Como jogar');
  assert.match(html, /Histórico de jogadas/);
  assert.match(html, /Ana reforçou/);
  const collapsed = warScreenView(state, { historyCollapsed: true });
  assert.match(collapsed, /MOSTRAR/);
  assert.doesNotMatch(collapsed, /war-history-turn/);
  // seletor 1-2-3 e campo escondido que o jogo le ao atacar
  assert.equal((html.match(/data-dice-pick="/g) ?? []).length, 3);
  assert.match(html, /<input type="hidden" data-war-attack-dice value="3">/);
  // animacao: dados que travam um a um
  const rolling = warScreenView(state, { selected: 'arg', attackSourceId: 'bra', rolling: { attack: 3, defense: 2 } });
  assert.equal((rolling.match(/data-die-side="attack"/g) ?? []).length, 3);
  assert.equal((rolling.match(/data-die-side="defense"/g) ?? []).length, 2);
  assert.match(rolling, /data-action="war-skip-dice"/);
  // resultado: chips de perdas e dados com ordem de entrada
  const fought = conquerTerritory(state, 'arg', 'bra', 5, () => 0.5, 3);
  const after = warScreenView(fought, { selected: 'arg', attackSourceId: 'bra' });
  assert.match(after, /war-battle-chips/);
  assert.match(after, /style="--i:0"/);
  assert.match(after, /Defesa perdeu \d/);
});
