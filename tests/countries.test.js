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

test('uses real population data for countries shown in the interactive map', () => {
  assert.equal(createCountryProfile(getCountryById('bra')).populacao_base, 212583750);
  assert.equal(createCountryProfile(getCountryById('usa')).populacao_base, 340110988);
  assert.equal(createCountryProfile(getCountryById('rus')).populacao_base, 143957079);
  assert.equal(createCountryProfile(getCountryById('chn')).populacao_base, 1409670000);
});
