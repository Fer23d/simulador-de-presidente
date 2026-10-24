import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWeather, CLEAR_DURATION_MS, createWeatherState, getWeather, STORM_DURATION_MS, WEATHER_TYPES } from '../src/core/weather.js';
import { startExpedition } from '../src/core/game_mechanics.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { bunkerEnvironmentHudView, expeditionLogisticsView } from '../src/ui/dashboard.js';

test('weather state defaults to clear skies and rejects invalid saves', () => {
  assert.deepEqual(createWeatherState(), { type: 'clear', remainingMs: CLEAR_DURATION_MS[0], seed: 1 });
  assert.equal(createWeatherState({ type: 'meteor', remainingMs: -5 }).type, 'clear');
  assert.equal(getWeather({ weather: { type: 'acid_rain' } }).label, 'CHUVA ÁCIDA');
});

test('clear skies roll into a storm and storms always clear up afterwards', () => {
  const storm = advanceWeather({ type: 'clear', remainingMs: 1_000, seed: 3 }, 1_000);
  assert.equal(storm.changed, true);
  assert.notEqual(storm.type, 'clear');
  assert.ok(storm.remainingMs >= STORM_DURATION_MS[0] && storm.remainingMs <= STORM_DURATION_MS[1]);
  const cleared = advanceWeather({ ...storm, changed: undefined }, storm.remainingMs);
  assert.equal(cleared.type, 'clear');
  assert.ok(cleared.remainingMs >= CLEAR_DURATION_MS[0] && cleared.remainingMs <= CLEAR_DURATION_MS[1]);
  const waiting = advanceWeather({ type: 'clear', remainingMs: 5_000, seed: 3 }, 1_000);
  assert.deepEqual(waiting, { type: 'clear', remainingMs: 4_000, seed: 3, changed: false });
});

test('every storm type appears over a long run', () => {
  let weather = createWeatherState({ seed: 11 });
  const seen = new Set();
  for (let step = 0; step < 200; step++) {
    weather = advanceWeather(weather, weather.remainingMs);
    seen.add(weather.type);
  }
  assert.deepEqual([...seen].sort(), Object.keys(WEATHER_TYPES).sort());
});

test('storms suspend expeditions in the rules and in the vault logistics panel', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const stormy = { ...base, weather: { type: 'dust', remainingMs: 60_000, seed: 1 } };
  const inhabitantId = base.inhabitants[0].id;
  const blocked = startExpedition(stormy, inhabitantId);
  assert.match(blocked.notice, /TEMPESTADE DE POEIRA/);
  assert.equal(blocked.inhabitants.find((npc) => npc.id === inhabitantId).is_on_expedition, false);
  assert.equal(startExpedition(base, inhabitantId).inhabitants.find((npc) => npc.id === inhabitantId).is_on_expedition, true);
  const view = expeditionLogisticsView(stormy);
  assert.match(view, /expedições suspensas/);
  assert.equal((view.match(/data-action="start-expedition"[^>]*disabled/g) ?? []).length, base.inhabitants.length);
});

test('a radioactive storm raises oxygen use, radiation and lowers morale for the month', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const calm = advanceWastelandMonth(base);
  const storm = advanceWastelandMonth({ ...base, weather: { type: 'radstorm', remainingMs: 60_000, seed: 1 } });
  assert.ok(storm.shelter_radiation > calm.shelter_radiation);
  assert.ok(storm.shelter_supplies.oxygen <= calm.shelter_supplies.oxygen);
  assert.equal(storm.inhabitants[0].needs.morale, calm.inhabitants[0].needs.morale - 10);
  assert.match(storm.notice, /TEMPESTADE RADIOATIVA/);
});

test('the HUD shows the active storm and the weather survives the save', () => {
  assert.doesNotMatch(bunkerEnvironmentHudView({}, false, [], 0, null, { type: 'clear' }), /environment-weather/);
  assert.match(bunkerEnvironmentHudView({}, false, [], 0, null, { type: 'acid_rain' }), /🌧 CHUVA ÁCIDA/);
  const saved = { ...createGameState('bra'), weather: { type: 'radstorm', remainingMs: 90_000, seed: 42 } };
  assert.deepEqual(hydrateGameState(JSON.stringify(saved)).weather, { type: 'radstorm', remainingMs: 90_000, seed: 42 });
});
