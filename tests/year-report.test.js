import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { buildYearReport, createYearGoals, evaluateGoals, getRecommendation, processYearEnd } from '../src/core/year_report.js';
import { overviewView } from '../src/ui/dashboard.js';

const base = (patch = {}) => ({ ...createGameState('bra'), ...patch });

test('jogo novo ja nasce com 4 metas do ano', () => {
  const state = base();
  assert.equal(state.yearGoals.items.length, 4);
  assert.equal(state.yearGoals.year, 2026);
  assert.deepEqual(state.yearReports, []);
});

test('metas partem de onde o pais esta: inflacao alta exige reduzir, baixa exige manter', () => {
  const high = createYearGoals(base({ economy: { ...base().economy, inflation: 0.12 } }));
  const low = createYearGoals(base({ economy: { ...base().economy, inflation: 0.03 } }));
  assert.ok(high.items.find((item) => item.id === 'inflation').target < 0.12);
  assert.equal(low.items.find((item) => item.id === 'inflation').target, 0.05);
});

test('avaliacao das metas e nota: tudo cumprido vira A+, nada cumprido vira D', () => {
  const state = base();
  const good = base({ economy: { ...state.economy, inflation: 0.02, unemployment: 0.04, cash: 1_000 }, factions: { elite: 90, trabalhadores: 90, militares: 90, religiosos: 90 } });
  const goodGoals = { ...state.yearGoals };
  assert.equal(evaluateGoals(good, goodGoals).every((goal) => goal.met), true);
  const bad = base({ economy: { ...state.economy, inflation: 0.3, unemployment: 0.3, cash: -9_000_000_000_000 }, factions: { elite: 5, trabalhadores: 5, militares: 5, religiosos: 5 } });
  assert.equal(buildYearReport({ ...bad, yearGoals: state.yearGoals }).grade, 'D');
  assert.equal(buildYearReport({ ...good, yearGoals: goodGoals }).grade, 'A+');
});

test('em janeiro o ano fecha: relatorio, efeito politico e novas metas', () => {
  const state = base();
  const december = { ...state, calendar: { month: 12, year: 2026 }, monthCounter: 11 };
  const january = advanceMonth(december);
  assert.equal(january.calendar.month, 1);
  assert.equal(january.yearReports.length, 1);
  assert.equal(january.yearReports[0].year, 2026);
  assert.equal(january.yearGoals.year, 2027);
  assert.ok(january.news.some((item) => /Relatório de 2026/.test(item.text)));
  assert.equal(processYearEnd(january).yearReports.length, 1, 'nao fecha o mesmo ano duas vezes');
});

test('relatorio sobrevive ao salvar e carregar, e saves antigos ganham metas', () => {
  const january = advanceMonth({ ...base(), calendar: { month: 12, year: 2026 }, monthCounter: 11 });
  const loaded = hydrateGameState(JSON.stringify(january));
  assert.equal(loaded.yearReports.length, 1);
  assert.equal(loaded.yearGoals.year, 2027);
  const legacy = JSON.parse(JSON.stringify(base()));
  delete legacy.yearGoals;
  delete legacy.yearReports;
  const old = hydrateGameState(JSON.stringify(legacy));
  assert.equal(old.yearGoals.items.length, 4);
});

test('recomendacao aponta o problema mais urgente', () => {
  const state = base();
  assert.match(getRecommendation({ ...state, regime: { ...state.regime, unrest: 70 } }), /tensão social/);
  assert.match(getRecommendation({ ...state, economy: { ...state.economy, inflation: 0.15 } }), /inflação/);
});

test('Visao geral mostra o relatorio anual e as metas', () => {
  const state = base();
  const html = overviewView(state, { monthlyBalance: 0 });
  assert.match(html, /Relatório anual/);
  assert.match(html, /Metas de 2026/);
});
