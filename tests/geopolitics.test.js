import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceGeopolitics,
  anexarPais,
  alterarNotaONU,
  checarFimDeGuerra,
  criarLiga,
  createGeopolitics,
  declareWar,
  saquearTesouro,
  sabotar,
  proposeAlliance,
  proposeTradeTreaty,
} from '../src/core/geopolitics.js';
import { createGameState } from '../src/core/game-state.js';

const economy = {
  gdp: 2_000_000_000_000,
  cash: 150_000_000_000,
  popularity: 55,
};

test('only signs a trade treaty above relation 30 and outside war', () => {
  const state = createGeopolitics();
  const rejected = proposeTradeTreaty(state, 'usa');
  const eligible = {
    ...state,
    contacts: state.contacts.map((item) => item.id === 'usa' ? { ...item, relation: 31 } : item),
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

test('requires relation 50 or higher for an alliance invitation', () => {
  const state = createGeopolitics();
  const tradeReady = {
    ...state,
    contacts: state.contacts.map((item) => item.id === 'arg' ? { ...item, tradeTreaty: true, relation: 49 } : item),
  };
  const accepted = {
    ...tradeReady,
    contacts: tradeReady.contacts.map((item) => item.id === 'arg' ? { ...item, relation: 50 } : item),
  };

  assert.equal(proposeAlliance(tradeReady, 'arg').ok, false);
  assert.equal(proposeAlliance(accepted, 'arg').ok, true);
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

test('ends a war and opens one peace treaty when the enemy power reaches zero', () => {
  const atWar = declareWar(createGeopolitics(), 'arg').geopolitics;
  const result = advanceGeopolitics(atWar, { power: 300, equipmentMultiplier: 1 }, economy, 7);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.atWar, false);
  assert.equal(target.militaryPower, 0);
  assert.deepEqual(result.geopolitics.peaceTreaty, { targetId: 'arg', status: 'pending' });
});

test('opens a peace treaty from a defeated target without advancing the calendar', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, militaryPower: 0, atWar: true }
        : contact),
    },
  };

  const result = checarFimDeGuerra(prepared, 'arg');

  assert.deepEqual(result.geopolitics.peaceTreaty, { targetId: 'arg', status: 'pending' });
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').atWar, false);
});

test('annexation transfers population, area, GDP and cash from the pending treaty target', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, militaryPower: 0, cash: 10_000 }
        : contact),
    },
  };

  const result = anexarPais(prepared);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(result.country.area_km2, state.country.area_km2 + 2_780_400);
  assert.equal(result.country.populacao_base, state.country.populacao_base + 45_808_747);
  assert.equal(result.economy.cash, state.economy.cash + 10_000);
  assert.equal(target.destruido, true);
  assert.equal(target.cash, 0);
  assert.equal(result.geopolitics.peaceTreaty, null);
});

test('looting a pending treaty transfers eighty percent and damages relations', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, militaryPower: 0, cash: 10_000 }
        : contact),
    },
  };

  const result = saquearTesouro(prepared);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(result.economy.cash, state.economy.cash + 8_000);
  assert.equal(target.cash, 2_000);
  assert.equal(target.relation, -100);
  assert.equal(result.geopolitics.peaceTreaty, null);
});

test('creates a league only when the full state can afford it and has ONU reputation', () => {
  const state = createGameState('bra');
  const result = criarLiga(state, 'Liga dos Democratas');

  assert.equal(result.geopolitics.league.name, 'Liga dos Democratas');
  assert.equal(result.geopolitics.league.leaderId, 'bra');
  assert.equal(result.economy.cash, state.economy.cash - 25_000_000_000);
});

test('creates one diplomatic world entry for every foreign country', () => {
  const state = createGameState('bra');

  assert.equal(state.world.length, 199);
  assert.equal(state.world.some((country) => country.id === 'bra'), false);
});

test('commercial agreement above thirty relation grants permanent growth and ONU reputation', () => {
  const geopolitics = {
    ...createGeopolitics(),
    contacts: createGeopolitics().contacts.map((contact) => contact.id === 'arg' ? { ...contact, relation: 31 } : contact),
  };
  const result = proposeTradeTreaty(geopolitics, 'arg');

  assert.equal(result.ok, true);
  assert.equal(result.geopolitics.tradeGrowthBonus, 0.005);
  assert.equal(result.geopolitics.onuScore, geopolitics.onuScore + 1);
});

test('annexation inherits the defeated military branches', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, militaryPower: 0, military: { exercito: { soldados: 12_000, blindados: 7 }, marinha: { navios: 3 }, aeronautica: { cacas: 4 } } }
        : contact),
    },
  };
  const result = anexarPais(prepared);

  assert.equal(result.military.exercito.soldados, state.military.exercito.soldados + 12_000);
  assert.equal(result.military.exercito.blindados, state.military.exercito.blindados + 7);
  assert.equal(result.military.marinha.navios, state.military.marinha.navios + 3);
  assert.equal(result.military.aeronautica.cacas, state.military.aeronautica.cacas + 4);
});
