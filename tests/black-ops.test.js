import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { injetarVirusSintetico, infiltrarSosia, orquestrarFalsaBandeira, processarInfeccoesBiologicas } from '../src/core/black_ops.js';

test('injects a synthetic virus only after research and resource payment', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 30_000_000_000 },
    country: { ...state.country, rare_earths: 500 },
    unlocked_techs: ['bio'],
  };

  const result = injetarVirusSintetico(prepared, 'arg');
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.bio_infected, true);
  assert.equal(target.bio_timer, 12);
  assert.ok(result.economy.cash < prepared.economy.cash);
  assert.ok(result.country.rare_earths < prepared.country.rare_earths);
});

test('rejects a synthetic virus without military pathogenic research', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 30_000_000_000 },
    country: { ...state.country, rare_earths: 500 },
  };

  const result = injetarVirusSintetico(prepared, 'arg');

  assert.equal(result.economy, prepared.economy);
  assert.equal(result.country, prepared.country);
  assert.match(result.notice, /Patog.nica/i);
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

test('false flag consumes cash, population and GDP while creating patriotic support', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 100_000_000_000 },
    country: { ...state.country, populacao: 200_000_000, populacao_base: 200_000_000, pib_base: 2_000_000_000_000 },
    factions: { ...state.factions, militares: 42, trabalhadores: 48 },
  };

  const result = orquestrarFalsaBandeira(prepared, 'arg');

  assert.equal(result.just_war_target, 'arg');
  assert.equal(result.economy.cash, 25_000_000_000);
  assert.equal(result.country.populacao_base, 196_000_000);
  assert.equal(result.country.pib_base, 1_980_000_000_000);
  assert.equal(result.factions.militares, 100);
  assert.equal(result.factions.trabalhadores, 100);
});

test('false flag rejects an active war target without charging resources', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, atWar: true } : contact) },
  };

  const result = orquestrarFalsaBandeira(prepared, 'arg');

  assert.equal(result.economy, prepared.economy);
  assert.equal(result.country, prepared.country);
  assert.equal(result.just_war_target, null);
});

test('false flag does not restore purged workers in a theocratic state', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    economy: { ...state.economy, cash: 100_000_000_000 },
    regime: { ...state.regime, constitution: 'theocratic' },
    factions: { militares: 55, religiosos: 55 },
  };

  const result = orquestrarFalsaBandeira(prepared, 'arg');

  assert.equal(result.factions.militares, 100);
  assert.equal(Object.hasOwn(result.factions, 'trabalhadores'), false);
});

test('turns an eligible authoritarian target into a puppet after paying the operation cost', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: 1,
    economy: { ...state.economy, cash: 200_000_000_000 },
    technology: { ...state.technology, points: 500 },
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, tipo_governo: 'Autocracia' } : contact) },
  };

  const result = infiltrarSosia(prepared, 'arg');

  assert.equal(result.economy.cash, 0);
  assert.equal(result.technology.points, 0);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').is_puppet_of, 'jogador');
});

test('a failed leader-double infiltration starts war and escalates DEFCON', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: 1_000,
    economy: { ...state.economy, cash: 200_000_000_000 },
    technology: { ...state.technology, points: 500 },
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, tipo_governo: 'Autocracia' } : contact) },
  };

  const result = infiltrarSosia(prepared, 'arg');

  assert.equal(result.global_defcon, 1);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').atWar, true);
});
