import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_LEVELS, SCALE_MAX, SCALE_MIN, normalizeImageSettings } from '../src/core/image_settings.js';

test('padrao e alta qualidade em 100% e valores invalidos voltam ao padrao', () => {
  assert.deepEqual(normalizeImageSettings(), { quality: 'high', scale: 1 });
  assert.deepEqual(normalizeImageSettings({ imageQuality: 'ultra', uiScale: 'x' }), { quality: 'high', scale: 1 });
  assert.deepEqual(normalizeImageSettings(null), { quality: 'high', scale: 1 });
});

test('qualidade aceita os tres niveis e a escala fica entre os limites, em passos de 5%', () => {
  for (const level of QUALITY_LEVELS) assert.equal(normalizeImageSettings({ imageQuality: level.id }).quality, level.id);
  assert.equal(normalizeImageSettings({ uiScale: 5 }).scale, SCALE_MAX);
  assert.equal(normalizeImageSettings({ uiScale: 0.1 }).scale, SCALE_MIN);
  assert.equal(normalizeImageSettings({ uiScale: 1.12 }).scale, 1.1);
});
