import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEncyclopedia, detectDiscoveries, ENCYCLOPEDIA_CATEGORIES, ENCYCLOPEDIA_ENTRIES, getEncyclopediaProgress,
  recordDiscoveries,
} from '../src/core/encyclopedia.js';
import { normalizeSurfaceMap, revealSector, createSurfaceSectors } from '../src/core/surface_map.js';
import { WASTELAND_EVENTS } from '../src/core/game_mechanics.js';
import { SHELTER_TYPES } from '../src/core/shelter_engine.js';
import { createGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';
import { encyclopediaView } from '../src/ui/dashboard.js';

test('the catalog has unique ids, valid categories and covers every room and Wasteland dilemma', () => {
  const ids = ENCYCLOPEDIA_ENTRIES.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const categories = new Set(ENCYCLOPEDIA_CATEGORIES.map(([id]) => id));
  assert.ok(ENCYCLOPEDIA_ENTRIES.every((item) => categories.has(item.category) && item.name && item.text));
  for (const type of Object.keys(SHELTER_TYPES).filter((type) => type !== 'vault')) assert.ok(ids.includes(`room-${type}`), type);
  for (const event of WASTELAND_EVENTS) assert.ok(ids.includes(`event-${event.id}`), event.id);
});

test('nothing is discovered during the presidential phase', () => {
  assert.deepEqual(detectDiscoveries(createGameState('bra')), []);
});

test('weather, rooms, explored sectors, dilemmas, loot and conditions become discoveries', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  let map = normalizeSurfaceMap(null, 'Capital');
  map = revealSector(map, '2-3');
  const sectorType = createSurfaceSectors('Capital').find((sector) => sector.id === '2-3').type;
  const state = {
    ...base,
    weather: { type: 'radstorm' },
    isNight: true,
    surface_map: map,
    pendingBunkerEvent: { id: 'greenhouse-fungus' },
    lootbox_revealed: true,
    currentLoot: [{ resource: 'food', rarity: 'epic' }],
    oxygen_deprived: true,
    inhabitants: [{ id: 'a', needs: { satiety: 10, rest: 10 }, currentState: 'rebel' },
      { id: 'b', isVIP: true, name: 'Dr. Isaac' }],
  };
  const found = detectDiscoveries(state);
  for (const id of ['weather-radstorm', 'rare-radstorm-night', `sector-${sectorType}`, 'event-greenhouse-fungus',
    'loot-food', 'loot-epic', 'condition-asphyxia', 'condition-famine', 'condition-exhaustion', 'condition-rebellion',
    'vip-dr-isaac']) {
    assert.ok(found.includes(id), id);
  }
  assert.ok(!found.includes('rare-full-council'));
});

test('recording keeps the first discovery day and only reports new entries', () => {
  const first = recordDiscoveries(createEncyclopedia(), ['weather-dust', 'unknown-id'], { day: 3, now: 10 });
  assert.deepEqual(first.added.map((item) => item.id), ['weather-dust']);
  assert.deepEqual(first.encyclopedia.entries['weather-dust'], { day: 3, discoveredAt: 10 });
  const second = recordDiscoveries(first.encyclopedia, ['weather-dust'], { day: 9, now: 99 });
  assert.equal(second.added.length, 0);
  assert.equal(second.encyclopedia.entries['weather-dust'].day, 3);
  assert.deepEqual(getEncyclopediaProgress(second.encyclopedia), { discovered: 1, total: ENCYCLOPEDIA_ENTRIES.length });
  assert.deepEqual(createEncyclopedia({ entries: { bogus: { day: 1 } } }).entries, {});
});

test('the encyclopedia view shows progress, category tabs and locked entries', () => {
  const { encyclopedia } = recordDiscoveries(createEncyclopedia(), ['weather-acid_rain'], { day: 4 });
  const view = encyclopediaView(encyclopedia);
  assert.match(view, new RegExp(`1/${ENCYCLOPEDIA_ENTRIES.length} DESCOBERTOS`));
  assert.match(view, /CHUVA ÁCIDA|Chuva Ácida/);
  assert.match(view, /DESCOBERTO NO DIA 4/);
  assert.match(view, /\?\?\?/);
  assert.equal((view.match(/data-encyclopedia-category/g) ?? []).length, ENCYCLOPEDIA_CATEGORIES.length);
  assert.match(encyclopediaView(encyclopedia, 'rare'), /aria-pressed="true">Raros/);
});
