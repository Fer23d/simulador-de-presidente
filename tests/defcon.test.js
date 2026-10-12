import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { advanceMonth } from '../src/core/game-state.js';
import { advanceDefcon, applyDefconEconomicShock } from '../src/core/defcon.js';

test('lowers DEFCON when three foreign wars are active', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    global_defcon: 5,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact, index) => index < 3 ? { ...contact, atWar: true } : contact),
    },
  };

  const result = advanceDefcon(prepared);

  assert.equal(result.global_defcon, 4);
  assert.equal(result.defconPeacefulMonths, 0);
});

test('global capital flight cuts the player and world GDP at DEFCON two', () => {
  const state = createGameState('bra');
  const target = state.geopolitics.contacts[0];
  const prepared = { ...state, global_defcon: 2 };

  const result = applyDefconEconomicShock(prepared);

  assert.equal(result.country.pib_base, Math.round(state.country.pib_base * 0.995));
  assert.equal(result.economy.gdp, Math.round(state.economy.gdp * 0.995));
  assert.equal(result.geopolitics.contacts[0].pib_base, Math.round(target.pib_base * 0.995));
});

test('monthly progression preserves DEFCON effects when no global modal opens', () => {
  const state = { ...createGameState('bra'), global_defcon: 2 };

  const result = advanceMonth(state);

  assert.equal(result.global_defcon, 2);
  assert.ok(result.economy.gdp < state.economy.gdp);
});
