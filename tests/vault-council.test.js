import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { transicionarParaWasteland, advanceWastelandMonth } from '../src/core/wasteland.js';
import { getCouncilModifiers } from '../src/core/vault_council.js';
import { renderStoryCard } from '../src/ui/dashboard.js';

function vault() {
  return { ...transicionarParaWasteland(createGameState('bra')), randomSeed: 7 };
}

test('the first Council meets on the third month and alternates with survival dilemmas', () => {
  let state = vault();
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  assert.equal(state.pendingBunkerEvent?.id, 'council-gate-protocol');

  state = resolveWastelandEvent(state, 'council-keep-the-door-human');
  assert.equal(state.pendingBunkerEvent, null);
  assert.equal(state.vaultCouncil.relationships.commander, 38);
  assert.equal(state.vaultCouncil.relationships.medic, 60);

  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  assert.equal(state.pendingBunkerEvent?.id, 'ration-emergency');
});

test('Council trust creates narrow, persistent specialists bonuses', () => {
  const modifiers = getCouncilModifiers({ relationships: { commander: 75, medic: 70, engineer: 74 } });
  assert.equal(modifiers.generatorMultiplier, 1.1);
  assert.equal(modifiers.radiationReduction, 1);
  assert.equal(modifiers.suppressionBonus, .08);
});

test('Council cards reuse the shared Story Mode interface and show relationships', () => {
  const state = { ...vault(), pendingBunkerEvent: { id: 'council-gate-protocol' } };
  const markup = renderStoryCard(state);
  assert.match(markup, /CONSELHO DO VAULT/);
  assert.match(markup, /Comandante Helena Voss/);
  assert.match(markup, /CONFIANÇA/);
  assert.match(markup, /data-option="council-arm-the-watch"/);
});
