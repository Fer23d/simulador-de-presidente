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

test('renders biological warfare and the constitutional action when they are unlocked', async () => {
  const { congressView, diplomacyView } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const state = createGameState('bra');
  const prepared = {
    ...state,
    factions: { ...state.factions, militares: 100 },
    technology: { ...state.technology, unlocked: ['advanced-bioengineering'] },
  };

  assert.match(diplomacyView(prepared, 'argentina'), /Lancar Virus Sintetico/);
  assert.match(congressView(prepared), /Promulgar Nova Constituicao/);
});

test('renders false flag, Dead Hand project, and the terminal overlay', async () => {
  const { diplomacyView, projectsView, renderDeadHandTerminal } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const state = createGameState('bra');

  assert.match(diplomacyView(state, 'argentina'), /Orquestrar Falsa Bandeira/);
  assert.match(projectsView(state), /Construir Rede Mao Morta/);
  assert.match(renderDeadHandTerminal({ dead_hand_triggered: true }), /DIRETRIZ ÔMEGA/);
});

test('renders final dilemma, escape, interrogation terminals, and Deep State controls', async () => {
  const { budgetView, diplomacyView, renderEscapeEnding, renderFinalDilemma, renderInterrogation } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const { projectBudget } = await import('../src/core/economy.js');
  const state = createGameState('bra');

  assert.match(renderFinalDilemma({ pendingFinalDilemma: true }), /FUGIR EM SILENCIO/);
  assert.match(renderFinalDilemma({ pendingFinalDilemma: true }), /DESTRUIR O MUNDO DO HELICOPTERO/);
  assert.match(renderEscapeEnding({ escape_ending_triggered: true, slush_fund: 50_000_000_000 }), /HELICOPTERO PRIVADO/);
  assert.match(renderInterrogation({ pendingInterrogation: { phase: 'choice' } }), /PRISIONEIRO #847/);
  assert.match(budgetView(state, projectBudget(state.economy, state.budget)), /Ilhas Cayman/);
  assert.match(diplomacyView(state, 'argentina'), /Infiltrar Sosia do Lider/);
});

test('renders nuclear codes only for a ready arsenal and an active war target', async () => {
  const { diplomacyView } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const state = createGameState('bra');
  const contacts = state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, atWar: true } : contact);
  const prepared = {
    ...state,
    country: { ...state.country, uranium: 101 },
    unlocked_techs: ['nuke'],
    military: { ...state.military, nuclear: { ...state.military.nuclear, bombBuilt: true } },
    geopolitics: { ...state.geopolitics, contacts },
    world: contacts,
  };

  assert.match(diplomacyView(prepared, 'argentina'), /data-action="nuclear-codes"/);
});

test('renders the global games bid dialog and corporate nationalization control', async () => {
  const { budgetView, renderSoftPower } = await import('../src/ui/dashboard.js');
  const { createGameState } = await import('../src/core/game-state.js');
  const { projectBudget } = await import('../src/core/economy.js');
  const state = createGameState('bra');

  assert.match(renderSoftPower({ ...state, pendingGlobalBid: { status: 'pending' } }), /Jogos Mundiais/);
  assert.match(budgetView({ ...state, megacorp_power: 15 }, projectBudget(state.economy, state.budget)), /Estatizar Megacorporacoes/);
});
