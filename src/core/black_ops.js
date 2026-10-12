const VIRUS_CASH_COST = 20_000_000_000;
const VIRUS_RARE_EARTH_COST = 120;
const VIRUS_DURATION_MONTHS = 12;
export const FALSE_FLAG_CASH_COST = 75_000_000_000;
export const LEADER_DOUBLE_CASH_COST = 200_000_000_000;
export const LEADER_DOUBLE_RESEARCH_COST = 500;

function hasBioengineering(state) {
  return Boolean(state?.unlocked_techs?.includes('bio'));
}

function reduceTarget(target) {
  const population = Math.max(0, Math.floor((Number(target.population ?? target.populacao_base) || 0) * 0.95));
  return {
    ...target,
    population,
    populacao_base: population,
    pib_base: Math.max(1, Math.round((Number(target.pib_base) || 1) * 0.98)),
    bio_timer: Math.max(0, (Number(target.bio_timer) || 0) - 1),
  };
}

/** Infects an NPC through a covert operation. It never changes war or DEFCON state. */
export function injetarVirusSintetico(state, alvoId) {
  const target = state.geopolitics?.contacts?.find((contact) => contact.id === alvoId && !contact.destruido && !contact.anexado && !contact.wasteland);
  if (!target) return { ...state, notice: 'Alvo biologico invalido.' };
  if (!hasBioengineering(state)) return { ...state, notice: 'A operacao exige [ ENGENHARIA PATOGÉNICA (VÍRUS) ].' };
  if (target.bio_infected) return { ...state, notice: `${target.name} ja esta sob infeccao biologica.` };
  if ((Number(state.economy?.cash) || 0) < VIRUS_CASH_COST) return { ...state, notice: 'Caixa insuficiente para a operacao biologica.' };
  if ((Number(state.country?.rare_earths) || 0) < VIRUS_RARE_EARTH_COST) return { ...state, notice: 'Terras raras insuficientes para sintetizar o agente.' };

  return {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash - VIRUS_CASH_COST },
    country: { ...state.country, rare_earths: state.country.rare_earths - VIRUS_RARE_EARTH_COST },
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === alvoId
        ? { ...contact, bio_infected: true, bio_timer: VIRUS_DURATION_MONTHS }
        : contact),
    },
    notice: `Operacao silenciosa iniciada em ${target.name}.`,
  };
}

/** Stages a domestic atrocity to manufacture support for one foreign war. */
export function orquestrarFalsaBandeira(state, alvoId) {
  const target = state.geopolitics?.contacts?.find((contact) => contact.id === alvoId
    && !contact.destruido && !contact.anexado && !contact.wasteland && !contact.atWar);
  if (!target) return { ...state, notice: 'A Falsa Bandeira exige um alvo estrangeiro sem guerra ativa.' };
  if ((Number(state.economy?.cash) || 0) < FALSE_FLAG_CASH_COST) {
    return { ...state, notice: 'Caixa insuficiente para orquestrar a Falsa Bandeira.' };
  }

  const population = Math.max(1, Math.floor((Number(state.country.populacao_base ?? state.country.populacao) || 1) * 0.98));
  const gdpBase = Math.max(1, Math.floor((Number(state.country.pib_base) || 1) * 0.99));
  const factions = { ...state.factions, militares: 100 };
  if (Object.hasOwn(state.factions ?? {}, 'trabalhadores')) factions.trabalhadores = 100;
  return {
    ...state,
    just_war_target: alvoId,
    economy: { ...state.economy, cash: state.economy.cash - FALSE_FLAG_CASH_COST },
    country: { ...state.country, populacao: population, populacao_base: population, pib_base: gdpBase },
    factions,
    double_agent_active: state.double_agent_active ? false : state.double_agent_active,
    notice: `Falsa Bandeira orquestrada. A opiniao publica exige guerra contra ${target.name}.`,
  };
}

export function infiltrarSosia(state, alvoId) {
  const target = state.geopolitics?.contacts?.find((contact) => contact.id === alvoId
    && !contact.destruido && !contact.anexado && !contact.wasteland);
  if (!target) return { ...state, notice: 'Alvo para sosia invalido.' };
  if (String(target.tipo_governo ?? '').toLowerCase().includes('democr')) {
    return { ...state, notice: 'Sosias so podem infiltrar regimes nao democraticos.' };
  }
  if ((Number(state.economy?.cash) || 0) < LEADER_DOUBLE_CASH_COST) return { ...state, notice: 'Caixa insuficiente para infiltrar o sosia.' };
  if ((Number(state.technology?.points) || 0) < LEADER_DOUBLE_RESEARCH_COST) return { ...state, notice: 'Pontos de Pesquisa insuficientes para criar o sosia.' };

  const random = nextRandom(state.randomSeed);
  const paidState = {
    ...state,
    randomSeed: random.seed,
    economy: { ...state.economy, cash: state.economy.cash - LEADER_DOUBLE_CASH_COST },
    technology: { ...state.technology, points: state.technology.points - LEADER_DOUBLE_RESEARCH_COST },
  };
  if (random.value < 0.6) {
    return {
      ...paidState,
      geopolitics: {
        ...state.geopolitics,
        contacts: state.geopolitics.contacts.map((contact) => contact.id === alvoId ? { ...contact, is_puppet_of: 'jogador' } : contact),
      },
      notice: `Sosia infiltrado em ${target.name}. O governo agora responde ao jogador.`,
    };
  }
  return {
    ...paidState,
    global_defcon: 1,
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === alvoId
        ? { ...contact, atWar: true, alliance: false, relation: -100 }
        : contact),
    },
    notice: `O sosia foi descoberto em ${target.name}. Guerra total e DEFCON 1.`,
  };
}

/** Applies one monthly biological damage tick to infected countries, including the player. */
export function processarInfeccoesBiologicas(state) {
  const playerInfected = Boolean(state.country?.bio_infected);
  const nextCountry = playerInfected ? reduceTarget(state.country) : state.country;
  const country = playerInfected && nextCountry.bio_timer === 0
    ? (() => { const { bio_infected: _infected, bio_timer: _timer, ...cured } = nextCountry; return cured; })()
    : nextCountry;

  const contacts = (state.geopolitics?.contacts ?? []).map((contact) => {
    if (!contact.bio_infected) return contact;
    const damaged = reduceTarget(contact);
    if (damaged.bio_timer > 0) return damaged;
    const { bio_infected: _infected, bio_timer: _timer, ...cured } = damaged;
    return cured;
  });

  return {
    ...state,
    country,
    economy: playerInfected ? { ...state.economy, gdp: Math.max(1, Math.round((Number(state.economy.gdp) || 1) * 0.98)) } : state.economy,
    geopolitics: { ...state.geopolitics, contacts },
  };
}

import { nextRandom } from './geopolitics.js';

