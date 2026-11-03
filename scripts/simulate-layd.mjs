import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGameState } from '../src/core/game-state.js';
import { adoptLayd } from '../src/core/companion.js';
import {
  advanceLaydEscape,
  advanceLaydMonth,
  applyVaccine,
  buyRation,
  divertFood,
  resolveLaydDiscovery,
  toggleHideLayd,
} from '../src/core/layd_care.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { buildShelterRoom, findBuildSlots, repairShelterGenerator } from '../src/core/shelter_engine.js';
import { dismissExpeditionReport, resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { purchaseSkin } from '../src/core/player_state.js';
import { MARKET_SUIT_SKIN, tradeAtMarket } from '../src/core/market.js';

const MONTHS = 150;
const LAYD_ARRIVAL_MONTH = 36;
const ROOM_PLAN = ['generator', 'greenhouse', 'dormitory', 'life_support', 'laboratory', 'elevator', 'office', 'presidential_suite', 'radiation_clinic'];
const ROOM_EXPANSION_PLAN = ['generator', 'greenhouse'];
const ROOM_TARGET_COUNTS = Object.freeze({ generator: 2, greenhouse: 2 });

const STRATEGIES = Object.freeze({
  guardian: { label: 'Guardião' },
  caregiver: { label: 'Cuidador' },
  balanced: { label: 'Equilibrado' },
  hidden: { label: 'Escondido' },
});

function averageLoyalty(state) {
  const people = (state.inhabitants ?? []).filter((npc) => !npc.is_on_expedition && !npc.is_prisoner);
  return people.length ? people.reduce((sum, npc) => sum + Number(npc.loyalty ?? 0), 0) / people.length : 0;
}

function hasRoom(state, type) {
  const count = state.shelter_grid?.flat().filter((room) => room?.type === type && (type !== 'elevator' || room.floor > 0)).length ?? 0;
  return count >= (ROOM_TARGET_COUNTS[type] ?? 1);
}

function buildPlannedRooms(state) {
  let next = state;
  for (const type of ROOM_PLAN) {
    if (next.shelter_grid.flat().some((room) => room?.type === type && (type !== 'elevator' || room.floor > 0))) continue;
    const slot = findBuildSlots(next.shelter_grid, type)[0];
    if (!slot) break;
    const built = buildShelterRoom(next, type, slot.floor, slot.column);
    if (built.shelter_grid === next.shelter_grid) break;
    next = built;
    if (type === 'generator') next = repairShelterGenerator(next, slot.floor, slot.column);
  }
  const coreReady = ROOM_PLAN.every((type) => next.shelter_grid.flat().some((room) => room?.type === type && (type !== 'elevator' || room.floor > 0)));
  if (!coreReady) return next;
  for (const type of ROOM_EXPANSION_PLAN) {
    if (hasRoom(next, type)) continue;
    const slot = findBuildSlots(next.shelter_grid, type)[0];
    if (!slot) break;
    const built = buildShelterRoom(next, type, slot.floor, slot.column);
    if (built.shelter_grid === next.shelter_grid) break;
    next = built;
    if (type === 'generator') next = repairShelterGenerator(next, slot.floor, slot.column);
  }
  // The treatment room is intentionally built only after the production core can pay for it.
  return next;
}

function chooseOption(state, strategy) {
  const id = state.pendingBunkerEvent?.id;
  const scrap = Number(state.scrap) || 0;
  const energy = Number(state.shelter_supplies?.energy) || 0;
  const medkits = Number(state.shelter_supplies?.medkits) || 0;
  const food = Number(state.shelter_supplies?.food) || 0;
  if (id === 'layd-vaccine') {
    if (strategy === 'guardian') {
      // O Guardião protege o estoque comum, mas abre uma exceção quando Layd
      // entra em risco clínico: esse é o caminho difícil, porém ainda viável.
      if ((Number(state.companion?.doses) || 0) === 0) return 'divert-vaccine';
      if (state.companion?.health <= 45) return scrap >= 70 ? 'craft-vaccine' : 'divert-vaccine';
      return 'deliver-vaccine';
    }
    if (strategy === 'caregiver' || strategy === 'hidden') return 'divert-vaccine';
    return scrap >= 70 ? 'craft-vaccine' : 'divert-vaccine';
  }
  if (id === 'layd-ration') {
    if (strategy === 'guardian') return 'share-ration';
    if (strategy === 'caregiver') return 'divert-ration';
    return scrap >= 30 ? 'trade-ration' : food >= 15 ? 'divert-ration' : 'share-ration';
  }
  if (id === 'ration-emergency') return strategy === 'guardian' ? 'refuse-ration-cuts' : 'support-scientists';
  if (id === 'generator-bearings') return scrap >= 60 ? 'replace-bearings' : 'delay-repair';
  if (id === 'air-filter-crisis') return medkits >= 1 ? 'use-medkit-filters' : 'keep-ventilation-running';
  if (id === 'radio-signal-unknown') return strategy === 'caregiver' && food >= 50 ? 'send-scouts' : 'ignore-signal';
  if (id === 'greenhouse-fungus') return energy >= 80 ? 'attempt-cure' : 'quarantine-greenhouse';
  if (id === 'council-gate-protocol') return strategy === 'guardian' ? 'council-keep-the-door-human' : 'council-arm-the-watch';
  if (id === 'council-infirmary-triage') return medkits >= 2 ? 'council-open-the-infirmary' : 'council-preserve-the-reserve';
  if (id === 'council-power-grid') return scrap >= 70 ? 'council-rewire-grid' : 'council-ration-the-grid';
  return state.pendingBunkerEvent?.options?.[0]?.id ?? null;
}

function careForLayd(state, strategy) {
  if (!state.companion?.adopted || state.companion.status === 'dead' || state.companion.status === 'gone') return state;
  let next = state;
  const turn = Number(next.wasteland_turn) || 0;
  if (strategy === 'caregiver') {
    if (next.companion.ration <= 1) next = buyRation(next);
    if (next.companion.sick && next.companion.vaccines > 0 && hasRoom(next, 'radiation_clinic') && !next.companion.hidden) next = applyVaccine(next, true);
    return next;
  }
  if (strategy === 'balanced') {
    if (next.companion.ration <= 1) next = next.scrap >= 30 ? buyRation(next) : divertFood(next);
    if (next.companion.sick && next.companion.vaccines > 0 && hasRoom(next, 'radiation_clinic') && !next.companion.hidden) next = applyVaccine(next, true);
    return next;
  }
  if (strategy === 'hidden') {
    if (next.companion.ration <= 1 && next.scrap >= 30) next = buyRation(next);
    const doseReady = next.companion.sick && next.companion.vaccines > 0 && hasRoom(next, 'radiation_clinic');
    if (doseReady) {
      if (next.companion.hidden) next = toggleHideLayd(next);
      next = applyVaccine(next, true);
      if (next.companion?.adopted && !next.companion.hidden) next = toggleHideLayd(next);
    }
    return next;
  }
  if (strategy === 'guardian') {
    const emergencyDose = next.companion.sick && next.companion.vaccines > 0
      && hasRoom(next, 'radiation_clinic') && !next.companion.hidden && next.companion.health <= 45;
    return emergencyDose ? applyVaccine(next, true) : next;
  }
  return next;
}

function resolveDiscovery(state, strategy, metrics) {
  if (!state.pendingLaydDiscovery) return state;
  if (metrics.discoveryMonth === null) metrics.discoveryMonth = state.wasteland_turn;
  if (strategy === 'caregiver') {
    let next = resolveLaydDiscovery(state, 'flee');
    next = advanceLaydEscape(next, { type: 'presidential_suite' });
    return advanceLaydEscape(next, { type: 'vault' }, { dogNear: true });
  }
  return resolveLaydDiscovery(state, 'surrender');
}

function resolvePending(state, strategy, metrics) {
  let next = state;
  for (let guard = 0; guard < 12; guard++) {
    if (next.pendingLaydDiscovery) {
      next = resolveDiscovery(next, strategy, metrics);
      continue;
    }
    if (next.pendingBunkerEvent) {
      if (!next.pendingBunkerEvent.arrived) next = { ...next, pendingBunkerEvent: { ...next.pendingBunkerEvent, arrived: true } };
      const optionId = chooseOption(next, strategy);
      if (!optionId) break;
      const resolved = resolveWastelandEvent(next, optionId);
      if (resolved.pendingBunkerEvent) break;
      metrics.missions += 1;
      next = resolved;
      continue;
    }
    if (next.pendingExpeditionReports?.length) {
      next = dismissExpeditionReport(next);
      continue;
    }
    break;
  }
  return next;
}

function maybeHide(state, strategy) {
  if (strategy !== 'hidden' || !state.companion?.adopted || state.companion.status === 'dead' || state.companion.status === 'gone') return state;
  if (!state.companion.sick) return state.companion.hidden ? toggleHideLayd(state) : state;
  return state.companion.hidden ? state : toggleHideLayd(state);
}

function run(strategy) {
  let state = transicionarParaWasteland(createGameState('bra'), 'simulacao-de-equilibrio');
  state = { ...state, president_selection_pending: false, presidentClass: 'survivor', randomSeed: 91,
    scrap: 250, shelter_supplies: { ...state.shelter_supplies, food: 120, energy: 120, oxygen: 300 } };
  const metrics = { strategy, label: STRATEGIES[strategy].label, sickMonth: null, curedMonth: null, deathMonth: null,
    discoveryMonth: null, missions: 0, loyalty: [], scrap: [], marketMonth: null, marketTrades: 0, ending: null };

  for (let month = 1; month <= MONTHS; month++) {
    state = resolvePending(state, strategy, metrics);
    if (!state.companion && month === LAYD_ARRIVAL_MONTH) state = adoptLayd(state);
    state = buildPlannedRooms(state);
    if (state.companion?.sick && strategy === 'hidden' && !state.companion.hidden) state = toggleHideLayd(state);
    state = careForLayd(state, strategy);
    state = maybeHide(state, strategy);

    const before = state;
    state = advanceWastelandMonth(state, 0);
    if (state.pendingBunkerEvent && !before.pendingBunkerEvent) metrics.missions += 0;
    state = resolvePending(state, strategy, metrics);

    if (state.companion?.sick && metrics.sickMonth === null) metrics.sickMonth = state.wasteland_turn;
    if (state.companion?.cured && metrics.curedMonth === null) metrics.curedMonth = state.wasteland_turn;
    if (state.companion?.status === 'dead' && metrics.deathMonth === null) metrics.deathMonth = state.wasteland_turn;
    if (state.pendingLaydDiscovery && metrics.discoveryMonth === null) metrics.discoveryMonth = state.wasteland_turn;

    if (!metrics.marketMonth && state.scrap >= 250 && hasRoom(state, 'presidential_suite')) {
      const bought = purchaseSkin({ ...state, unlockedSkins: ['default'] }, MARKET_SUIT_SKIN);
      if (bought.unlockedSkins?.includes(MARKET_SUIT_SKIN)) {
        const trade = tradeAtMarket({ ...bought, oil: 100 }, 'sell-oil', MARKET_SUIT_SKIN);
        state = trade.dark_market?.offers?.some((offer) => offer.id === 'sell-oil' && offer.left < 3) ? trade : bought;
        metrics.marketMonth = state.wasteland_turn;
        metrics.marketTrades = state === trade ? 1 : 0;
      }
    }
    metrics.loyalty.push(Math.round(averageLoyalty(state) * 10) / 10);
    metrics.scrap.push(Math.floor(Number(state.scrap) || 0));
    if (state.ending?.id === 'layd_flight') metrics.ending = 'fuga';
  }

  if (!metrics.ending) {
    if (metrics.deathMonth !== null) metrics.ending = 'morte';
    else if (metrics.discoveryMonth !== null) metrics.ending = strategy === 'caregiver' ? 'fuga' : 'entrega';
    else if (metrics.curedMonth !== null) metrics.ending = 'cura sem descoberta';
    else metrics.ending = 'sobrevive sem cura';
  }
  return { ...metrics, averageLoyalty: Math.round(metrics.loyalty.reduce((a, b) => a + b, 0) / Math.max(1, metrics.loyalty.length) * 10) / 10,
    scrapStart: metrics.scrap[0], scrapEnd: metrics.scrap.at(-1), scrapMin: Math.min(...metrics.scrap), scrapMax: Math.max(...metrics.scrap), state };
}

export function summarize(result) {
  return { strategy: result.label, sickMonth: result.sickMonth, curedMonth: result.curedMonth,
    deathMonth: result.deathMonth, discoveryMonth: result.discoveryMonth, averageLoyalty: result.averageLoyalty,
    scrapStart: result.scrapStart, scrapEnd: result.scrapEnd, scrapMin: result.scrapMin, scrapMax: result.scrapMax,
    marketMonth: result.marketMonth, marketTrades: result.marketTrades, missions: result.missions, ending: result.ending };
}

export function runAll() {
  return Object.keys(STRATEGIES).map(run);
}

if (pathToFileURL(resolve(process.argv[1] ?? '')).href === import.meta.url) {
  for (const result of runAll()) console.log(JSON.stringify(summarize(result), null, 2));
}
