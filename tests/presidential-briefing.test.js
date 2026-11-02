import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { queuePresidentialBriefing, resolvePresidentialBriefing } from '../src/core/presidential_briefing.js';

test('briefing presidencial só abre depois do primeiro mês', () => {
  const initial = createGameState('bra');
  assert.equal(queuePresidentialBriefing(initial).pendingBriefing, null);

  const afterMonth = queuePresidentialBriefing({
    ...initial,
    monthCounter: 1,
    randomSeed: 3,
    economy: { ...initial.economy, inflation: 0.1 },
  });

  assert.ok(afterMonth.pendingBriefing);
  assert.equal(afterMonth.presidentialMandate.monthsInOffice, 1);
  assert.equal(afterMonth.notice, 'Briefing presidencial: uma decisão aguarda o seu comando.');
});

test('resolver briefing aplica decisão sem mutar o estado anterior', () => {
  const initial = createGameState('bra');
  const pending = queuePresidentialBriefing({
    ...initial,
    monthCounter: 1,
    randomSeed: 0,
    economy: { ...initial.economy, inflation: 0.1 },
  });
  const cashBefore = pending.economy.cash;
  const resolved = resolvePresidentialBriefing(pending, 'subsidize');

  assert.equal(pending.pendingBriefing !== null, true);
  assert.equal(resolved.pendingBriefing, null);
  assert.equal(resolved.economy.cash, cashBefore - 2_000_000_000);
  assert.ok(resolved.history_log.some((entry) => entry.type === 'briefing'));
  assert.equal(resolved.presidentialMandate.decisionsMade.length, 1);
});

test('briefing pendente sobrevive ao save/load', () => {
  const initial = createGameState('bra');
  const pending = queuePresidentialBriefing({ ...initial, monthCounter: 1, randomSeed: 0 });
  const hydrated = hydrateGameState(JSON.stringify(pending));

  assert.equal(hydrated.pendingBriefing?.id, pending.pendingBriefing.id);
  assert.deepEqual(hydrated.presidentialMandate.decisionsMade, []);
});
