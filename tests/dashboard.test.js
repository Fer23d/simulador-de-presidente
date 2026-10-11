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

  assert.match(renderCongress(state), /data-action="vote-law"/);
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
