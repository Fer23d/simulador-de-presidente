import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceTechnology,
  createTechnology,
  getTechnologyModifiers,
  purchaseTechnology,
  TECHNOLOGIES,
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

test('publishes deep research across energy, military, cybernetics, agronomy and health', () => {
  const branches = new Set(TECHNOLOGIES.map((technology) => technology.branch));

  for (const branch of ['Energia', 'Engenharia Militar', 'Cibernetica', 'Agronomia', 'Saude']) {
    assert.ok(branches.has(branch));
  }
  assert.ok(TECHNOLOGIES.some((technology) => technology.id === 'state-hackers'));
  assert.equal(getTechnologyModifiers({ points: 0, unlocked: ['exoskeletons'] }).infantryMultiplier, 2);
});

test('publishes late-game technologies with functional project effects', () => {
  const ids = new Set(TECHNOLOGIES.map((technology) => technology.id));
  for (const id of ['carbon-filtration', 'maglev', 'genetic-medicine', 'quantum-espionage', 'war-logistics-ai']) {
    assert.ok(ids.has(id), `missing technology ${id}`);
  }

  const modifiers = getTechnologyModifiers({
    points: 0,
    unlocked: ['carbon-filtration', 'maglev', 'genetic-medicine', 'quantum-espionage', 'war-logistics-ai'],
  });

  assert.equal(modifiers.environmentIndustryImpactModifier, 0.5);
  assert.equal(modifiers.infrastructureGrowthMultiplier, 1.5);
  assert.equal(modifiers.hospitalPopulationMultiplier, 2);
  assert.equal(modifiers.quantumEspionage, true);
  assert.equal(modifiers.militaryMaintenanceModifier, 0.5);
});
