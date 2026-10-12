import test from 'node:test';
import assert from 'node:assert/strict';

test('dashboard module exports a mount point', async () => {
  const { mountDashboard } = await import('../src/ui/dashboard.js');

  assert.equal(typeof mountDashboard, 'function');
});

test('formats dashboard money values through a callable formatter', async () => {
  const { formatMoney } = await import('../src/ui/dashboard.js');

  assert.match(formatMoney(1_000_000), /R/);
});

test('renders a slider with configured limits', async () => {
  const { rangeControl } = await import('../src/ui/dashboard.js');

  assert.match(rangeControl('Defesa', 'defenseSpend', 0.06, 0, 0.15), /type="range"/);
});

test('formats diplomatic relations with a sign', async () => {
  const { formatRelation } = await import('../src/ui/dashboard.js');

  assert.equal(formatRelation(25), '+25');
  assert.equal(formatRelation(-10), '-10');
});

test('renders dynamic law rows and a blocking peace treaty dialog', async () => {
  const { renderCongress, renderPeaceTreaty } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const state = createGameState('bra');
  const treatyState = {
    ...state,
    geopolitics: { ...state.geopolitics, peaceTreaty: { targetId: 'arg', status: 'pending' } },
  };

  assert.match(renderCongress(state), /data-action="open-law-vote"/);
  assert.match(renderPeaceTreaty(treatyState), /Tratado de Paz Obrigatorio/);
});

test('renders a searchable and scrollable full diplomacy list', async () => {
  const { diplomacyView } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const view = diplomacyView(createGameState('bra'), 'argentina');

  assert.match(view, /diplomacy-search/);
  assert.match(view, /Propor Acordo Comercial/);
  assert.match(view, /Argentina/);
  assert.doesNotMatch(view, /Estados Unidos/);
});

test('renders the news feed and a blocking crisis dialog', async () => {
  const { renderCrisis, renderNews } = await import('../src/ui/dashboard.js');
  const { EVENTS } = await import('../src/core/events.js');
  const state = { news: [{ text: 'Mercados reagem.', calendar: { month: 1, year: 2026 } }], pendingEvent: EVENTS[0] };

  assert.match(renderNews(state), /Giro de Noticias/);
  assert.match(renderCrisis(state), /Escandalo de Corrupcao/);
});

test('renders a blocking UN Assembly voting dialog', async () => {
  const { renderUnAssembly } = await import('../src/ui/dashboard.js');

  const markup = renderUnAssembly({ pendingUnVote: { resolutionId: 'carbon-tax' } });

  assert.match(markup, /Taxa Global de Carbono/);
  assert.match(markup, /data-vote="yes"/);
  assert.match(markup, /data-vote="abstain"/);
});

test('renders cyber operations in diplomacy and the internal projects tab', async () => {
  const { diplomacyView, projectsView } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const state = createGameState('bra');

  assert.match(diplomacyView(state), /Lancar Ciberataque/);
  assert.match(projectsView(state), /Automatizar Parque Industrial/);
});

test('renders the global games bid dialog and corporate nationalization control', async () => {
  const { budgetView, renderSoftPower } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const { projectBudget } = await import('../src/core/economy.js');
  const state = createGameState('bra');

  assert.match(renderSoftPower({ ...state, pendingGlobalBid: { status: 'pending' } }), /Jogos Mundiais/);
  assert.match(budgetView({ ...state, megacorp_power: 15 }, projectBudget(state.economy, state.budget)), /Estatizar Megacorporacoes/);
});
