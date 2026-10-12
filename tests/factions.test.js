import test from 'node:test';
import assert from 'node:assert/strict';

import { createFactions, getFactionModifiers, getFactionSupport, advanceFactions } from '../src/core/factions.js';
import { createRegime, evaluateRegime } from '../src/core/military.js';

test('creates four internal factions and derives national support from active factions', () => {
  const factions = createFactions();

  assert.deepEqual(factions, { elite: 50, trabalhadores: 50, militares: 50, religiosos: 50 });
  assert.equal(getFactionSupport(factions), 50);
});

test('applies an economic collapse debuff when the elite faction falls below twenty', () => {
  const modifiers = getFactionModifiers({ elite: 19, trabalhadores: 60, militares: 60, religiosos: 60 });

  assert.ok(modifiers.growthModifier < 0);
  assert.equal(modifiers.militaryCoup, false);
});

test('updates factions without adding a popularity field to the economy', () => {
  const result = advanceFactions(
    createFactions(),
    { gdp: 1_000, inflation: 0.04, unemployment: 0.08, cash: 1_000 },
    { gdp: 1_010, inflation: 0.03, unemployment: 0.07, cash: 1_100 },
    { defenseSpend: 0.06, socialSpend: 0.06, securitySpend: 0.03 },
  );

  assert.equal(Object.hasOwn(result, 'popularity'), false);
  assert.ok(result.militares > 50);
});

test('ends the game immediately when military support drops below twenty', () => {
  const result = evaluateRegime(createRegime(), { cash: 1, inflation: 0.04, unemployment: 0.08 }, { support: 50 }, { contacts: [] }, 1, { elite: 50, trabalhadores: 50, militares: 19, religiosos: 50 });

  assert.equal(result.regime.gameOver, true);
  assert.equal(result.regime.outcome, 'golpe-militar');
});
