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
