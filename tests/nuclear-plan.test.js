import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState, fundNuclear, hydrateGameState, iniciarPlanoNuclear } from '../src/core/game-state.js';
import { NUCLEAR_PLAN_COST, startNuclearPlan } from '../src/core/military.js';
import { militaryView, nuclearPlanPanel } from '../src/ui/dashboard.js';

const rich = (patch = {}) => {
  const state = createGameState('bra');
  return { ...state, technology: { ...state.technology, points: 1000 }, country: { ...state.country, uranium: 5000 }, ...patch };
};

test('o Plano Nuclear custa pesquisa e caixa e so pode ser iniciado uma vez', () => {
  const state = rich();
  const started = iniciarPlanoNuclear(state);
  assert.equal(started.military.nuclear.planStarted, true);
  assert.equal(started.technology.points, 1000 - NUCLEAR_PLAN_COST.research);
  assert.equal(started.economy.cash, state.economy.cash - NUCLEAR_PLAN_COST.cash);
  const again = iniciarPlanoNuclear(started);
  assert.equal(again.technology.points, started.technology.points, 'nao cobra duas vezes');
  assert.match(again.notice, /já foi iniciado/);
});

test('sem pesquisa ou sem caixa o plano nao comeca', () => {
  const poor = createGameState('bra');
  assert.match(iniciarPlanoNuclear(poor).notice, /Pontos de Pesquisa/);
  assert.equal(iniciarPlanoNuclear(poor).military.nuclear.planStarted, false);
  const broke = rich({ economy: { ...rich().economy, cash: 0 } });
  assert.match(iniciarPlanoNuclear(broke).notice, /Caixa insuficiente/);
});

test('financiar o programa exige o plano iniciado', () => {
  const state = rich();
  const blocked = fundNuclear(state, 'civil', 5_000_000_000);
  assert.match(blocked.notice, /Inicie o Plano Nuclear/);
  assert.equal(blocked.military.nuclear.civilProgress, 0);
  const funded = fundNuclear(iniciarPlanoNuclear(state), 'civil', 5_000_000_000);
  assert.ok(funded.military.nuclear.civilProgress > 0);
});

test('saves antigos com programa andando contam como plano iniciado', () => {
  const state = rich();
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.military.nuclear = { civilProgress: 40, militaryProgress: 0, civilOnline: false, bombBuilt: false };
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.equal(loaded.military.nuclear.planStarted, true);
  const fresh = hydrateGameState(JSON.stringify(rich()));
  assert.equal(fresh.military.nuclear.planStarted, false);
  assert.equal(startNuclearPlan(createGameState('bra').military, { cash: 1 }, { points: 999 }).ok, false);
});

test('Tecnologia mostra o Plano Nuclear e as Forcas Armadas deixam de mostrar o financiamento', () => {
  const state = rich();
  const before = nuclearPlanPanel(state);
  assert.match(before, /COMEÇAR PLANO NUCLEAR/);
  assert.doesNotMatch(before, /data-action="nuclear" data-kind/);
  const after = nuclearPlanPanel(iniciarPlanoNuclear(state));
  assert.match(after, /data-action="nuclear" data-kind="civil"/);
  assert.match(after, /data-action="nuclear" data-kind="military"/);
  const military = militaryView(state);
  assert.doesNotMatch(military, /data-action="nuclear"/);
  assert.doesNotMatch(military, /Energia 5 bi/);
  assert.match(military, /Armas nucleares/);
});
