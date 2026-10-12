import test from 'node:test';
import assert from 'node:assert/strict';

import { processarMigracoes } from '../src/core/demographics.js';
import { createGameState } from '../src/core/game-state.js';

test('moves refugees away from an active war and creates migration strain at the destination', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, atWar: true, population: 1_000_000, populacao_base: 1_000_000, relation: 80 }
        : contact),
    },
  };
  const result = processarMigracoes(prepared);
  const argentina = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(argentina.population, 999_500);
  assert.ok(result.country.populacao > prepared.country.populacao);
  assert.ok(result.factions.trabalhadores < prepared.factions.trabalhadores);
});

test('transfers base GDP away from unstable dictatorships to technology hubs', () => {
  const state = {
    ...createGameState('bra'),
    regime: { ...createGameState('bra').regime, type: 'dictatorship' },
    country: { ...createGameState('bra').country, pib_base: 1_000_000 },
  };
  const result = processarMigracoes(state);

  assert.ok(result.country.pib_base < state.country.pib_base);
  assert.ok(result.geopolitics.contacts.some((contact) => ['tech_giant', 'financial_hub'].includes(contact.trait) && contact.pib_base > state.geopolitics.contacts.find((original) => original.id === contact.id).pib_base));
});
