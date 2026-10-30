import { calculateShelterCapacity, INITIAL_SHELTER_GRID, normalizeShelterGrid } from './shelter_engine.js';
import { getBunkerEnergyConsumption, getBunkerFoodConsumption, getBunkerOxygenConsumption,
  getLifeSupportEnergyMaintenance, getLifeSupportOxygenProduction, getRoomEconomyProfile,
  getRoomStorageCapacity } from './bunker_economy.js';
import { createInitialInhabitants, createRpgPlayer } from './rpg_bunker.js';
import { advanceMonthlyGameMechanics, getRoomProductivityMultiplier, getWastelandEvent, WASTELAND_EVENTS } from './game_mechanics.js';
import { countActiveGenerators, createEnvironmentState, hasReliableNightPower } from './environment.js';
import { advanceInhabitantNeeds, countDormitoryBeds } from './needs.js';
import { getWeather } from './weather.js';
import { createMissionLocation } from './missions.js';
import { normalizeOilField } from './oil.js';
import { rollSurfaceRaid } from './defense.js';
import { getGeneratorFuelPlan } from './oil_economy.js';
import { ENDINGS, isDoorOpen } from './endings.js';
import { nextRandom } from './geopolitics.js';
import { getPresidentClassModifiers } from './player_state.js';

const VAULT_CASH_COST = 500_000_000_000;
const VAULT_STEEL_COST = 50_000;

const FACTIONS = Object.freeze([
  { id: 'mutant-horde', name: 'Horda Mutante do Norte', relation: -60, militaryPower: 46 },
  { id: 'scrap-brotherhood', name: 'Irmandade de Sucateiros', relation: 25, militaryPower: 32 },
  { id: 'military-remnants', name: 'Remanescentes Militares', relation: 5, militaryPower: 58 },
]);

function wastelandMilitary(power) {
  return { exercito: { soldados: Math.round(power * 100), blindados: 0 }, marinha: { navios: 0 }, aeronautica: { cacas: 0 } };
}

export function createWastelandFactions() {
  return FACTIONS.map((faction) => ({
    ...faction,
    population: 10_000,
    area_km2: 0,
    pib_base: 0,
    cash: 0,
    trait: 'wasteland_faction',
    military: wastelandMilitary(faction.militaryPower),
    atWar: false,
    alliance: false,
    tradeTreaty: false,
    wastelandFaction: true,
  }));
}

export function buildMegaVault(state) {
  if (state.vault_built || state.megaprojects?.megaVault?.completed) return { ...state, notice: 'O Mega-Vault ja esta pronto.' };
  if ((Number(state.economy?.cash) || 0) < VAULT_CASH_COST) return { ...state, notice: 'Caixa insuficiente para o Mega-Vault.' };
  if ((Number(state.country?.steel) || 0) < VAULT_STEEL_COST) return { ...state, notice: 'Aco insuficiente para o Mega-Vault.' };
  return {
    ...state,
    vault_built: true,
    country: { ...state.country, steel: state.country.steel - VAULT_STEEL_COST },
    economy: { ...state.economy, cash: state.economy.cash - VAULT_CASH_COST },
    megaprojects: { ...(state.megaprojects ?? {}), megaVault: { completed: true } },
    notice: 'Mega-Vault de Contencao concluido. A superficie pode arder.',
  };
}

export function transicionarParaWasteland(state, reason = 'colapso-nuclear') {
  const contacts = createWastelandFactions();
  return {
    ...state,
    is_wasteland: true,
    wasteland_reason: typeof reason === 'string' ? reason.slice(0, 40) : 'colapso-nuclear',
    ending: null,
    presidentClass: null,
    president_selection_pending: true,
    unlockedSkins: ['default'],
    equippedSkin: 'default',
    wasteland_cinematic_pending: true,
    wasteland_cinematic_ready: false,
    unlocked_chapters: [...new Set([...(state.unlocked_chapters ?? []), 'cap_5_wasteland'])],
    scrap: Math.max(250, Number(state.scrap) || 0),
    oil: 0,
    oil_derricks: normalizeOilField(),
    surface_fort: null,
    generator_fuel: false,
    pendingRaid: null,
    raidCooldownUntilTurn: 0,
    raid_log: [],
    science: Math.max(0, Math.floor(Number(state.science) || 0)),
    shelter_grid: normalizeShelterGrid(INITIAL_SHELTER_GRID),
    shelter_inhabitants: [],
    inhabitants: createInitialInhabitants(INITIAL_SHELTER_GRID),
    pendingExpeditionReports: [],
    pendingLoot: false,
    currentLoot: [],
    lootbox_opened: false,
    lootbox_click_count: 0,
    lootbox_revealed: false,
    lootbox_cards_visible: false,
    lootbox_shake_started_at: null,
    lootbox_revealed_at: null,
    expeditionLocation: null,
    environment: createEnvironmentState(),
    isNight: false,
    pendingBunkerEvent: null,
    wasteland_turn: 0,
    wastelandMonthCounter: 0,
    wastelandEventCursor: 0,
    rpg_player: createRpgPlayer(INITIAL_SHELTER_GRID),
    shelter_supplies: { weapons: 0, medkits: 0, food: 20, energy: 20, oxygen: 300 },
    oxygen_shortage_turns: 0,
    oxygen_deprived: false,
    shelter_guards: 0,
    shelter_radiation: 25,
    vault_built: true,
    title: 'Sobrevivente Supremo',
    country: {
      ...state.country,
      nome: `${state.country.nome} - Setor do Vault`,
      populacao: 3_500,
      populacao_base: 3_500,
      pib_base: 0,
      area_km2: 1,
      uranium: 0,
      steel: 0,
      rare_earths: 0,
    },
    economy: { gdp: 0, inflation: 0, unemployment: 0.15, cash: 0 },
    infrastructure: { roads: 0, railways: 0, airports: 0 },
    health: { hospitals: 0, clinics: 0 },
    industry: { factories: 0, power_plants: 0 },
    environment_health: 5,
    internal_maintenance_cost: 0,
    geopolitics: { ...state.geopolitics, contacts, peaceTreaty: null, league: null, onuScore: 0, internationalSanctions: false },
    world: contacts,
    military: { ...state.military, power: 12, combatAdjustment: 0, exercito: { soldados: 350, blindados: 0 }, marinha: { navios: 0 }, aeronautica: { cacas: 0 } },
    regime: { ...state.regime, gameOver: false, outcome: null, electionsSuspended: false },
    global_defcon: 5,
    dead_hand_triggered: false,
    notice: `O mundo acabou (${reason}). As portas do Vault se fecharam.`,
  };
}

// Depois do mes do Vault, os saqueadores do Ermo podem atacar o campo de petroleo.
export function advanceWastelandMonth(state, now = Date.now()) {
  const next = advanceVaultMonth(state);
  if (next === state || (Number(next.wasteland_turn) || 0) <= (Number(state.wasteland_turn) || 0)) return next;
  // Combustivel queimado no mes: o mesmo plano que aumentou a energia produzida em advanceVaultMonth.
  const fuel = getGeneratorFuelPlan(state);
  const burned = fuel.active ? { ...next, oil: Math.max(0, (Number(next.oil) || 0) - fuel.cost) } : next;
  const note = fuel.enabled && !fuel.funded && fuel.cost > 0 ? { ...burned, notice: [burned.notice, '> Sem petróleo para os geradores: voltaram ao normal.'].filter(Boolean).join(' ') } : burned;
  return rollSurfaceRaid(note, now);
}

function advanceVaultMonth(state) {
  if (state.ending) return { ...state, notice: `A história do Vault terminou: ${ENDINGS[state.ending.id]?.title ?? 'fim'}.` };
  if (isDoorOpen(state)) return { ...state, notice: 'A superfície voltou a ser habitável. Decida o destino do Vault diante da Porta.' };
  if (state.pendingRaid) return { ...state, notice: 'Veja o relatório do ataque na superfície antes de avançar o mês.' };
  if (state.pendingBunkerEvent || state.pendingLoot || state.pendingExpeditionReports?.length) {
    return { ...state, notice: state.pendingBunkerEvent
      ? 'Resolva o dilema do Vault antes de avancar o mes.'
      : state.pendingLoot ? 'Abra e recolha a carga do Ermo antes de avancar o mes.'
        : 'Leia o relatorio da expedicao antes de avancar o mes.' };
  }
  const grid = normalizeShelterGrid(state.shelter_grid);
  const rooms = grid.flat().filter(Boolean);
  const weather = getWeather(state);
  const activeGreenhouses = rooms.filter((room) => room.type === 'greenhouse' && !(room.disabledMonthsRemaining > 0));
  const laboratories = rooms.filter((room) => room.type === 'laboratory');
  const generators = rooms.filter((room) => room.type === 'generator' && room.operational);
  const energyProduction = Math.round(generators.reduce((total, room) =>
    total + (getRoomEconomyProfile(state, room)?.production.amount ?? 0), 0) * getGeneratorFuelPlan(state).multiplier);
  const foodProduction = activeGreenhouses.reduce((total, room) =>
    total + (getRoomEconomyProfile(state, room)?.production.amount ?? 0), 0);
  const oxygenProduction = getLifeSupportOxygenProduction(grid);
  const scienceProduction = laboratories.reduce((total, room) =>
    total + (getRoomEconomyProfile(state, room)?.production.amount ?? 0), 0);
  const generatorWorkUnits = generators.reduce((total, room) =>
    total + room.level * getRoomProductivityMultiplier(state, room), 0);
  const greenhouseWorkUnits = activeGreenhouses.reduce((total, room) =>
    total + room.level * getRoomProductivityMultiplier(state, room), 0);
  const countLevels = (type) => rooms.filter((room) => room.type === type).reduce((total, room) => total + room.level, 0);
  const arsenals = countLevels('arsenal');
  const medical = countLevels('medical');
  const radiationGain = (2 + weather.radiationGain) * getPresidentClassModifiers(state.presidentClass).radiationGainMultiplier;
  const radio = countLevels('radio');
  const offices = countLevels('office');
  const population = Math.min(calculateShelterCapacity(grid), state.country.populacao_base + greenhouseWorkUnits * 5 + medical * 2 + radio * 3);
  const foodConsumption = getBunkerFoodConsumption(state, population);
  const energyConsumption = getBunkerEnergyConsumption(state, population) + getLifeSupportEnergyMaintenance(grid);
  const oxygenConsumption = Math.ceil(getBunkerOxygenConsumption(state, grid) * weather.oxygenMultiplier);
  const oxygenCapacity = getRoomStorageCapacity(grid, 'oxygen');
  const oxygenDeficit = oxygenProduction < oxygenConsumption;
  const fed = (Number(state.shelter_supplies?.food) || 0) + foodProduction >= foodConsumption;
  const beds = countDormitoryBeds(grid);
  const inhabitantsWithNeeds = advanceInhabitantNeeds(state.inhabitants ?? [], {
    fed, beds, darkNights: !hasReliableNightPower(countActiveGenerators(grid)), stormPenalty: weather.moralePenalty,
  });
  const presentCount = inhabitantsWithNeeds.filter((inhabitant) => !inhabitant.is_on_expedition).length;
  const supplies = {
    weapons: Math.min(getRoomStorageCapacity(grid, 'weapons'), (Number(state.shelter_supplies?.weapons) || 0) + arsenals),
    medkits: Math.min(getRoomStorageCapacity(grid, 'medkits'), (Number(state.shelter_supplies?.medkits) || 0) + medical * 2),
    food: Math.min(getRoomStorageCapacity(grid, 'food'), Math.max(0, (Number(state.shelter_supplies?.food) || 0) + foodProduction - foodConsumption)),
    energy: Math.min(getRoomStorageCapacity(grid, 'energy'), Math.max(0, (Number(state.shelter_supplies?.energy) || 0) + energyProduction - energyConsumption)),
    oxygen: Math.min(oxygenCapacity, Math.max(0, (Number(state.shelter_supplies?.oxygen) || 0) + oxygenProduction - oxygenConsumption)),
  };
  const oxygenShortageTurns = oxygenDeficit
    ? Math.max(0, Math.floor(Number(state.oxygen_shortage_turns) || 0)) + 1
    : 0;
  const wastelandMonthCounter = Math.max(0, Math.floor(Number(state.wasteland_turn ?? state.wastelandMonthCounter) || 0)) + 1;
  const nextGrid = grid.map((row) => row.map((room) => room?.type === 'greenhouse' && room.disabledMonthsRemaining > 0
    ? { ...room, disabledMonthsRemaining: room.disabledMonthsRemaining - 1 }
    : room));
  const advanced = {
    ...state,
    calendar: { month: state.calendar.month === 12 ? 1 : state.calendar.month + 1, year: state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year },
    monthCounter: (Number(state.monthCounter) || 0) + 1,
    wasteland_turn: wastelandMonthCounter,
    wastelandMonthCounter,
    wastelandEventCursor: Math.max(0, Math.floor(Number(state.wastelandEventCursor) || 0)) % WASTELAND_EVENTS.length,
    shelter_grid: nextGrid,
    ...(Array.isArray(state.inhabitants) ? { inhabitants: inhabitantsWithNeeds } : {}),
    science: Math.min(getRoomStorageCapacity(grid, 'science'), (Number(state.science) || 0) + scienceProduction),
    scrap: Math.min(getRoomStorageCapacity(grid, 'scrap'), (Number(state.scrap) || 0) + 25 + generatorWorkUnits * 15 + offices * 5),
    shelter_supplies: supplies,
    oxygen_shortage_turns: oxygenShortageTurns,
    oxygen_deprived: oxygenDeficit,
    shelter_radiation: Math.max(0, Math.min(100, (Number(state.shelter_radiation) || 0) + radiationGain - medical)),
    country: { ...state.country, populacao: population, populacao_base: population },
    notice: 'O Vault sobrevive mais um mês. Os módulos operacionais sustentam a população.',
  };
  let processed = advanceMonthlyGameMechanics(advanced);
  const needsNotice = [
    !fed && presentCount ? '> FOME: o estoque de comida não alimentou o Vault. Famintos produzem menos.' : null,
    beds < presentCount ? `> DORMITÓRIOS LOTADOS: ${beds} leitos para ${presentCount} habitantes.` : null,
    weather.id !== 'clear' ? `> ${weather.label}: a superfície castiga o Vault.` : null,
  ].filter(Boolean).join(' ');
  if (needsNotice) processed = { ...processed, notice: `${processed.notice} ${needsNotice}` };
  if (oxygenDeficit) {
    processed = {
      ...processed,
      inhabitants: (processed.inhabitants ?? []).map((inhabitant) => inhabitant.is_on_expedition
        ? inhabitant
        : { ...inhabitant, loyalty: Math.max(0, Number(inhabitant.loyalty ?? 100) - 25) }),
    };
    const victims = processed.inhabitants.filter((inhabitant) => !inhabitant.is_on_expedition && !inhabitant.is_prisoner);
    let randomSeed = processed.randomSeed;
    let suffocationNotice = null;
    if (oxygenShortageTurns >= 3 && victims.length) {
      const deathRoll = nextRandom(randomSeed);
      randomSeed = deathRoll.seed;
      if (deathRoll.value < 0.3) {
        const victimRoll = nextRandom(randomSeed);
        randomSeed = victimRoll.seed;
        const victim = victims[Math.floor(victimRoll.value * victims.length)];
        processed = { ...processed, inhabitants: processed.inhabitants.filter((inhabitant) => inhabitant.id !== victim.id) };
        suffocationNotice = `> ASFIXIA: ${victim.name || victim.id} morreu por falta de oxigênio.`;
      }
    }
    processed = {
      ...processed,
      randomSeed,
      notice: [processed.notice, suffocationNotice ?? '> ALERTA: produção de oxigênio insuficiente. Habitantes perdem lealdade e mobilidade.']
        .filter(Boolean).join(' '),
    };
  }
  if (wastelandMonthCounter % 3 !== 0 || processed.pendingBunkerEvent) return processed;
  const cursor = advanced.wastelandEventCursor;
  let selectedIndex = -1;
  for (let offset = 0; offset < WASTELAND_EVENTS.length; offset++) {
    const candidateIndex = (cursor + offset) % WASTELAND_EVENTS.length;
    const event = WASTELAND_EVENTS[candidateIndex];
    const roomType = getWastelandEvent(event.id)?.prerequisites?.roomType;
    if (!roomType || rooms.some((room) => room.type === roomType)) {
      selectedIndex = candidateIndex;
      break;
    }
  }
  if (selectedIndex < 0) return processed;
  const urgentNotice = /SINAL DO EXPLORADOR|ALERTA CRÍTICO|ASFIXIA|oxigênio insuficiente/i.test(processed.notice ?? '')
    ? `${processed.notice} ` : '';
  const eventId = WASTELAND_EVENTS[selectedIndex].id;
  const location = createMissionLocation(processed.shelter_grid, eventId, (Number(processed.randomSeed) || 1) + wastelandMonthCounter);
  return {
    ...processed,
    pendingBunkerEvent: { id: eventId, ...(location ?? {}) },
    wastelandEventCursor: (selectedIndex + 1) % WASTELAND_EVENTS.length,
    notice: location
      ? `${urgentNotice}MISSÃO: ${WASTELAND_EVENTS[selectedIndex].title} no andar ${location.floor + 1}, setor ${location.column}. Vá até lá para resolver.`
      : `${urgentNotice}Uma decisao urgente aguarda o comando do Vault.`,
  };
}

export function buildWastelandProject(state, projectId) {
  const projects = { 'water-purifier': { field: 'waterPurifiers', cost: 50, label: 'Purificador de Agua' }, 'geothermal-generator': { field: 'geothermalGenerators', cost: 100, label: 'Gerador Geotermico' } };
  const project = projects[projectId];
  if (!state.is_wasteland || !project) return { ...state, notice: 'Projeto de sobrevivencia invalido.' };
  if ((Number(state.scrap) || 0) < project.cost) return { ...state, notice: 'Sucata insuficiente para este projeto.' };
  return { ...state, scrap: state.scrap - project.cost, wastelandBuildings: { ...(state.wastelandBuildings ?? {}), [project.field]: (state.wastelandBuildings?.[project.field] ?? 0) + 1 }, notice: `${project.label} construido no Vault.` };
}

export function enviarBatedores(state, factionId) {
  if (!state.is_wasteland) return { ...state, notice: 'Os batedores so operam na superficie devastada.' };
  const faction = state.geopolitics.contacts.find((contact) => contact.id === factionId);
  if (!faction) return { ...state, notice: 'Facção da superficie nao encontrada.' };
  if ((Number(state.scrap) || 0) < 25) return { ...state, notice: 'Sucata insuficiente para enviar batedores.' };
  return {
    ...state,
    scrap: state.scrap - 25,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === factionId ? { ...contact, relation: Math.min(100, contact.relation + 10) } : contact),
    },
    notice: `Batedores retornaram com mapas da zona de ${faction.name}.`,
  };
}
