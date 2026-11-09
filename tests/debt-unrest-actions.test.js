import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BUDGET, getDebtStatus, projectBudget } from '../src/core/economy.js';
import { applyUnrestAction, createGameState } from '../src/core/game-state.js';
import { getUnrestActionStatus, repressionHangover } from '../src/core/unrest_actions.js';
import { BRIEFING_MIN_GAP, queuePresidentialBriefing } from '../src/core/presidential_briefing.js';
import { advanceUnrest } from '../src/core/military.js';
import { budgetView } from '../src/ui/dashboard.js';

const base = (patch = {}) => ({ ...createGameState('bra'), monthCounter: 10, ...patch });
const withUnrest = (state, unrest) => ({ ...state, regime: { ...state.regime, unrest } });

test('divida e o caixa negativo, e o rating cobra premio de risco', () => {
  const gdp = 1_000_000_000_000;
  const low = getDebtStatus({ gdp, cash: -100_000_000_000 }, DEFAULT_BUDGET);
  const high = getDebtStatus({ gdp, cash: -2_500_000_000_000 }, DEFAULT_BUDGET);
  assert.equal(low.rating, 'AAA');
  assert.equal(high.rating, 'CCC');
  assert.ok(high.premium > low.premium);
  assert.equal(getDebtStatus({ gdp, cash: 5 }, DEFAULT_BUDGET).debt, 0);
  const rich = projectBudget({ gdp, cash: 0, inflation: 0.04 }, DEFAULT_BUDGET);
  const indebted = projectBudget({ gdp, cash: -2_500_000_000_000, inflation: 0.04 }, DEFAULT_BUDGET);
  assert.ok(indebted.expenses > rich.expenses);
  assert.ok(indebted.debtInterest > 0);
});

test('Orcamento mostra divida publica e rating', () => {
  const state = base();
  const html = budgetView(state, projectBudget(state.economy, state.budget));
  assert.match(html, /Dívida pública/);
  assert.match(html, /Rating de crédito/);
});

test('subsidio custa caixa e reduz a tensao, respeitando o intervalo', () => {
  const state = withUnrest(base(), 50);
  const next = applyUnrestAction(state, 'subsidy');
  assert.equal(next.regime.unrest, 38);
  assert.ok(next.economy.cash < state.economy.cash);
  const again = applyUnrestAction(next, 'subsidy');
  assert.equal(again.regime.unrest, 38, 'em intervalo, nada muda');
  assert.equal(getUnrestActionStatus(next, 'subsidy').available, false);
});

test('repressao derruba a tensao mas deixa ressaca e custa imagem', () => {
  const state = withUnrest(base(), 70);
  assert.equal(getUnrestActionStatus(withUnrest(base(), 10), 'repression').available, false);
  const next = applyUnrestAction(state, 'repression');
  assert.equal(next.regime.unrest, 40);
  assert.ok(next.geopolitics.onuScore < state.geopolitics.onuScore);
  assert.ok(repressionHangover(next) > 0);
  const quiet = { cash: 100, inflation: 0.03, unemployment: 0.05, gdp: 1000 };
  assert.ok(advanceUnrest(40, quiet, { trabalhadores: 70 }, repressionHangover(next)) > advanceUnrest(40, quiet, { trabalhadores: 70 }, 0));
});

test('briefing respeita o intervalo entre decisoes', () => {
  assert.ok(BRIEFING_MIN_GAP >= 2);
  const first = queuePresidentialBriefing(base({ monthCounter: 1, randomSeed: 0 }));
  assert.ok(first.pendingBriefing);
  assert.equal(first.presidentialMandate.lastBriefingMonth, 1);
  const resolved = { ...first, pendingBriefing: null };
  const nextMonth = queuePresidentialBriefing({ ...resolved, monthCounter: 2 });
  assert.equal(nextMonth.pendingBriefing, null, 'mes seguinte fica livre');
  assert.equal(nextMonth.presidentialMandate.monthsInOffice, 2);
  const later = queuePresidentialBriefing({ ...nextMonth, monthCounter: 4 });
  assert.ok(later.pendingBriefing, 'depois do intervalo volta o briefing');
});
