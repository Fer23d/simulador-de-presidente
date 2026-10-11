import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENTS, applyEventOption, rollMonthlyEvent } from '../src/core/events.js';

test('rolls a deterministic crisis only when the probability threshold is reached', () => {
  const triggered = rollMonthlyEvent(1972);
  const quiet = rollMonthlyEvent(1);

  assert.ok(EVENTS.some((event) => event.id === triggered.event?.id));
  assert.equal(quiet.event, null);
});

test('applies a crisis option immutably and clears the pending event', () => {
  const state = {
    economy: { cash: 10_000_000_000, popularity: 50, inflation: 0.04, unemployment: 0.08 },
    geopolitics: { onuScore: 50 },
    pendingEvent: EVENTS[0],
  };
  const result = applyEventOption(state, EVENTS[0].options[0].id);

  assert.equal(result.pendingEvent, null);
  assert.notEqual(result.economy.cash, state.economy.cash);
});
