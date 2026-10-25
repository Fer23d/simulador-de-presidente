import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSurfaceSectors, getExplorationPercent, getSector, getSectorExpedition, getSurfaceMap, isSectorSelectable,
  normalizeSurfaceMap, revealSector, SURFACE_MAP_SIZE,
} from '../src/core/surface_map.js';
import { advanceMonthlyGameMechanics, startExpedition } from '../src/core/game_mechanics.js';
import { createExpeditionLoot } from '../src/core/expeditions.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';
import { Inhabitant } from '../src/core/inhabitant.js';
import { expeditionLogisticsView } from '../src/ui/dashboard.js';

test('each city has its own deterministic 7x7 map with the Vault in the centre', () => {
  const capital = createSurfaceSectors('Capital');
  assert.equal(capital.length, SURFACE_MAP_SIZE * SURFACE_MAP_SIZE);
  assert.deepEqual(capital, createSurfaceSectors('Capital'));
  assert.notDeepEqual(capital.map((sector) => sector.type), createSurfaceSectors('Belo Horizonte').map((sector) => sector.type));
  assert.equal(capital.find((sector) => sector.id === '3-3').type, 'vault');
  assert.ok(capital.filter((sector) => sector.type === 'crater').every((sector) => sector.distance >= 2));
});

test('a new map reveals only the ring around the Vault', () => {
  const map = normalizeSurfaceMap(null, 'Capital');
  assert.equal(map.revealed.length, 9);
  assert.equal(isSectorSelectable(map, '2-2'), true);
  assert.equal(isSectorSelectable(map, '3-3'), false);
  assert.equal(isSectorSelectable(map, '0-0'), false);
  assert.equal(getExplorationPercent(map), 0);
});

test('distance and sector type set duration, risk and loot', () => {
  const near = getSectorExpedition({ type: 'ruins', distance: 1 });
  const far = getSectorExpedition({ type: 'crater', distance: 3 });
  assert.equal(near.months, 2);
  assert.equal(far.months, 4);
  assert.ok(far.successChance < near.successChance);
  assert.ok(far.loot.amountMultiplier > near.loot.amountMultiplier);
  assert.equal(near.loot.focus, 'scrap');
  const market = createExpeditionLoot(5, getSectorExpedition({ type: 'market', distance: 2 }).loot);
  assert.equal(market.loot[0].resource, 'food');
  assert.deepEqual(createExpeditionLoot(5), createExpeditionLoot(5, {}));
});

test('exploring a sector reveals its neighbours and raises the explored share', () => {
  const map = revealSector(normalizeSurfaceMap(null, 'Capital'), '2-3');
  assert.ok(map.revealed.includes('1-3'));
  assert.ok(map.explored.includes('2-3'));
  assert.equal(getExplorationPercent(map), 2);
});

test('expeditions target a map sector and a successful return maps the area', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const scout = base.inhabitants[0].id;
  const started = startExpedition(base, scout, '2-3');
  const explorer = started.inhabitants.find((npc) => npc.id === scout);
  const sector = getSector(getSurfaceMap(started), '2-3');
  assert.equal(explorer.expedition_sector, '2-3');
  assert.equal(explorer.expedition_destination, sector.name);
  assert.equal(explorer.expedition_timer, getSectorExpedition(sector).months);
  assert.equal(new Inhabitant(explorer).snapshot().expedition_sector, '2-3');
  assert.equal(startExpedition(base, scout, '0-0').inhabitants[0].expedition_sector, undefined);

  const returning = { ...started, randomSeed: 1, inhabitants: started.inhabitants.map((npc) => npc.id === scout
    ? { ...npc, expedition_timer: 1 } : npc) };
  let result = null;
  for (let seed = 1; seed < 50 && !result?.pendingExpeditionReports?.at(-1)?.success; seed++) {
    result = advanceMonthlyGameMechanics({ ...returning, randomSeed: seed });
  }
  assert.equal(result.pendingExpeditionReports.at(-1).sectorId, '2-3');
  assert.ok(result.surface_map.explored.includes('2-3'));
  assert.equal(result.inhabitants.find((npc) => npc.id === scout).expedition_sector, undefined);
  assert.deepEqual(hydrateGameState(JSON.stringify(result)).surface_map, result.surface_map);
});

test('the vault logistics panel draws the map with fog and a default sector', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const view = expeditionLogisticsView(base);
  assert.equal((view.match(/data-expedition-sector/g) ?? []).length, 8);
  assert.equal((view.match(/surface-cell--fog/g) ?? []).length, 40);
  assert.match(view, /EXPLORADO 0%/);
  assert.match(view, /checked/);
});
