import test from 'node:test';
import assert from 'node:assert/strict';

import { createCountryProfile, getCountryById } from '../src/data/countries.js';
import { createMilitary, comprarBlindados, fundNuclearProject } from '../src/core/military.js';
import { createGameState } from '../src/core/game-state.js';
import { advanceGeopolitics, aplicarReparacoes, desmilitarizarPais, importarRecursos } from '../src/core/geopolitics.js';

test('country profiles include strategic resource stocks', () => {
  const brazil = createCountryProfile(getCountryById('bra'));

  assert.ok(brazil.uranium >= 0);
  assert.ok(brazil.steel > 0);
  assert.ok(brazil.rare_earths >= 0);
});

test('collects active war reparations during the monthly geopolitical update', () => {
  const state = createGameState('bra');
  const geopolitics = {
    ...state.geopolitics,
    contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
      ? { ...contact, cash: 100_000_000_000, warReparations: { rate: 0.15, remainingMonths: 120 } }
      : contact),
  };
  const result = advanceGeopolitics(geopolitics, state.military, state.economy, state.randomSeed);
  const argentina = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.ok(result.economy.cash > state.economy.cash);
  assert.equal(argentina.warReparations.remainingMonths, 119);
});

test('military purchases require and consume steel while nuclear projects consume uranium', () => {
  const country = createCountryProfile(getCountryById('bra'));
  const economy = { cash: 100_000_000_000 };
  const military = createMilitary(country);
  const tanks = comprarBlindados(military, economy, 1, { ...country, steel: 0 });
  const nuclear = fundNuclearProject(military, economy, 'military', 5_000_000_000, { ...country, uranium: 0 });

  assert.equal(tanks.ok, false);
  assert.equal(nuclear.ok, false);
  assert.match(tanks.reason, /aco/i);
  assert.match(nuclear.reason, /uranio/i);
});

test('imports resources and resolves demilitarization and reparations from a pending treaty', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, militaryPower: 0, relation: 60, steel: 10_000, cash: 100_000_000_000 }
        : contact),
    },
  };
  const imported = importarRecursos(prepared.geopolitics, prepared.economy, prepared.country, 'arg', 'steel', 100);
  const demilitarized = desmilitarizarPais(prepared);
  const reparations = aplicarReparacoes({ ...prepared, geopolitics: { ...prepared.geopolitics, peaceTreaty: { targetId: 'arg', status: 'pending' } } });

  assert.equal(imported.ok, true);
  assert.equal(imported.country.steel, prepared.country.steel + 100);
  assert.equal(demilitarized.geopolitics.contacts.find((contact) => contact.id === 'arg').demilitarizedMonths, 120);
  assert.equal(reparations.geopolitics.contacts.find((contact) => contact.id === 'arg').warReparations.remainingMonths, 120);
});
