import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, doarTerritorio, soltarComoFantoche } from '../src/core/game-state.js';
import { getAnnexedByRivals } from '../src/core/world_order.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const contact = (s, id) => s.geopolitics.contacts.find((c) => c.id === id);
const base = () => {
  let s = { ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null, pendingEvent: null };
  s = patch(s, 'ury', { anexado: true, annexed: true, destruido: true, militaryPower: 0, population: 0, area_km2: 0, pib_base: 0 });
  s = { ...s, geopolitics: { ...s.geopolitics, annexedCountryIds: ['ury'], onuScore: 50 } };
  return patch(s, 'arg', { alliance: true, relation: 60 });
};

test('soltar como fantoche: volta a existir, vira fantoche seu e a ONU sobe', () => {
  const s = soltarComoFantoche(base(), 'ury');
  const c = contact(s, 'ury');
  assert.equal(c.anexado, false);
  assert.equal(c.destruido, false);
  assert.equal(c.puppet, true);
  assert.equal(c.is_puppet_of, 'jogador');
  assert.ok(c.population > 0 && c.militaryPower >= 5);
  assert.equal(s.geopolitics.onuScore, 58);
  assert.equal(s.geopolitics.annexedCountryIds.includes('ury'), false);
});

test('doar a aliado: territorio fica com ele, relacao e ONU sobem, nao conta como anexacao de rival', () => {
  const s0 = base();
  const power = contact(s0, 'arg').militaryPower;
  const s = doarTerritorio(s0, 'ury', 'arg');
  assert.equal(contact(s, 'ury').annexedBy, 'arg');
  assert.equal(contact(s, 'ury').donated, true);
  assert.equal(contact(s, 'ury').anexado, false);
  assert.ok(contact(s, 'arg').relation > 60);
  assert.ok(contact(s, 'arg').militaryPower > power);
  assert.equal(s.geopolitics.onuScore, 53);
  assert.equal(getAnnexedByRivals(s).some((c) => c.id === 'ury'), false);
});

test('recusas: nao anexado, doar a nao aliado e a sede do governo', () => {
  const s = base();
  assert.equal(contact(soltarComoFantoche(s, 'chl'), 'chl').puppet, undefined);
  assert.equal(doarTerritorio(s, 'ury', 'per').notice.includes('aliado'), true);
  assert.equal(contact(doarTerritorio(s, 'ury', 'per'), 'ury').annexedBy ?? null, null);
  const capital = { ...s, capitalId: 'ury' };
  assert.equal(contact(soltarComoFantoche(capital, 'ury'), 'ury').anexado, true);
});
