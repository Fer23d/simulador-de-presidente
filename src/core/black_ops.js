const VIRUS_CASH_COST = 20_000_000_000;
const VIRUS_RARE_EARTH_COST = 120;
const VIRUS_DURATION_MONTHS = 12;
export const FALSE_FLAG_CASH_COST = 75_000_000_000;

function hasBioengineering(technology) {
  return Boolean(technology?.unlocked?.includes('advanced-bioengineering'));
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
  if (!hasBioengineering(state.technology)) return { ...state, notice: 'A operacao exige Engenharia Biologica Avancada.' };
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
  return {
    ...state,
    just_war_target: alvoId,
    economy: { ...state.economy, cash: state.economy.cash - FALSE_FLAG_CASH_COST },
    country: { ...state.country, populacao: population, populacao_base: population, pib_base: gdpBase },
    factions: { ...state.factions, militares: 100, trabalhadores: 100 },
    notice: `Falsa Bandeira orquestrada. A opiniao publica exige guerra contra ${target.name}.`,
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

