import test from 'node:test';
import assert from 'node:assert/strict';

import { COUNTRIES } from '../src/data/countries.js';
import { getRecruitmentCostMultiplier, getTraitModifiers } from '../src/core/traits.js';

test('assigns exactly one trait to every playable country', () => {
  assert.equal(COUNTRIES.every((country) => typeof country.trait === 'string' && country.trait.length > 0), true);
});

test('exposes concrete modifiers for strategic country traits', () => {
  assert.equal(getRecruitmentCostMultiplier('military_tradition'), 0.5);
  assert.ok(getTraitModifiers({ trait: 'financial_hub' }, { cash: 100 }).cashInterest > 0);
  assert.equal(getTraitModifiers({ trait: 'tech_giant' }, {}).researchMultiplier, 2);
});
