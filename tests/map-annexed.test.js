import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/game-state.js';
import { COUNTRY_PATHS } from '../src/data/world_map.js';
import { diplomacyMap } from '../src/ui/dashboard.js';

test('pais anexado aparece no mapa como territorio do jogador', () => {
  const state = createGameState('bra');
  const target = state.geopolitics.contacts.find((contact) => COUNTRY_PATHS[contact.id]);
  const annexed = { ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === target.id ? { ...contact, anexado: true, destruido: true } : contact)) } };
  annexed.world = annexed.geopolitics.contacts;
  const html = diplomacyMap(annexed, { selected: target.id });
  assert.match(html, /map-shape--mine/);
  assert.match(html, /território seu/);
  assert.match(html, /Meu território/);
  assert.doesNotMatch(diplomacyMap(state), /map-shape--mine/);
  const destroyed = { ...annexed, world: annexed.geopolitics.contacts.map((contact) => (contact.id === target.id ? { ...contact, anexado: false } : contact)) };
  assert.doesNotMatch(diplomacyMap(destroyed), /map-shape--mine/);
  assert.ok(!diplomacyMap(destroyed).includes('data-country="' + target.id + '"'), 'pais destruido some do mapa');
});
