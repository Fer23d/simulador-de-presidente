import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMonth,
  createGameState,
  executarAutoGolpe,
  resolverAutoGolpe,
  transicionarParaWasteland,
} from '../src/core/game-state.js';
import { buildMegaVault } from '../src/core/wasteland.js';

test('opens and resolves the empire auto-coup with its monthly military and diplomatic posture', () => {
  const state = createGameState('bra');
  const prepared = { ...state, economy: { ...state.economy, cash: 600_000_000_000 } };

  const pending = executarAutoGolpe(prepared);
  assert.equal(pending.pendingGovernmentChoice, true);

  const empire = resolverAutoGolpe(pending, 'empire');
  assert.equal(empire.government, 'empire');
  assert.equal(empire.title, 'Imperador Supremo');
  assert.equal(empire.economy.cash, 100_000_000_000);

  const month = advanceMonth(empire);
  assert.equal(month.government, 'empire');
  assert.ok(month.geopolitics.contacts.every((contact) => contact.relation < 50));
  assert.ok(month.military.combatAdjustment > empire.military.combatAdjustment);
});

test('corporate regime doubles tax revenue and ends the game after a negative treasury close', () => {
  const state = createGameState('bra');
  const prepared = { ...state, economy: { ...state.economy, cash: 600_000_000_000 } };
  const corporate = resolverAutoGolpe(executarAutoGolpe(prepared), 'corporate');

  assert.equal(corporate.government, 'corporate');
  assert.equal(corporate.title, 'CEO Estatal');
  const month = advanceMonth({ ...corporate, economy: { ...corporate.economy, cash: -1_000_000_000_000_000 } });
  assert.equal(month.regime.gameOver, true);
  assert.equal(month.regime.outcome, 'aquisicao-hostil');
});

test('a mega-vault converts nuclear collapse into a playable wasteland economy', () => {
  const state = createGameState('bra');
  const vault = buildMegaVault({
    ...state,
    economy: { ...state.economy, cash: 600_000_000_000 },
    country: { ...state.country, steel: 100_000 },
  });

  assert.equal(vault.vault_built, true);
  const wasteland = transicionarParaWasteland(vault, 'defcon-1');
  assert.equal(wasteland.is_wasteland, true);
  assert.equal(wasteland.economy.cash, 0);
  assert.equal(wasteland.country.populacao_base, 3_500);
  assert.equal(wasteland.geopolitics.contacts.length, 3);
  assert.equal(wasteland.scrap, 250);

  const next = advanceMonth(wasteland);
  assert.equal(next.is_wasteland, true);
  assert.equal(next.economy.cash, 0);
  assert.ok(next.scrap > wasteland.scrap);
});
