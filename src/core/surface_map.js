import { DEFAULT_EXPEDITION_CITY } from './expeditions.js';

export const SURFACE_MAP_SIZE = 7;
export const SURFACE_MAP_CENTER = 3;
export const BASE_SECTOR_SUCCESS_CHANCE = .7;

export const SECTOR_TYPES = Object.freeze({
  vault: Object.freeze({ id: 'vault', label: 'Vault', icon: '▣', loot: null, risk: 0 }),
  ruins: Object.freeze({ id: 'ruins', label: 'Ruínas residenciais', icon: '⌂', loot: 'scrap', risk: 0 }),
  market: Object.freeze({ id: 'market', label: 'Mercado saqueado', icon: '🥫', loot: 'food', risk: 0 }),
  hospital: Object.freeze({ id: 'hospital', label: 'Hospital abandonado', icon: '✚', loot: 'medkits', risk: .03 }),
  laboratory: Object.freeze({ id: 'laboratory', label: 'Laboratório universitário', icon: '⚗', loot: 'science', risk: .03 }),
  power_plant: Object.freeze({ id: 'power_plant', label: 'Usina desativada', icon: '⚡', loot: 'energy', risk: .03 }),
  military: Object.freeze({ id: 'military', label: 'Base militar', icon: '✪', loot: 'technology', risk: .08 }),
  camp: Object.freeze({ id: 'camp', label: 'Acampamento de sobreviventes', icon: '⛺', loot: 'food', risk: 0, vipMultiplier: 2 }),
  crater: Object.freeze({ id: 'crater', label: 'Cratera de impacto', icon: '☢', loot: null, risk: .15, epicChance: .35, amountBonus: .5 }),
});

const SECTOR_WEIGHTS = Object.freeze([
  ['ruins', .24], ['market', .14], ['hospital', .1], ['laboratory', .1], ['power_plant', .11],
  ['military', .1], ['camp', .11], ['crater', .1],
]);

function hashText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) hash = Math.imul(hash ^ character.codePointAt(0), 16_777_619);
  return hash >>> 0;
}

function sectorRandom(citySeed, x, y) {
  return hashText(`${citySeed}:${x}:${y}`) / 4_294_967_296;
}

export function sectorId(x, y) { return `${x}-${y}`; }

export function sectorDistance(x, y) {
  return Math.max(Math.abs(x - SURFACE_MAP_CENTER), Math.abs(y - SURFACE_MAP_CENTER));
}

function sectorCode(x, y) { return `${String.fromCharCode(65 + x)}${y + 1}`; }

// Gera a grade 7x7 da cidade de forma deterministica: a mesma cidade sempre tem o mesmo mapa.
export function createSurfaceSectors(city = DEFAULT_EXPEDITION_CITY) {
  const citySeed = hashText(String(city || DEFAULT_EXPEDITION_CITY).trim().toLowerCase());
  const sectors = [];
  for (let y = 0; y < SURFACE_MAP_SIZE; y++) {
    for (let x = 0; x < SURFACE_MAP_SIZE; x++) {
      const distance = sectorDistance(x, y);
      let type = 'vault';
      if (distance > 0) {
        let roll = sectorRandom(citySeed, x, y);
        const weights = SECTOR_WEIGHTS.filter(([id]) => id !== 'crater' || distance >= 2);
        const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
        roll *= total;
        type = weights.find(([, weight]) => (roll -= weight) < 0)?.[0] ?? 'ruins';
      }
      const spec = SECTOR_TYPES[type];
      sectors.push(Object.freeze({ id: sectorId(x, y), x, y, type, distance, code: sectorCode(x, y),
        name: type === 'vault' ? 'Vault' : `${spec.label} · ${sectorCode(x, y)}` }));
    }
  }
  return Object.freeze(sectors);
}

function initialRevealed() {
  const ids = [];
  for (let y = SURFACE_MAP_CENTER - 1; y <= SURFACE_MAP_CENTER + 1; y++) {
    for (let x = SURFACE_MAP_CENTER - 1; x <= SURFACE_MAP_CENTER + 1; x++) ids.push(sectorId(x, y));
  }
  return ids;
}

export function normalizeSurfaceMap(value, city = DEFAULT_EXPEDITION_CITY) {
  const label = String(city || DEFAULT_EXPEDITION_CITY).slice(0, 80);
  if (!value || typeof value !== 'object' || value.city !== label) {
    return { city: label, revealed: initialRevealed(), explored: [sectorId(SURFACE_MAP_CENTER, SURFACE_MAP_CENTER)] };
  }
  const valid = new Set(createSurfaceSectors(label).map((sector) => sector.id));
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => valid.has(id)))];
  const explored = clean(value.explored);
  return { city: label, revealed: [...new Set([...initialRevealed(), ...clean(value.revealed), ...explored])], explored };
}

export function getSurfaceMap(state) {
  return normalizeSurfaceMap(state?.surface_map, state?.expeditionLocation?.city ?? DEFAULT_EXPEDITION_CITY);
}

export function getSector(map, id) {
  return createSurfaceSectors(map.city).find((sector) => sector.id === id) ?? null;
}

export function isSectorSelectable(map, id) {
  const sector = getSector(map, id);
  return Boolean(sector && sector.type !== 'vault' && map.revealed.includes(id));
}

export function getSectorExpedition(sector) {
  const spec = SECTOR_TYPES[sector?.type] ?? SECTOR_TYPES.ruins;
  const distance = Math.max(1, sector?.distance ?? 1);
  return {
    months: distance + 1,
    successChance: Math.max(.2, BASE_SECTOR_SUCCESS_CHANCE - (distance - 1) * .08 - spec.risk),
    loot: { focus: spec.loot, amountMultiplier: 1 + (distance - 1) * .35 + (spec.amountBonus ?? 0),
      epicChance: spec.epicChance ?? .06 },
    vipMultiplier: spec.vipMultiplier ?? 1,
  };
}

// Explorar um setor o marca como conhecido e revela os vizinhos diretos.
export function revealSector(map, id) {
  const sector = getSector(map, id);
  if (!sector) return map;
  const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => [sector.x + dx, sector.y + dy])
    .filter(([x, y]) => x >= 0 && y >= 0 && x < SURFACE_MAP_SIZE && y < SURFACE_MAP_SIZE)
    .map(([x, y]) => sectorId(x, y));
  return { ...map, revealed: [...new Set([...map.revealed, id, ...neighbours])],
    explored: [...new Set([...map.explored, id])] };
}

export function getExplorationPercent(map) {
  const explorable = SURFACE_MAP_SIZE * SURFACE_MAP_SIZE - 1;
  const explored = map.explored.filter((id) => id !== sectorId(SURFACE_MAP_CENTER, SURFACE_MAP_CENTER)).length;
  return Math.round(explored / explorable * 100);
}
