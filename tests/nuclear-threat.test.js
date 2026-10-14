import test from 'node:test';
import assert from 'node:assert/strict';

import { COUNTRIES } from '../src/data/countries.js';
import { createGameState, insultarNacao } from '../src/core/game-state.js';
import { nextRandom } from '../src/core/geopolitics.js';
import { diplomacyView } from '../src/ui/dashboard.js';

function seedFor(probability) {
  for (let seed = 1; seed < 100_000; seed += 1) {
    if (nextRandom(seed).value < probability) return seed;
  }
  throw new Error('seed deterministica nao encontrada');
}

test('marks exactly the nine real nuclear powers in the country seed', () => {
  const expected = new Set(['usa', 'rus', 'chn', 'fra', 'gbr', 'ind', 'pak', 'isr', 'prk']);
  const actual = new Set(COUNTRIES.filter((country) => country.has_nukes).map((country) => country.id));

  assert.deepEqual(actual, expected);
});

test('shows a prominent nuclear warning only for nuclear powers', () => {
  const markup = diplomacyView(createGameState('bra'));
  const russiaRow = markup.match(/data-country-name="Rússia"[\s\S]*?<\/article>/)?.[0] ?? '';
  const argentinaRow = markup.match(/data-country-name="Argentina"[\s\S]*?<\/article>/)?.[0] ?? '';

  assert.match(russiaRow, /POTÊNCIA NUCLEAR/);
  assert.doesNotMatch(argentinaRow, /POTÊNCIA NUCLEAR/);
});

test('insulting a non-nuclear country can start only a conventional war', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    randomSeed: seedFor(0.5),
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, relation: 20 } : contact),
    },
  };

  const result = insultarNacao(prepared, 'arg');

  assert.equal(result.pendingHostileAlert.type, 'war');
  assert.equal(result.global_defcon, 5);
  assert.equal(result.is_wasteland, false);
});

test('a nuclear power retaliates with Fallout after a lethal insult when a Vault exists', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    vault_built: true,
    randomSeed: seedFor(0.5),
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'rus' ? { ...contact, relation: 20 } : contact),
    },
  };

  const result = insultarNacao(prepared, 'rus');

  assert.equal(result.is_wasteland, true);
  assert.equal(result.global_defcon, 1);
  assert.equal(result.pendingHostileAlert, null);
  assert.equal(result.wasteland_cinematic_pending, true);
});
