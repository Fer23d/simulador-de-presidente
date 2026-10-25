import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpeditionLocation, createExpeditionNodes, resolveExpeditionLocation } from '../src/core/expeditions.js';
import { startExpedition } from '../src/core/game_mechanics.js';
import { expeditionLogisticsView, expeditionReportView } from '../src/ui/dashboard.js';

test('expedition destinations use the reverse-geocoded city name', async () => {
  const location = await resolveExpeditionLocation({
    geolocation: { getCurrentPosition(success) { success({ coords: { latitude: -19.92, longitude: -43.94 } }); } },
    fetchImpl: async (url) => {
      assert.match(String(url), /lat=-19\.92/);
      assert.match(String(url), /lon=-43\.94/);
      return { ok: true, json: async () => ({ address: { city: 'Belo Horizonte' } }) };
    },
  });

  assert.deepEqual(location, {
    city: 'Belo Horizonte',
    nodes: [
      'Ruínas de Belo Horizonte',
      'Cratera do Mineirão',
      'Acampamento da Praça da Liberdade',
    ],
    source: 'geolocation',
  });
});

test('expedition location falls back when permission is denied', async () => {
  const location = await resolveExpeditionLocation({
    geolocation: { getCurrentPosition(_success, error) { error(new Error('denied')); } },
    fetchImpl: async () => { throw new Error('fetch must not run after denial'); },
  });

  assert.equal(location.city, 'Capital');
  assert.equal(location.source, 'fallback');
});

test('expedition location falls back for unavailable geolocation or an invalid reverse-geocode response', async () => {
  const unavailable = await resolveExpeditionLocation({ geolocation: null, fetchImpl: async () => ({}) });
  const invalidResponse = await resolveExpeditionLocation({
    geolocation: { getCurrentPosition(success) { success({ coords: { latitude: 0, longitude: 0 } }); } },
    fetchImpl: async () => ({ ok: true, json: async () => ({ address: {} }) }),
  });

  assert.equal(unavailable.city, 'Capital');
  assert.equal(invalidResponse.city, 'Capital');
});

test('destination generator trims unsafe or empty location labels to the safe fallback', () => {
  assert.deepEqual(createExpeditionNodes('  '), createExpeditionNodes('Capital'));
  assert.deepEqual(createExpeditionNodes('Belo Horizonte'), [
    'Ruínas de Belo Horizonte',
    'Cratera do Mineirão',
    'Acampamento da Praça da Liberdade',
  ]);
});

test('the selected real-world route is attached to the explorer and shown in logistics and report UI', () => {
  const state = {
    is_wasteland: true,
    inhabitants: [{ id: 'scout-1', is_on_expedition: false, is_prisoner: false, currentState: 'idle' }],
    expeditionLocation: createExpeditionLocation('Belo Horizonte', 'geolocation'),
  };
  const destination = 'Cratera do Mineirão';
  const started = startExpedition(state, 'scout-1', destination);
  const logistics = expeditionLogisticsView(state);
  const report = expeditionReportView({ pendingExpeditionReports: [{ id: 'm1-scout-1', inhabitantId: 'scout-1', success: true, destination }] });

  assert.equal(started.inhabitants[0].expedition_destination, destination);
  assert.match(logistics, /data-expedition-sector/);
  assert.match(logistics, /OpenStreetMap/);
  assert.match(report, /DESTINO: Cratera do Mineirão/);
});

test('an expedition route from an unknown place resolves to the generic fallback node', () => {
  const result = startExpedition({
    is_wasteland: true,
    inhabitants: [{ id: 'scout-1' }],
  }, 'scout-1', 'Invalid location');

  assert.equal(result.inhabitants[0].expedition_destination, 'Ruínas da Capital');
});
