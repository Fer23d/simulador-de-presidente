import test from 'node:test';
import assert from 'node:assert/strict';

import { absorverPaisParaUniao, decretarRevolucaoSocialista } from '../src/core/revolution.js';
import { createGameState } from '../src/core/game-state.js';

test('creates a socialist union only when the required faction alignment exists', () => {
  const state = {
    ...createGameState('bra'),
    factions: { elite: 35, trabalhadores: 81, militares: 61, religiosos: 50 },
  };
  const result = decretarRevolucaoSocialista(state);

  assert.equal(result.regime.type, 'communist_dictatorship');
  assert.equal(result.factions.elite, 0);
  assert.match(result.country.nome, /^Uniao Socialista do /);
});

test('absorbs a friendly country into a socialist union without starting a war', () => {
  const base = decretarRevolucaoSocialista({
    ...createGameState('bra'),
    factions: { elite: 30, trabalhadores: 90, militares: 70, religiosos: 50 },
  });
  const target = base.geopolitics.contacts.find((contact) => contact.id === 'arg');
  const ready = {
    ...base,
    geopolitics: {
      ...base.geopolitics,
      contacts: base.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, relation: 81 } : contact),
    },
  };
  const result = absorverPaisParaUniao(ready, 'arg');

  assert.equal(result.country.area_km2, ready.country.area_km2 + target.area_km2);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').destruido, true);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').atWar, false);
});
