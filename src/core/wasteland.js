import { calculateBunkerCapacity, INITIAL_BUNKER_ROOMS, normalizeBunkerRooms } from './isometric_bunker.js';

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
    wasteland_cinematic_pending: true,
    wasteland_cinematic_ready: false,
    unlocked_chapters: [...new Set([...(state.unlocked_chapters ?? []), 'cap_5_wasteland'])],
    scrap: Math.max(250, Number(state.scrap) || 0),
    bunker_rooms: [...INITIAL_BUNKER_ROOMS],
    bunker_player: { x: 2, y: 2, facing: 'south' },
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

export function advanceWastelandMonth(state) {
  const rooms = normalizeBunkerRooms(state.bunker_rooms);
  const generators = rooms.filter((room) => room.type === 'generator' && room.operational).length;
  const greenhouses = rooms.filter((room) => room.type === 'greenhouse').length;
  const population = Math.min(calculateBunkerCapacity(rooms), state.country.populacao_base + greenhouses * 5);
  return {
    ...state,
    calendar: { month: state.calendar.month === 12 ? 1 : state.calendar.month + 1, year: state.calendar.month === 12 ? state.calendar.year + 1 : state.calendar.year },
    monthCounter: (Number(state.monthCounter) || 0) + 1,
    scrap: (Number(state.scrap) || 0) + 25 + generators * 15,
    country: { ...state.country, populacao: population, populacao_base: population },
    notice: 'O Vault sobrevive mais um mês. Os módulos operacionais sustentam a população.',
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
