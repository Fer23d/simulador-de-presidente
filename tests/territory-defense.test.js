import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, enviarTropas, hydrateGameState, mudarSedeDoGoverno, pedirReforcos } from '../src/core/game-state.js';
import { getCapitalId, getDeployed, getTerritoryLoyalty } from '../src/core/deployments.js';
import { distanceKm, getReinforcementStatus, getSupply, travelMonths } from '../src/core/offensives.js';
import {
  ATTACK_COOLDOWN_MONTHS, EXPEDITION_SHARE, describeThreat, getAttackChance, getAttackers, getDefenseScore, processTerritoryThreats,
} from '../src/core/territory_defense.js';
import { CAPITAL_COOLDOWN, getCapitalStatus, processCapital } from '../src/core/capital.js';
import { troopsAbroadPanel, diplomacyMap } from '../src/ui/dashboard.js';

const mapContacts = (state, fn) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map(fn) } });
const contactOf = (state, id) => state.geopolitics.contacts.find((c) => c.id === id);

// Chile anexado; so a Argentina e hostil (poder configuravel); todos os outros sao amigaveis.
function setup({ contingents = 5, attackerPower = 6, month = 20 } = {}) {
  let state = { ...createGameState('bra'), monthCounter: month };
  state = mapContacts(state, (c) => {
    if (c.id === 'chl') return { ...c, anexado: true, destruido: true, militaryPower: 0 };
    if (c.id === 'arg') return { ...c, relation: -50, militaryPower: attackerPower, alliance: false };
    return { ...c, relation: 80, militaryPower: Math.min(c.militaryPower, 4) };
  });
  state.world = state.geopolitics.contacts;
  for (let i = 0; i < contingents; i += 1) state = enviarTropas(state, 'chl');
  return state;
}

// Primeiro mes (a partir do dado) em que o ataque acontece.
function firstAttack(state, from = 20, to = 800) {
  for (let month = from; month < to; month += 1) {
    const result = processTerritoryThreats({ ...state, monthCounter: month });
    if (result.territories.chl?.lastAttack === month || !contactOf(result, 'chl').anexado) return { result, month };
  }
  return null;
}

test('so territorios anexados com inimigos por perto sofrem ataques; aliados e fantoches nao atacam', () => {
  const state = setup();
  const attackers = getAttackers(state, 'chl');
  assert.deepEqual(attackers.map((a) => a.id), ['arg']);
  assert.ok(getAttackChance(state, 'chl') > 0);
  const allied = mapContacts(state, (c) => (c.id === 'arg' ? { ...c, alliance: true } : c));
  assert.equal(getAttackChance(allied, 'chl'), 0);
  const puppet = mapContacts(state, (c) => (c.id === 'arg' ? { ...c, puppet: true, is_puppet_of: 'jogador' } : c));
  assert.equal(getAttackers(puppet, 'chl').length, 0);
  const tense = { ...state, global_defcon: 2 };
  assert.ok(getAttackChance(tense, 'chl') > getAttackChance(state, 'chl'));
  assert.equal(describeThreat(0), 'nenhum');
  assert.match(describeThreat(0.2), /alto/);
});

test('sem fase de graca nos primeiros meses e com intervalo entre ataques ao mesmo territorio', () => {
  const state = setup({ month: 3 });
  for (let month = 0; month < 6; month += 1) assert.equal(processTerritoryThreats({ ...state, monthCounter: month }).territories.chl?.lastAttack, undefined);
  const hit = firstAttack(setup());
  assert.ok(hit);
  for (let month = hit.month + 1; month < hit.month + ATTACK_COOLDOWN_MONTHS; month += 1) {
    const again = processTerritoryThreats({ ...hit.result, monthCounter: month });
    assert.equal(again.territories.chl.lastAttack, hit.month, 'ainda no intervalo');
  }
});

test('guarnicao forte repele o ataque: inimigo perde poder, a base ganha lealdade e perde poucas tropas', () => {
  const state = setup({ contingents: 5, attackerPower: 6 });
  const before = getDeployed(state, 'chl');
  const hit = firstAttack(state);
  assert.ok(hit);
  const { result } = hit;
  assert.match(result.notice, /repelido/);
  assert.ok(contactOf(result, 'arg').militaryPower < 6, 'o atacante sofre dano');
  assert.ok(getTerritoryLoyalty(result, 'chl') > getTerritoryLoyalty(state, 'chl'));
  assert.equal(getDeployed(result, 'chl').soldiers, before.soldiers - Math.floor(before.soldiers * 0.04));
  assert.equal(contactOf(result, 'chl').anexado, true);
  assert.equal(result.defconPeacefulMonths, 0);
});

test('derrota parcial: a guarnicao sofre baixas e perde lealdade, mas a base resiste', () => {
  const base = setup({ contingents: 5, attackerPower: 6 });
  const defense = getDefenseScore(base, 'chl').score;
  const km = distanceKm('arg', 'chl');
  const power = (defense * 1.3) / (EXPEDITION_SHARE * getSupply(km));
  const state = mapContacts(base, (c) => (c.id === 'arg' ? { ...c, militaryPower: power } : c));
  const before = getDeployed(state, 'chl');
  const hit = firstAttack(state);
  assert.ok(hit);
  assert.match(hit.result.notice, /sofreu baixas/);
  assert.equal(contactOf(hit.result, 'chl').anexado, true);
  assert.ok(getDeployed(hit.result, 'chl').soldiers < before.soldiers * 0.9);
  assert.ok(getTerritoryLoyalty(hit.result, 'chl') < getTerritoryLoyalty(state, 'chl'));
});

test('derrota total: o territorio se liberta, volta a ter dados proprios e sobreviventes retornam', () => {
  const state = setup({ contingents: 1, attackerPower: 95 });
  const armyBefore = state.military.exercito.soldados;
  const hit = firstAttack(state);
  assert.ok(hit);
  const lost = contactOf(hit.result, 'chl');
  assert.equal(lost.anexado, false);
  assert.equal(lost.destruido, false);
  assert.ok(lost.pib_base > 0 && lost.population > 0, 'dados restaurados');
  assert.equal(lost.relation, -80);
  assert.equal(hit.result.deployments.chl, undefined);
  assert.equal(hit.result.territories.chl, undefined);
  assert.ok(!hit.result.geopolitics.annexedCountryIds.includes('chl'));
  assert.ok(hit.result.military.exercito.soldados > armyBefore - getDeployed(state, 'chl').soldiers, 'metade dos sobreviventes volta para casa');
  assert.match(hit.result.notice, /perdido para Argentina/);
});

test('se a sede do governo estiver no territorio, perde-la e uma crise', () => {
  let state = setup({ contingents: 5, attackerPower: 95 });
  state = { ...state, territories: { chl: { loyalty: 70 } } };
  const moved = mudarSedeDoGoverno(state, 'chl');
  assert.equal(moved.capitalId, 'chl');
  const weak = { ...moved, deployments: { chl: { soldiers: 300, armor: 0, since: 20 } } };
  const hit = firstAttack(weak);
  assert.ok(hit);
  assert.equal(hit.result.capitalId, null);
  assert.match(hit.result.notice, /sede do governo caiu/);
  assert.ok(hit.result.regime.unrest > weak.regime.unrest + 15);
  assert.ok(hit.result.economy.cash < weak.economy.cash);
});

test('mudar a sede: exige territorio anexado, lealdade, guarnicao e respeita o intervalo', () => {
  const state = { ...setup(), territories: { chl: { loyalty: 70 } } };
  assert.equal(getCapitalStatus(state, 'arg').available, false, 'so territorio anexado');
  assert.equal(getCapitalStatus({ ...state, territories: { chl: { loyalty: 30 } } }, 'chl').available, false);
  assert.match(getCapitalStatus({ ...state, territories: { chl: { loyalty: 30 } } }, 'chl').reason, /Lealdade/);
  assert.match(getCapitalStatus(setup({ contingents: 0 }), 'chl').reason, /Guarneça|Lealdade/);
  assert.equal(getCapitalStatus(state, 'chl').available, true);
  const moved = mudarSedeDoGoverno(state, 'chl');
  assert.equal(getCapitalId(moved), 'chl');
  assert.ok(moved.economy.cash < state.economy.cash);
  assert.ok(moved.regime.unrest > state.regime.unrest);
  assert.match(moved.notice, /mudou sua sede para/);
  assert.match(getCapitalStatus(moved, 'bra').reason, /Nova mudança da sede/);
  const later = { ...moved, monthCounter: moved.monthCounter + CAPITAL_COOLDOWN };
  assert.equal(getCapitalStatus(later, 'bra').available, true);
  const home = mudarSedeDoGoverno(later, 'bra');
  assert.equal(home.capitalId, null);
  assert.equal(getCapitalId(home), 'bra');
  assert.equal(getCapitalStatus(home, 'bra').available, false);
});

test('governar de longe: lealdade e tributo da capital sobem, o pais de origem se desgasta, e a queda do territorio traz a sede de volta', () => {
  const state = { ...setup(), territories: { chl: { loyalty: 70 } } };
  const moved = mudarSedeDoGoverno(state, 'chl');
  const month = processCapital({ ...moved, monthCounter: 21 });
  assert.ok(month.regime.unrest > moved.regime.unrest);
  assert.ok(month.economy.cash > moved.economy.cash, 'tributo da capital');
  assert.ok(getTerritoryLoyalty(month, 'chl') >= 60);
  assert.ok(month.factions.trabalhadores < moved.factions.trabalhadores);
  const lost = processCapital({ ...moved, geopolitics: { ...moved.geopolitics, contacts: moved.geopolitics.contacts.map((c) => (c.id === 'chl' ? { ...c, anexado: false, destruido: false } : c)) } });
  assert.equal(lost.capitalId, null);
  assert.match(lost.notice, /voltou para casa/);
  assert.equal(processCapital(state), state, 'sem sede no exterior nada muda');
});

test('com a sede num territorio, reforcos e ofensivas usam a capital como referencia', () => {
  let state = createGameState('bra');
  state = { ...state, monthCounter: 20, territories: { chl: { loyalty: 80 }, rus: { loyalty: 80 } } };
  state = mapContacts(state, (c) => (c.id === 'chl' || c.id === 'rus' ? { ...c, anexado: true, destruido: true } : c));
  state = enviarTropas(enviarTropas(enviarTropas(state, 'chl'), 'chl'), 'rus');
  const homeMonths = getReinforcementStatus(state, 'rus').months;
  assert.equal(homeMonths, travelMonths(distanceKm('bra', 'rus')));
  const russiaCapital = { ...state, capitalId: 'rus' };
  assert.equal(getReinforcementStatus(russiaCapital, 'rus').months, 1, 'reforco para a propria capital e rapido');
  assert.equal(getReinforcementStatus(russiaCapital, 'chl').months, travelMonths(distanceKm('rus', 'chl')));
  assert.equal(pedirReforcos(russiaCapital, 'rus').convoys[0].arrives, 21);
});

test('cartao do territorio mostra risco, defesa e a opcao de sede; painel mostra a sede atual', () => {
  const state = { ...setup(), territories: { chl: { loyalty: 70 } } };
  const card = diplomacyMap(state, { selected: 'chl' });
  assert.match(card, /Risco de ataque/);
  assert.match(card, /força de defesa/);
  assert.match(card, /data-action="move-capital" data-target="chl"/);
  const moved = mudarSedeDoGoverno(state, 'chl');
  const movedCard = diplomacyMap(moved, { selected: 'chl' });
  assert.match(movedCard, /sede do governo \(defesa \+6\)/);
  assert.match(movedCard, /Devolver a sede para casa/);
  assert.match(troopsAbroadPanel(moved), /Sede do governo/);
  assert.match(troopsAbroadPanel(moved), /território anexado/);
  assert.match(troopsAbroadPanel(state), /em casa/);
});

test('saves antigos ganham os campos da sede e dados sujos sao normalizados', () => {
  const fresh = createGameState('bra');
  assert.equal(fresh.capitalId, null);
  const legacy = JSON.parse(JSON.stringify(fresh));
  delete legacy.capitalId; delete legacy.capitalMoveMonth;
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.equal(loaded.capitalId, null);
  assert.equal(loaded.capitalMoveMonth, -99);
  const dirty = hydrateGameState(JSON.stringify({ ...legacy, capitalId: 42, capitalMoveMonth: 'x' }));
  assert.equal(dirty.capitalId, null);
  assert.equal(dirty.capitalMoveMonth, -99);
});

test('avancar meses completos com territorios, ataques e sede no exterior mantem o estado valido', () => {
  let state = mudarSedeDoGoverno({ ...setup({ month: 8 }), territories: { chl: { loyalty: 70 } } }, 'chl');
  for (let index = 0; index < 40; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null, pendingAllianceInvocation: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.cash));
    assert.ok(state.military.exercito.soldados >= 0);
    state = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: null } };
  }
  assert.ok(state.capitalId === null || contactOf(state, state.capitalId)?.anexado);
});
