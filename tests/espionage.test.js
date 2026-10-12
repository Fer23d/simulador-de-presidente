import test from 'node:test';
import assert from 'node:assert/strict';

import { financiarRebeldes } from '../src/core/espionage.js';
import { createGameState } from '../src/core/game-state.js';

test('financing rebels is deterministic, costs money and either creates a puppet or exposes the sponsor', () => {
  const state = { ...createGameState('bra'), randomSeed: 1 };
  const target = state.geopolitics.contacts.find((contact) => contact.id === 'arg');
  const result = financiarRebeldes(state, 'arg');
  const updatedTarget = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.ok(result.economy.cash < state.economy.cash);
  assert.notEqual(result.randomSeed, state.randomSeed);
  assert.ok(updatedTarget.puppet || (updatedTarget.relation === -100 && result.geopolitics.onuScore === 0));
  assert.equal(target.puppet, undefined);
});
