import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, advanceMonth, insultarNacao } from '../src/core/game-state.js';
import { advanceGeopolitics, nextRandom, processarAgressaoIA } from '../src/core/geopolitics.js';
import { diplomacyView } from '../src/ui/dashboard.js';

function seedFor(probability) {
  for (let seed = 1; seed < 100_000; seed += 1) {
    if (nextRandom(seed).value < probability) return seed;
  }
  throw new Error('seed deterministica nao encontrada');
}

test('renders the insult action in the diplomacy list', () => {
  assert.match(diplomacyView(createGameState('bra')), /INSULTAR LÍDER ESTRANGEIRO/);
});

test('insult reduces relations and can immediately start a defensive war', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: seedFor(0.5),
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, relation: 20 }
        : contact),
    },
  };
  const result = insultarNacao(prepared, 'arg');
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.relation, -10);
  assert.equal(target.atWar, true);
  assert.equal(target.defensiveWar, true);
  assert.equal(result.pendingHostileAlert.type, 'war');
  assert.ok(result.factions.elite > prepared.factions.elite);
});

test('the AI can start a hostile war during a monthly turn', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: seedFor(0.03),
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, relation: 0, atWar: false }
        : { ...contact, relation: 80 }),
    },
  };
  const result = processarAgressaoIA(prepared, 1);
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(target.atWar, true);
  assert.equal(target.defensiveWar, true);
  assert.equal(result.pendingHostileAlert.targetId, 'arg');
});

test('a defensive victory opens the peace treaty without an ONU annexation penalty', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    military: { ...state.military, power: 400 },
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, atWar: true, defensiveWar: true, warInitiator: 'arg', militaryPower: 1 }
        : contact),
    },
  };
  const result = advanceGeopolitics(prepared.geopolitics, prepared.military, prepared.economy, 7);

  assert.deepEqual(result.geopolitics.peaceTreaty, { targetId: 'arg', status: 'pending', defensiveVictory: true });
});

test('DEFCON 1 nuclear aggression transitions a vault nation into Wasteland', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    vault_built: true,
    global_defcon: 1,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'rus'
        ? { ...contact, relation: -80, nuclearWeapons: 1 }
        : contact),
    },
  };
  const result = advanceMonth(prepared);

  assert.equal(result.is_wasteland, true);
  assert.equal(result.pendingHostileAlert.type, 'nuclear');
});
