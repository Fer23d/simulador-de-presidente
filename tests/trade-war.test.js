import assert from 'node:assert/strict';
import test from 'node:test';
import { acaoGuerraComercial, advanceMonth, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { createDiplomacyLife } from '../src/core/diplomacy_life.js';
import { respondToSummit } from '../src/core/diplomacy_life.js';
import {
  TRADE_WAR_MAX_TARIFF, applyTradeWarAction, createTradeWar, describeRisk, easeTradeWar, getMonthlyTradeWarLoss,
  getTradeWarActionStatus, getTradeWarRisk, normalizeTradeWar, processTradeWar, startTradeWar,
} from '../src/core/trade_war.js';
import { ACHIEVEMENTS, findNewAchievements } from '../src/core/achievements.js';
import { diplomacyMap, tradeWarPanel } from '../src/ui/dashboard.js';
import { normalizeSectors, SECTOR_IDS } from '../src/core/sectors.js';

const base = (month = 20) => ({ ...createGameState('bra'), monthCounter: month });
const aggressorOf = (state) => [...state.geopolitics.contacts].filter((c) => !c.alliance && !c.atWar).sort((a, b) => b.pib_base - a.pib_base)[0];
const warring = (month = 20, patch = {}) => {
  const state = base(month);
  const aggressor = aggressorOf(state);
  return { ...startTradeWar(state, aggressor.id, 25, 0.8, ['industry', 'agro']), ...patch };
};
const activeOf = (state) => state.tradeWar.active;

test('estado novo e saves antigos ganham tradeWar seguro', () => {
  assert.deepEqual(createGameState('bra').tradeWar, createTradeWar());
  const legacy = JSON.parse(JSON.stringify(createGameState('bra')));
  delete legacy.tradeWar;
  assert.deepEqual(hydrateGameState(JSON.stringify(legacy)).tradeWar, createTradeWar());
  const dirty = normalizeTradeWar({ active: { aggressorId: 'usa', tariff: 999, hitSectors: ['x', 'agro'] }, diversification: 500, history: [{ aggressorId: 'a', outcome: 'foo' }] });
  assert.equal(dirty.active.tariff, TRADE_WAR_MAX_TARIFF);
  assert.deepEqual(dirty.active.hitSectors, ['agro']);
  assert.equal(dirty.diversification, 80);
  assert.equal(dirty.history.length, 0);
});

test('nao ha guerra comercial no inicio nem enquanto o risco e zero; depois do mes 8 ela pode surgir', () => {
  assert.equal(getTradeWarRisk(base(3)), 0);
  assert.ok(getTradeWarRisk(base(20)) > 0);
  let started = 0;
  for (let month = 8; month < 200; month += 1) {
    const result = processTradeWar(base(month));
    if (result.tradeWar.active) started += 1;
  }
  assert.ok(started > 0, 'em muitos meses alguma guerra comeca');
});

test('sancoes, recusas a AIEA e bomba aumentam o risco; diversificacao diminui', () => {
  const calm = base(20);
  const sanctioned = { ...calm, geopolitics: { ...calm.geopolitics, internationalSanctions: true } };
  assert.ok(getTradeWarRisk(sanctioned) > getTradeWarRisk(calm));
  const refused = { ...calm, diplomacyLife: { ...createDiplomacyLife(), inspectionRefusals: 2 } };
  assert.ok(getTradeWarRisk(refused) > getTradeWarRisk(calm));
  const bomb = { ...calm, military: { ...calm.military, nuclear: { ...calm.military.nuclear, bombBuilt: true } } };
  assert.ok(getTradeWarRisk(bomb) > getTradeWarRisk(calm));
  const diversified = { ...calm, tradeWar: { ...createTradeWar(), diversification: 60 } };
  assert.ok(getTradeWarRisk(diversified) < getTradeWarRisk(calm));
  assert.match(describeRisk(0.1), /alto/);
});

test('iniciar a guerra suspende o tratado e a tarifa cobra PIB, emprego e setores', () => {
  const state = base(20);
  const aggressor = aggressorOf(state);
  const withTreaty = { ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((c) => (c.id === aggressor.id ? { ...c, tradeTreaty: true } : c)) } };
  const war = startTradeWar(withTreaty, aggressor.id, 30, 1, ['industry', 'services']);
  assert.equal(war.geopolitics.contacts.find((c) => c.id === aggressor.id).tradeTreaty, false);
  assert.equal(activeOf(war).suspendedTreaty, true);
  assert.match(war.notice, /impôs tarifas/);
  const after = processTradeWar({ ...war, monthCounter: 21 });
  assert.ok(after.economy.gdp < war.economy.gdp);
  assert.ok(after.economy.unemployment > war.economy.unemployment);
  assert.ok(after.economy.cash < war.economy.cash);
  assert.ok(activeOf(after).loss > 0);
  assert.ok(after.tradeWar.totalLoss > 0);
  const sectors = normalizeSectors(after.economy.sectors);
  assert.ok(Math.abs(SECTOR_IDS.reduce((sum, id) => sum + sectors[id].share, 0) - 1) < 1e-9);
  assert.ok(sectors.industry.share < normalizeSectors(war.economy.sectors).industry.share);
});

test('diversificar, subsidiar e retaliar reduzem o dano mensal', () => {
  const war = warring();
  const plain = getMonthlyTradeWarLoss(war);
  const diversified = applyTradeWarAction(war, 'diversify');
  assert.ok(diversified.tradeWar.diversification > 0);
  assert.ok(diversified.economy.cash < war.economy.cash);
  assert.ok(getMonthlyTradeWarLoss(diversified) < plain);
  assert.equal(getTradeWarActionStatus(diversified, 'diversify').available, false, 'so uma vez por mes');
  const subsidised = applyTradeWarAction(war, 'subsidy');
  assert.ok(getMonthlyTradeWarLoss(subsidised) < plain);
  const retaliated = applyTradeWarAction(war, 'retaliate');
  assert.ok(getMonthlyTradeWarLoss(retaliated) < plain);
  assert.equal(applyTradeWarAction(retaliated, 'retaliate').notice, 'Já retaliou nesta guerra.');
});

test('quem retalia ve a tarifa escalar a cada 3 meses; sem retaliar ela cede devagar', () => {
  const retaliated = applyTradeWarAction(warring(20), 'retaliate');
  const tariff0 = activeOf(retaliated).tariff;
  const escalated = processTradeWar({ ...retaliated, monthCounter: 23 });
  assert.equal(activeOf(escalated).tariff, tariff0 + 5);
  assert.match(escalated.notice, /escalou/);
  const passive = warring(20);
  const later = processTradeWar({ ...passive, monthCounter: 25 });
  assert.equal(activeOf(later).tariff, activeOf(passive).tariff - 1);
});

test('negociar: sucesso derruba 15 pontos, fracasso soma 3 e ha intervalo entre rodadas', () => {
  const outcomes = new Set();
  for (let month = 30; month < 70; month += 1) {
    const war = { ...warring(month - 5), monthCounter: month };
    const result = applyTradeWarAction(war, 'negotiate', 'cash');
    outcomes.add(result.tradeWar.active ? (activeOf(result).tariff < 25 ? 'sucesso' : 'fracasso') : 'fim');
    if (result.tradeWar.active && activeOf(result).tariff < 25) assert.equal(activeOf(result).tariff, 10);
    if (result.tradeWar.active && activeOf(result).tariff > 25) assert.equal(activeOf(result).tariff, 28);
    assert.ok(result.economy.cash < war.economy.cash, 'compensacao em dinheiro custa caixa');
    if (result.tradeWar.active) assert.equal(getTradeWarActionStatus(result, 'negotiate').available, false);
  }
  assert.ok(outcomes.has('sucesso') && outcomes.has('fracasso'));
});

test('a guerra termina em acordo, desgaste, cancelamento ou apos 18 meses, e o tratado volta', () => {
  const state = base(20);
  const aggressor = aggressorOf(state);
  const withTreaty = { ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((c) => (c.id === aggressor.id ? { ...c, tradeTreaty: true } : c)) } };
  const war = startTradeWar(withTreaty, aggressor.id, 10, 0.5, ['industry', 'agro']);
  const eased = easeTradeWar(war, 15, 'Teste');
  assert.equal(eased.tradeWar.active, null);
  assert.equal(eased.tradeWar.history[0].outcome, 'acordo');
  assert.equal(eased.geopolitics.contacts.find((c) => c.id === aggressor.id).tradeTreaty, true);
  const tired = processTradeWar({ ...war, monthCounter: 20 + 18 });
  assert.equal(tired.tradeWar.active, null);
  const atWar = { ...war, geopolitics: { ...war.geopolitics, contacts: war.geopolitics.contacts.map((c) => (c.id === aggressor.id ? { ...c, atWar: true } : c)) } };
  const cancelled = processTradeWar({ ...atWar, monthCounter: 22 });
  assert.equal(cancelled.tradeWar.history[0].outcome, 'cancelada');
  assert.equal(cancelled.geopolitics.contacts.find((c) => c.id === aggressor.id).tradeTreaty, false);
  assert.equal(getTradeWarRisk({ ...eased, monthCounter: 22 }), 0, 'intervalo entre guerras');
});

test('cupula de comercio bem-sucedida derruba a tarifa de uma guerra em curso', () => {
  let eased = 0;
  for (let month = 12; month < 60; month += 1) {
    const war = { ...warring(month), diplomacyLife: { ...createDiplomacyLife(), summit: { id: 'g20', deadline: month + 2 } } };
    const result = respondToSummit(war, 'cooperate');
    if (!result.tradeWar.active || activeOf(result).tariff < 25) eased += 1;
  }
  assert.ok(eased > 0);
});

test('recurso na ONU exige reputacao minima', () => {
  const war = warring();
  const low = { ...war, geopolitics: { ...war.geopolitics, onuScore: 10 } };
  assert.equal(getTradeWarActionStatus(low, 'appeal').available, false);
  assert.equal(getTradeWarActionStatus(war, 'appeal').available, true);
});

test('painel, mapa, acoes do jogador e conquistas', () => {
  const calm = base(20);
  assert.match(tradeWarPanel(calm), /PAZ COMERCIAL/);
  assert.match(tradeWarPanel(calm), /data-kind="diversify"/);
  const war = warring();
  const html = tradeWarPanel(war);
  assert.match(html, /TARIFA 25%/);
  assert.match(html, /data-kind="retaliate"/);
  assert.match(html, /data-kind="negotiate" data-option="cash"/);
  assert.match(html, /data-kind="appeal"/);
  assert.match(diplomacyMap(war, { selected: activeOf(war).aggressorId }), /map-shape--tariff/);
  assert.match(acaoGuerraComercial({ ...war, regime: { ...war.regime, gameOver: true } }, 'retaliate').notice, /encerrada/);
  assert.ok(ACHIEVEMENTS.some((item) => item.id === 'trade_peace'));
  const peace = { ...calm, tradeWar: { ...createTradeWar(), history: [{ aggressorId: 'usa', startMonth: 1, endMonth: 5, outcome: 'acordo', loss: 1 }] } };
  assert.ok(findNewAchievements(peace, {}).some((item) => item.id === 'trade_peace'));
});

test('avancar meses completos mantem o estado valido com guerra comercial', () => {
  let state = { ...base(8), pendingEvent: null, pendingBriefing: null };
  for (let index = 0; index < 60; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.gdp) && state.economy.gdp > 0);
    assert.ok(state.tradeWar.diversification >= 0);
  }
});
