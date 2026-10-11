import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceTechnology,
  createTechnology,
  getTechnologyModifiers,
  purchaseTechnology,
} from '../src/core/technology.js';

test('generates research points from science budget spending', () => {
  const result = advanceTechnology(createTechnology(), { gdp: 2_000_000_000_000 }, { scienceSpend: 0.04 });

  assert.ok(result.points > 0);
});

test('spends research points once to unlock a technology', () => {
  const funded = { ...createTechnology(), points: 150 };
  const purchased = purchaseTechnology(funded, 'drones');

  assert.equal(purchased.ok, true);
  assert.ok(purchased.technology.unlocked.includes('drones'));
  assert.equal(purchaseTechnology(purchased.technology, 'drones').ok, false);
});

test('derives economic and military modifiers from unlocked technologies', () => {
  const modifiers = getTechnologyModifiers({ points: 0, unlocked: ['drones', 'ai-logistics', 'genetic-medicine'] });

  assert.ok(modifiers.militaryEffectiveness > 0);
  assert.ok(modifiers.growthModifier > 0);
  assert.ok(modifiers.popularityModifier > 0);
});
