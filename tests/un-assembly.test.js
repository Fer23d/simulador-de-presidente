import test from 'node:test';
import assert from 'node:assert/strict';

import { RESOLUTIONS, aplicarResolucoes, registrarVotoONU, verificarAssembleia } from '../src/core/un_assembly.js';
import { createGameState } from '../src/core/game-state.js';

test('opens a blocking UN vote every sixty months', () => {
  const state = { ...createGameState('bra'), calendar: { month: 1, year: 2031 }, randomSeed: 1 };
  const result = verificarAssembleia(state);

  assert.ok(result.pendingUnVote);
  assert.ok(RESOLUTIONS.some((resolution) => resolution.id === result.pendingUnVote.resolutionId));
});

test('records the player vote and activates an approved global resolution', () => {
  const state = {
    ...createGameState('bra'),
    pendingUnVote: { resolutionId: 'humanitarian-aid', npcVotes: { yes: 150, no: 49, abstain: 0 } },
  };
  const result = registrarVotoONU(state, 'yes');

  assert.equal(result.pendingUnVote, null);
  assert.equal(result.activeGlobalResolutions.includes('humanitarian-aid'), true);
});

test('counts leader-double puppets exactly with the player vote', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    pendingUnVote: { resolutionId: 'humanitarian-aid', npcVotes: { yes: 99, no: 100, abstain: 0 } },
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, is_puppet_of: 'jogador' } : contact) },
  };

  const result = registrarVotoONU(prepared, 'yes');

  assert.equal(result.activeGlobalResolutions.includes('humanitarian-aid'), true);
});

test('applies carbon tax pressure to oil rich nations without mutating the source state', () => {
  const state = {
    ...createGameState('bra'),
    activeGlobalResolutions: ['carbon-tax'],
    country: { ...createGameState('bra').country, trait: 'oil_rich', pib_base: 1_000_000 },
  };
  const result = aplicarResolucoes(state);

  assert.ok(result.country.pib_base < state.country.pib_base);
  assert.equal(state.country.pib_base, 1_000_000);
});
