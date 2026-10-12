import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { injetarVirusSintetico, processarInfeccoesBiologicas } from '../src/core/black_ops.js';

test('injects a synthetic virus only after research and resource payment', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 30_000_000_000 },
    country: { ...state.country, rare_earths: 500 },
    technology: { ...state.technology, unlocked: ['advanced-bioengineering'] },
  };

  const result = injetarVirusSintetico(prepared, 'arg');
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.bio_infected, true);
  assert.equal(target.bio_timer, 12);
  assert.ok(result.economy.cash < prepared.economy.cash);
  assert.ok(result.country.rare_earths < prepared.country.rare_earths);
});

test('biological infections degrade population and GDP for twelve monthly turns', () => {
  const state = createGameState('bra');
  const infected = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, bio_infected: true, bio_timer: 12, population: 1_000_000, populacao_base: 1_000_000, pib_base: 100_000_000_000 }
        : contact),
    },
  };

  const result = processarInfeccoesBiologicas(infected);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.population, 950_000);
  assert.equal(target.populacao_base, 950_000);
  assert.equal(target.pib_base, 98_000_000_000);
  assert.equal(target.bio_timer, 11);
});
