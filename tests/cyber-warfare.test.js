import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { advanceCyberWarfare, getCyberTech, lancarCiberataque } from '../src/core/cyber_warfare.js';

test('derives cyber attack effectiveness from military cyber research only', () => {
  assert.equal(getCyberTech(['cyber']), 85);
  assert.equal(getCyberTech(['state-hackers']), 25);
});

test('a successful zero-day paralyzes a target for six months without starting a war', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: 1,
    monthCounter: 10,
    unlocked_techs: ['cyber'],
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, cyber_defense: 0, atWar: false }
        : contact),
    },
  };

  const result = lancarCiberataque(prepared, 'arg');
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.cyber_paralyzed_until, 16);
  assert.equal(target.atWar, false);
});

test('rejects a zero-day without military cyber research', () => {
  const state = createGameState('bra');

  const result = lancarCiberataque(state, 'arg');

  assert.equal(result.geopolitics, state.geopolitics);
  assert.match(result.notice, /Ciber-Guerra/i);
});

test('cyber paralysis blocks resource output and temporarily halves GDP', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    monthCounter: 11,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, pib_base: 1_000_000, steel: 500, uranium: 100, cyber_paralyzed_until: 16 }
        : contact),
    },
  };

  const result = advanceCyberWarfare(prepared);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.pib_base, 500_000);
  assert.equal(target.steel, 500);
  assert.equal(target.uranium, 100);
});

test('cyber paralysis restores the original GDP after its deadline', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    monthCounter: 16,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, pib_base: 500_000, cyber_original_pib_base: 1_000_000, cyber_paralyzed_until: 16 }
        : contact),
    },
  };

  const result = advanceCyberWarfare(prepared);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.pib_base, 1_000_000);
  assert.equal(target.cyber_paralyzed_until, undefined);
});

test('uses and clears a double agent on the next cyber attack', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    double_agent_active: true,
    unlocked_techs: ['cyber'],
    monthCounter: 10,
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, cyber_defense: 100 } : contact) },
  };

  const result = lancarCiberataque(prepared, 'arg');

  assert.equal(result.double_agent_active, false);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').cyber_paralyzed_until, 16);
});
