import { advanceEnvironmentCycle, countActiveGenerators, createEnvironmentState, FULL_CYCLE_MS, hasReliableNightPower } from './environment.js';
import { advanceWeather, createWeatherState, WEATHER_TYPES } from './weather.js';
import { advanceInhabitantNeeds, countDormitoryBeds, getCriticalNeeds, NEED_ICONS } from './needs.js';
import { getRoomStorageCapacity } from './bunker_economy.js';
import { advanceWastelandMonth } from './wasteland.js';

export const OFFLINE_MIN_MS = 5 * 60_000;
export const OFFLINE_MAX_MS = 8 * 60 * 60_000;
// Cada hora fora rende um quarto da producao liquida de um mes do Vault.
export const OFFLINE_MONTH_FRACTION_PER_HOUR = .25;
export const OFFLINE_HOURS_PER_NEEDS_TICK = 4;

const SUPPLY_RESOURCES = Object.freeze([
  ['food', 'Comida'], ['energy', 'Energia'], ['oxygen', 'Oxigênio'], ['weapons', 'Armas'], ['medkits', 'Curativos'],
]);
const NEED_REPORT_LABELS = Object.freeze({ satiety: 'faminto(s)', rest: 'exausto(s)', morale: 'desmotivado(s)' });

export function canRunOfflineProgress(state) {
  return Boolean(state?.is_wasteland && !state.president_selection_pending
    && !state.wasteland_cinematic_pending && !state.wasteland_cinematic_ready && !state.regime?.gameOver);
}

function advanceOfflineWeather(weather, elapsedMs) {
  let current = createWeatherState(weather);
  let remaining = elapsedMs;
  const storms = [];
  while (remaining >= current.remainingMs) {
    remaining -= current.remainingMs;
    const { changed, ...next } = advanceWeather(current, current.remainingMs);
    current = next;
    if (current.type !== 'clear') storms.push(current.type);
  }
  const { changed, ...settled } = advanceWeather(current, remaining);
  return { weather: settled, storms };
}

// Simula o tempo fora sem eventos graves: producao, ciclo, clima e necessidades avancam; decisoes esperam o jogador.
export function applyOfflineProgress(state, now = Date.now()) {
  const lastSeenAt = Number(state?.lastSeenAt);
  if (!canRunOfflineProgress(state) || !Number.isFinite(lastSeenAt)) return { ...state, lastSeenAt: now };
  const awayMs = Math.max(0, now - lastSeenAt);
  if (awayMs < OFFLINE_MIN_MS) return { ...state, lastSeenAt: now };
  const elapsedMs = Math.min(awayMs, OFFLINE_MAX_MS);
  const hours = elapsedMs / 3_600_000;
  const scale = hours * OFFLINE_MONTH_FRACTION_PER_HOUR;

  const probe = advanceWastelandMonth({ ...state, pendingBunkerEvent: null, pendingLoot: false, pendingExpeditionReports: [] });
  const grid = state.shelter_grid;
  const supplies = { ...(state.shelter_supplies ?? {}) };
  const resources = [];
  for (const [key, label] of SUPPLY_RESOURCES) {
    const before = Number(supplies[key]) || 0;
    const monthly = (Number(probe.shelter_supplies?.[key]) || 0) - before;
    const after = Math.max(0, Math.min(getRoomStorageCapacity(grid, key), Math.round(before + monthly * scale)));
    supplies[key] = after;
    if (after !== before) resources.push({ key, label, delta: after - before });
  }
  const scrapBefore = Number(state.scrap) || 0;
  const scrap = Math.max(0, Math.min(getRoomStorageCapacity(grid, 'scrap'),
    Math.round(scrapBefore + ((Number(probe.scrap) || 0) - scrapBefore) * scale)));
  if (scrap !== scrapBefore) resources.push({ key: 'scrap', label: 'Sucata', delta: scrap - scrapBefore });
  const scienceBefore = Number(state.science) || 0;
  const science = Math.max(0, Math.min(getRoomStorageCapacity(grid, 'science'),
    Math.round(scienceBefore + ((Number(probe.science) || 0) - scienceBefore) * scale)));
  if (science !== scienceBefore) resources.push({ key: 'science', label: 'Ciência', delta: science - scienceBefore });
  const radiationBefore = Number(state.shelter_radiation) || 0;
  const shelterRadiation = Math.max(0, Math.min(100,
    Math.round(radiationBefore + ((Number(probe.shelter_radiation) || 0) - radiationBefore) * scale)));

  const environmentBefore = createEnvironmentState(state.environment);
  const environment = advanceEnvironmentCycle(environmentBefore, elapsedMs);
  const daysPassed = Math.floor((environmentBefore.elapsedMs + elapsedMs) / FULL_CYCLE_MS);
  const { weather, storms } = advanceOfflineWeather(state.weather, elapsedMs);

  let inhabitants = state.inhabitants ?? [];
  const needsTicks = Math.floor(hours / OFFLINE_HOURS_PER_NEEDS_TICK);
  for (let tick = 0; tick < needsTicks; tick++) {
    inhabitants = advanceInhabitantNeeds(inhabitants, {
      fed: supplies.food > 0, beds: countDormitoryBeds(grid),
      darkNights: !hasReliableNightPower(countActiveGenerators(grid)),
    });
  }
  const present = inhabitants.filter((npc) => !npc.is_on_expedition);
  const critical = ['satiety', 'rest', 'morale'].map((key) => ({ key, icon: NEED_ICONS[key], label: NEED_REPORT_LABELS[key],
    count: present.filter((npc) => getCriticalNeeds(npc.needs).includes(key)).length })).filter((entry) => entry.count > 0);
  const rebels = present.filter((npc) => npc.currentState === 'rebel' && !npc.is_prisoner).length;
  const pendingDecisions = (state.pendingBunkerEvent ? 1 : 0) + (state.pendingLoot ? 1 : 0)
    + (state.pendingExpeditionReports?.length ?? 0);

  return {
    ...state,
    lastSeenAt: now,
    scrap,
    science,
    shelter_supplies: supplies,
    shelter_radiation: shelterRadiation,
    environment: { elapsedMs: environment.elapsedMs },
    isNight: environment.isNight,
    weather,
    currentDay: Math.max(1, Math.floor(Number(state.currentDay) || 1)) + daysPassed,
    inhabitants,
    pendingOfflineReport: {
      awayMs, simulatedMs: elapsedMs, capped: awayMs > elapsedMs, daysPassed, resources,
      storms: Object.keys(WEATHER_TYPES).filter((type) => storms.includes(type))
        .map((type) => ({ label: WEATHER_TYPES[type].label, count: storms.filter((storm) => storm === type).length })),
      critical, rebels, pendingDecisions,
    },
  };
}

export function dismissOfflineReport(state) {
  if (!state?.pendingOfflineReport) return state;
  const { pendingOfflineReport, ...rest } = state;
  return rest;
}

export function normalizeOfflineReport(value) {
  if (!value || typeof value !== 'object') return null;
  const count = (raw) => Math.max(0, Math.floor(Number(raw) || 0));
  return {
    awayMs: count(value.awayMs),
    simulatedMs: Math.min(OFFLINE_MAX_MS, count(value.simulatedMs)),
    capped: value.capped === true,
    daysPassed: count(value.daysPassed),
    resources: (Array.isArray(value.resources) ? value.resources : []).slice(0, 8)
      .filter((item) => typeof item?.label === 'string' && Number.isFinite(Number(item.delta)))
      .map((item) => ({ key: String(item.key ?? '').slice(0, 20), label: item.label.slice(0, 30), delta: Math.round(Number(item.delta)) })),
    storms: (Array.isArray(value.storms) ? value.storms : []).filter((storm) => typeof storm?.label === 'string').slice(0, 3)
      .map((storm) => ({ label: storm.label.slice(0, 40), count: Math.max(1, count(storm.count)) })),
    critical: (Array.isArray(value.critical) ? value.critical : []).slice(0, 3)
      .filter((item) => NEED_ICONS[item?.key]).map((item) => ({ key: item.key, icon: NEED_ICONS[item.key],
        label: NEED_REPORT_LABELS[item.key], count: count(item.count) })),
    rebels: count(value.rebels),
    pendingDecisions: count(value.pendingDecisions),
  };
}
