import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceGeopolitics,
  alterarNotaONU,
  createGeopolitics,
  declareWar,
  sabotar,
  proposeAlliance,
  proposeTradeTreaty,
} from '../src/core/geopolitics.js';

const economy = {
  gdp: 2_000_000_000_000,
  cash: 150_000_000_000,
  popularity: 55,
};

test('only signs a trade treaty above relation 20 and outside war', () => {
  const state = createGeopolitics();
  const rejected = proposeTradeTreaty(state, 'usa');
  const eligible = {
    ...state,
    contacts: state.contacts.map((item) => item.id === 'usa' ? { ...item, relation: 21 } : item),
  };

  assert.equal(rejected.ok, false);
  assert.equal(rejected.geopolitics, state);
  assert.equal(proposeTradeTreaty(eligible, 'usa').ok, true);
});

test('requires a trade treaty before an alliance can be proposed', () => {
  const state = {
    ...createGeopolitics(),
    contacts: createGeopolitics().contacts.map((item) => item.id === 'arg' ? { ...item, relation: 60 } : item),
  };
  const withoutTreaty = proposeAlliance(state, 'arg');
  const withTreaty = proposeTradeTreaty(state, 'arg');

  assert.equal(withoutTreaty.ok, false);
  assert.equal(proposeAlliance(withTreaty.geopolitics, 'arg').ok, true);
});

test('resolves the same war outcome for the same seed', () => {
  const atWar = declareWar(createGeopolitics(), 'arg').geopolitics;
  const first = advanceGeopolitics(atWar, { power: 50, support: 60 }, economy, 7);
  const second = advanceGeopolitics(atWar, { power: 50, support: 60 }, economy, 7);

  assert.deepEqual(first, second);
  assert.ok(first.economy.cash < economy.cash);
});

test('applies international sanctions below ONU score 25', () => {
  const result = alterarNotaONU(createGeopolitics(), -30);

  assert.equal(result.onuScore, 20);
  assert.equal(result.internationalSanctions, true);
});

test('sabotage spends cash and makes discovery deterministic from a seed', () => {
  const result = sabotar(createGeopolitics(), 'arg', economy, 0);

  assert.ok(result.economy.cash < economy.cash);
  assert.equal(typeof result.discovered, 'boolean');
});
