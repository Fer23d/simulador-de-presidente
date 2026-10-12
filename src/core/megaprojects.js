export const DEAD_HAND_CASH_COST = 1_000_000_000_000;
export const DEAD_HAND_RESEARCH_COST = 1_000;
export const DEAD_HAND_URANIUM_COST = 250;
export const DEAD_HAND_DURATION = 12;

function zeroMilitary(military = {}) {
  return {
    ...military,
    power: 0,
    soldiers: 0,
    exercito: { ...(military.exercito ?? {}), soldados: 0, blindados: 0 },
    marinha: { ...(military.marinha ?? {}), navios: 0 },
    aeronautica: { ...(military.aeronautica ?? {}), cacas: 0 },
  };
}

function wasteContact(contact) {
  return {
    ...contact,
    wasteland: true,
    atWar: false,
    alliance: false,
    tradeTreaty: false,
    population: 0,
    populacao_base: 0,
    pib_base: 0,
    militaryPower: 0,
    military: zeroMilitary(contact.military),
  };
}

export function iniciarProjetoMaoMorta(state) {
  const deadHand = state.megaprojects?.deadHand;
  if (state.dead_hand_active || deadHand?.remainingMonths > 0) return { ...state, notice: 'A Rede Mao Morta ja esta em construcao ou ativa.' };
  if (!state.unlocked_techs?.includes('dead_hand')) return { ...state, notice: 'O projeto exige [ I.A. MÃO MORTA ].' };
  if ((Number(state.economy?.cash) || 0) < DEAD_HAND_CASH_COST) return { ...state, notice: 'Caixa insuficiente para a Rede Mao Morta.' };
  if ((Number(state.technology?.points) || 0) < DEAD_HAND_RESEARCH_COST) return { ...state, notice: 'Pontos de Pesquisa insuficientes para a Rede Mao Morta.' };
  if ((Number(state.country?.uranium) || 0) < DEAD_HAND_URANIUM_COST) return { ...state, notice: 'Uranio insuficiente para a Rede Mao Morta.' };
  return {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash - DEAD_HAND_CASH_COST },
    technology: { ...state.technology, points: state.technology.points - DEAD_HAND_RESEARCH_COST },
    country: { ...state.country, uranium: state.country.uranium - DEAD_HAND_URANIUM_COST },
    megaprojects: { ...(state.megaprojects ?? {}), deadHand: { remainingMonths: DEAD_HAND_DURATION, uraniumReserve: DEAD_HAND_URANIUM_COST } },
    notice: 'Rede Mao Morta iniciada: conclusao prevista em doze meses.',
  };
}

export function processarMegaprojetos(state) {
  const remainingMonths = Number(state.megaprojects?.deadHand?.remainingMonths) || 0;
  if (state.dead_hand_active || remainingMonths <= 0) return state;
  if (remainingMonths > 1) {
    return { ...state, megaprojects: { ...state.megaprojects, deadHand: { ...state.megaprojects.deadHand, remainingMonths: remainingMonths - 1 } } };
  }
  return {
    ...state,
    dead_hand_active: true,
    megaprojects: { ...state.megaprojects, deadHand: { ...state.megaprojects.deadHand, remainingMonths: 0, completed: true } },
    notice: 'Rede Mao Morta ativa: os silos respondem a perda do governo.',
  };
}

export function interceptarGameOverComMaoMorta(state) {
  if (!state.dead_hand_active || !state.regime?.gameOver || state.dead_hand_triggered) return state;
  const reserve = Math.max(0, Number(state.megaprojects?.deadHand?.uraniumReserve) || 0);
  const countryUranium = Math.max(0, Number(state.country?.uranium) || 0);
  let uranium = countryUranium + reserve;
  let strikes = 0;
  const contacts = (state.geopolitics?.contacts ?? []).map((contact) => {
    if (contact.destruido || contact.anexado || contact.wasteland || uranium < 1) return contact;
    uranium -= 1;
    strikes += 1;
    return wasteContact(contact);
  });
  const reserveRemaining = Math.max(0, reserve - strikes);
  const countryUraniumRemaining = Math.max(0, countryUranium - Math.max(0, strikes - reserve));
  return {
    ...state,
    dead_hand_triggered: true,
    country: { ...state.country, wasteland: true, populacao: 0, populacao_base: 0, pib_base: 0, uranium: countryUraniumRemaining },
    economy: { ...state.economy, gdp: 0, cash: 0 },
    military: zeroMilitary(state.military),
    geopolitics: { ...state.geopolitics, contacts },
    megaprojects: { ...state.megaprojects, deadHand: { ...state.megaprojects?.deadHand, uraniumReserve: reserveRemaining } },
    regime: { ...state.regime, gameOver: true, outcome: 'mao-morta' },
    notice: 'DIRETRIZ OMEGA EXECUTADA: destruicao mutua assegurada.',
  };
}
