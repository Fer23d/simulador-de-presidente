export const DEFAULT_EXPEDITION_CITY = 'Capital';
export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

import { nextRandom } from './geopolitics.js';
import { getRoomStorageCapacity } from './bunker_economy.js';

const LOOT_OPTIONS = Object.freeze([
  Object.freeze({ resource: 'scrap', label: 'Sucata', minimum: 120, range: 381 }),
  Object.freeze({ resource: 'food', label: 'Comida', minimum: 80, range: 321 }),
  Object.freeze({ resource: 'energy', label: 'Energia', minimum: 60, range: 241 }),
  Object.freeze({ resource: 'science', label: 'Ciência', minimum: 40, range: 161 }),
  Object.freeze({ resource: 'technology', label: 'Pontos de Tecnologia', minimum: 1, range: 3 }),
  Object.freeze({ resource: 'medkits', label: 'Curativos', minimum: 1, range: 3 }),
]);

// Opcoes do setor explorado: recurso garantido no primeiro item, multiplicador de quantidade e chance de item epico.
export function createExpeditionLoot(seed = 1, { focus = null, amountMultiplier = 1, epicChance = 0.06 } = {}) {
  let randomSeed = Number(seed) >>> 0;
  const loot = [];
  for (let index = 0; index < 3; index++) {
    const selection = nextRandom(randomSeed);
    randomSeed = selection.seed;
    const amountRoll = nextRandom(randomSeed);
    randomSeed = amountRoll.seed;
    const rarityRoll = nextRandom(randomSeed);
    randomSeed = rarityRoll.seed;
    const rolled = LOOT_OPTIONS[Math.floor(selection.value * LOOT_OPTIONS.length)];
    const option = index === 0 && focus ? LOOT_OPTIONS.find((candidate) => candidate.resource === focus) ?? rolled : rolled;
    loot.push({
      id: `loot-${randomSeed}-${index}`,
      resource: option.resource,
      label: option.label,
      amount: Math.round((option.minimum + Math.floor(amountRoll.value * option.range)) * Math.max(1, Number(amountMultiplier) || 1)),
      rarity: rarityRoll.value < Math.max(0.06, Number(epicChance) || 0) ? 'epic' : rarityRoll.value < 0.28 ? 'rare' : 'common',
    });
  }
  return { loot, randomSeed };
}

export function openExpeditionLootbox(state) {
  if (!state?.pendingLoot || state.lootbox_opened || !Array.isArray(state.currentLoot) || !state.currentLoot.length) return state;
  return { ...state, lootbox_opened: true, lootbox_click_count: 0, lootbox_revealed: false,
    lootbox_cards_visible: false, lootbox_shake_started_at: null, lootbox_revealed_at: null };
}

export function advanceLootboxClick(state, time = 0) {
  if (!state?.pendingLoot || !state.lootbox_opened || state.lootbox_revealed) return state;
  const clickCount = Math.min(3, (Number(state.lootbox_click_count) || 0) + 1);
  return {
    ...state,
    lootbox_click_count: clickCount,
    lootbox_shake_started_at: Number.isFinite(time) ? time : 0,
    ...(clickCount === 3 ? { lootbox_revealed: true, lootbox_cards_visible: false,
      lootbox_revealed_at: Number.isFinite(time) ? time : 0 } : {}),
  };
}

export function collectExpeditionLoot(state) {
  if (!state?.pendingLoot || !state.lootbox_revealed || !state.lootbox_cards_visible || !Array.isArray(state.currentLoot)) return state;
  const grid = state.shelter_grid ?? [];
  const totals = state.currentLoot.reduce((result, item) => {
    const amount = Math.max(0, Math.floor(Number(item?.amount) || 0));
    if (Object.hasOwn(result, item?.resource)) result[item.resource] += amount;
    return result;
  }, { scrap: 0, food: 0, energy: 0, science: 0, technology: 0, medkits: 0 });
  const supplies = { ...(state.shelter_supplies ?? {}) };
  for (const resource of ['food', 'energy', 'medkits']) {
    supplies[resource] = Math.min(getRoomStorageCapacity(grid, resource),
      Math.max(0, Number(supplies[resource]) || 0) + totals[resource]);
  }
  const science = Math.min(getRoomStorageCapacity(grid, 'science'),
    Math.max(0, Number(state.science) || 0) + totals.science);
  const pendingExpeditionReports = (state.pendingExpeditionReports ?? []).filter((report) => !report.success);
  return {
    ...state,
    scrap: Math.min(getRoomStorageCapacity(grid, 'scrap'), Math.max(0, Number(state.scrap) || 0) + totals.scrap),
    science,
    shelter_supplies: supplies,
    technology: { ...(state.technology ?? {}), points: Math.max(0, Number(state.technology?.points) || 0) + totals.technology },
    pendingExpeditionReports,
    pendingLoot: false,
    currentLoot: [],
    lootbox_opened: false,
    lootbox_click_count: 0,
    lootbox_revealed: false,
    lootbox_cards_visible: false,
    lootbox_shake_started_at: null,
    lootbox_revealed_at: null,
    notice: 'Carga do Ermo recolhida e armazenada no Vault.',
  };
}

export function createExpeditionLocation(city, source = 'fallback') {
  const cleaned = typeof city === 'string' ? city.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 80) : '';
  const label = cleaned || DEFAULT_EXPEDITION_CITY;
  return { city: label, nodes: createExpeditionNodes(label), source: source === 'geolocation' ? source : 'fallback' };
}

export function createExpeditionNodes(city) {
  const cleaned = typeof city === 'string' ? city.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 80) : '';
  const label = cleaned || DEFAULT_EXPEDITION_CITY;
  if (label === DEFAULT_EXPEDITION_CITY) {
    return ['Ruínas da Capital', 'Cratera do estádio da Capital', 'Acampamento da praça central da Capital'];
  }
  if (label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'belo horizonte') {
    return ['Ruínas de Belo Horizonte', 'Cratera do Mineirão', 'Acampamento da Praça da Liberdade'];
  }
  return [
    `Ruínas de ${label}`,
    `Cratera do estádio de ${label}`,
    `Acampamento da praça central de ${label}`,
  ];
}

function getPosition(geolocation) {
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(new Error('Geolocalização indisponível.'));
      return;
    }
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 86_400_000,
      timeout: 8_000,
    });
  });
}

function fallbackLocation() {
  return createExpeditionLocation(DEFAULT_EXPEDITION_CITY);
}

export async function resolveExpeditionLocation({
  geolocation = globalThis.navigator?.geolocation,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') return fallbackLocation();
  try {
    const position = await getPosition(geolocation);
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return fallbackLocation();

    const url = new URL(NOMINATIM_REVERSE_URL);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      zoom: '10',
      addressdetails: '1',
    }).toString();
    const response = await fetchImpl(url, { headers: { 'Accept-Language': 'pt-BR' }, cache: 'force-cache' });
    if (!response?.ok) return fallbackLocation();
    const data = await response.json();
    const address = data?.address ?? {};
    const city = address.city || address.town || address.village || address.municipality || address.county;
    if (typeof city !== 'string' || !city.trim()) return fallbackLocation();
    return createExpeditionLocation(city, 'geolocation');
  } catch {
    return fallbackLocation();
  }
}
