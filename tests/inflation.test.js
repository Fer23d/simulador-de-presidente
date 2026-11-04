import assert from 'node:assert/strict';
import { desviarFundos } from '../src/core/corruption.js';
import test from 'node:test';
import { DEFAULT_BUDGET, INFLATION_HISTORY_LIMIT, advanceEconomy, summarizeInflation } from '../src/core/economy.js';
import { advanceMonth, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { budgetView, inflationChart } from '../src/ui/dashboard.js';
import { projectBudget } from '../src/core/economy.js';

const economy = { gdp: 1_000_000_000, inflation: 0.1, unemployment: 0.08, cash: 0, inflationHistory: [0.1] };

test('juros altos derrubam a inflação e juros baixos a elevam', () => {
  const high = advanceEconomy(economy, { ...DEFAULT_BUDGET, interestRate: 0.3 });
  const low = advanceEconomy(economy, { ...DEFAULT_BUDGET, interestRate: 0 });
  assert.ok(high.inflation < low.inflation);
  assert.ok(high.gdp < low.gdp, 'juros altos custam crescimento');
});

test('cada mês registra a inflação e o histórico e limitado', () => {
  let current = economy;
  for (let month = 0; month < INFLATION_HISTORY_LIMIT + 10; month++) current = advanceEconomy(current, DEFAULT_BUDGET);
  assert.equal(current.inflationHistory.length, INFLATION_HISTORY_LIMIT);
  assert.equal(current.inflationHistory.at(-1), current.inflation);
});

test('resumo informa tendência e nivel', () => {
  assert.equal(summarizeInflation({ inflation: 0.25, inflationHistory: [0.05, 0.1, 0.2, 0.25] }).level, 'hyper');
  assert.equal(summarizeInflation({ inflation: 0.25, inflationHistory: [0.05, 0.1, 0.2, 0.25] }).trend, 'up');
  assert.equal(summarizeInflation({ inflation: 0.04, inflationHistory: [0.04] }).level, 'healthy');
});

test('jogo novo e saves antigos ganham histórico e juros', () => {
  const fresh = createGameState();
  assert.equal(fresh.economy.inflationHistory.length, 1);
  const legacy = JSON.parse(JSON.stringify(fresh));
  delete legacy.economy.inflationHistory;
  delete legacy.budget.interestRate;
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.equal(loaded.budget.interestRate, DEFAULT_BUDGET.interestRate);
  assert.equal(loaded.economy.inflationHistory.length, 1);
  const next = advanceMonth(loaded);
  assert.equal(next.economy.inflationHistory.length, 2);
});

test('Orçamento mostra painel e grafico de inflação', () => {
  const state = createGameState();
  const html = budgetView(state, projectBudget(state.economy, state.budget));
  assert.match(html, /inflation-chart/);
  assert.match(html, /data-budget="interestRate"/);
  assert.match(inflationChart([0.03, 0.05, 0.2]), /<path/);
});

test('juros altos encarecem a divida e encolhem a arrecadacao', () => {
  const state = createGameState();
  const high = projectBudget(state.economy, { ...state.budget, interestRate: 0.3 });
  const low = projectBudget(state.economy, { ...state.budget, interestRate: 0.02 });
  assert.ok(high.expenses > low.expenses);
  assert.ok(high.revenue < low.revenue);
});

test('desviar fundos abre um rombo fiscal que cobra juros e pressiona a inflacao', () => {
  const base = createGameState();
  const rich = { ...base, economy: { ...base.economy, cash: 100_000_000_000 } };
  const diverted = desviarFundos(rich);
  assert.ok(diverted.economy.fiscalHole > 0);
  assert.ok(diverted.economy.fiscalHole > diverted.slush_fund, 'o rombo e maior que o desvio');
  const clean = projectBudget(rich.economy, rich.budget);
  const dirty = projectBudget(diverted.economy, diverted.budget);
  assert.ok(dirty.expenses > clean.expenses);
  assert.ok(dirty.fiscalHoleCost > 0);
  assert.ok(advanceEconomy(diverted.economy, diverted.budget).inflation > advanceEconomy({ ...diverted.economy, fiscalHole: 0 }, diverted.budget).inflation);
  // o rombo diminui devagar com o tempo
  assert.ok(advanceEconomy(diverted.economy, diverted.budget).fiscalHole < diverted.economy.fiscalHole);
});

test('Orcamento exibe o rombo fiscal escondido', () => {
  const base = createGameState();
  const state = { ...base, economy: { ...base.economy, fiscalHole: 5_000_000_000 } };
  assert.match(budgetView(state, projectBudget(state.economy, state.budget)), /Rombo fiscal escondido/);
});
