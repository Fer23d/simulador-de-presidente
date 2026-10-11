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
