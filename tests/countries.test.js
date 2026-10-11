import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTRIES,
  createCountryProfile,
  getCountryById,
  validateCountries,
} from '../src/data/countries.js';

test('seed contains 200 unique countries with valid areas', () => {
  assert.equal(COUNTRIES.length, 200);
  assert.doesNotThrow(() => validateCountries(COUNTRIES));
});

test('finds Brazil with the expected total area', () => {
  assert.equal(getCountryById('bra').area_km2, 8515770);
});

test('derives a stable playable profile from a country', () => {
  const first = createCountryProfile(getCountryById('bra'));
  const second = createCountryProfile(getCountryById('bra'));

  assert.deepEqual(first, second);
  assert.ok(first.populacao_base > 0);
  assert.ok(first.pib_base > 0);
  assert.equal(typeof first.bioma_dominante, 'string');
});
