import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, HOSTILITY_COOLDOWN_MONTHS, HOSTILITY_GRACE_MONTHS } from '../src/core/game-state.js';
import { processarAgressaoIA } from '../src/core/geopolitics.js';

function hostileWorld(state) {
  const contacts = state.geopolitics.contacts.map((contact) => ({ ...contact, relation: -10, atWar: false, has_nukes: false }));
  return { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
}

test('no maximo um pais declara guerra por mes', () => {
  const result = processarAgressaoIA(hostileWorld(createGameState()), 1);
  assert.equal(result.geopolitics.contacts.filter((contact) => contact.atWar).length, 1);
});

test('nao ha declaracao de guerra durante a carencia inicial', () => {
  assert.ok(HOSTILITY_GRACE_MONTHS >= 12);
  const state = hostileWorld(createGameState());
  const next = advanceMonth({ ...state, monthCounter: 0 });
  assert.equal(next.geopolitics.contacts.some((contact) => contact.atWar && contact.defensiveWar), false);
});

test('guerra recem declarada impoe intervalo antes da proxima', () => {
  assert.ok(HOSTILITY_COOLDOWN_MONTHS >= 6);
  const state = hostileWorld(createGameState());
  const contacts = state.geopolitics.contacts.map((contact, index) => (index === 0 ? { ...contact, atWar: true, defensiveWar: true } : contact));
  const next = advanceMonth({ ...state, monthCounter: 40, geopolitics: { ...state.geopolitics, contacts } });
  assert.equal(next.geopolitics.contacts.filter((contact) => contact.atWar && contact.defensiveWar).length, 1);
});

test('interrogatorio gratuito pode ser resolvido mesmo com o caixa negativo', async () => {
  const { escolherInterrogatorio } = await import('../src/core/interrogation.js');
  const base = createGameState();
  const state = { ...base, economy: { ...base.economy, cash: -5_000_000_000 }, pendingInterrogation: { phase: 'choice', prisonerId: 847 } };
  const result = escolherInterrogatorio(state, 'soro');
  assert.notEqual(result.pendingInterrogation?.phase, 'choice', 'nao pode travar o avanço do mes');
});
