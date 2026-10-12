import { nextRandom } from './geopolitics.js';

export const GLOBAL_GAMES_COST = 50_000_000_000;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function verificarSedeGlobal(state) {
  const monthCounter = Number(state.monthCounter) || 0;
  if (!monthCounter || monthCounter % 120 !== 0 || state.pendingGlobalBid) return state;
  return {
    ...state,
    pendingGlobalBid: { status: 'pending' },
    notice: 'A ONU abriu a candidatura para os Jogos Mundiais.',
  };
}

export function candidatarJogosMundiais(state) {
  if (!state.pendingGlobalBid) return { ...state, notice: 'Nenhuma candidatura global esta aberta.' };
  if ((Number(state.economy.cash) || 0) < GLOBAL_GAMES_COST) return { ...state, notice: 'Caixa insuficiente para a candidatura aos Jogos Mundiais.' };
  const globalLeaderGdp = Math.max(state.economy.gdp, ...state.geopolitics.contacts.filter((contact) => !contact.destruido).map((contact) => Number(contact.pib_base) || 0));
  const economicScore = (Number(state.economy.gdp) || 0) / Math.max(1, globalLeaderGdp);
  const chance = clamp((economicScore * 0.7) + ((Number(state.geopolitics.onuScore) || 0) / 100 * 0.3), 0.1, 0.95);
  const random = nextRandom(state.randomSeed);
  const economy = { ...state.economy, cash: state.economy.cash - GLOBAL_GAMES_COST };
  if (random.value >= chance) {
    return { ...state, economy, randomSeed: random.seed, pendingGlobalBid: null, notice: 'A candidatura aos Jogos Mundiais foi derrotada na votacao internacional.' };
  }
  const monthCounter = Number(state.monthCounter) || 0;
  return {
    ...state,
    economy,
    randomSeed: random.seed,
    pendingGlobalBid: null,
    host_global_event: true,
    globalEventTourismUntil: monthCounter + 12,
    onuReputationLockedUntil: monthCounter + 36,
    geopolitics: { ...state.geopolitics, onuScore: 100, internationalSanctions: false },
    notice: 'Jogos Mundiais conquistados: turismo e prestigio internacional garantidos.',
  };
}

export function recusarCandidaturaGlobal(state) {
  if (!state.pendingGlobalBid) return state;
  return { ...state, pendingGlobalBid: null, notice: 'O governo recusou concorrer aos Jogos Mundiais.' };
}

export function getSoftPowerModifiers(state) {
  const tourismActive = Boolean(state.host_global_event) && (Number(state.monthCounter) || 0) < (Number(state.globalEventTourismUntil) || 0);
  return { cashRevenueModifier: tourismActive ? 0.5 : 0 };
}

export function aplicarEfeitosSoftPower(state) {
  if ((Number(state.monthCounter) || 0) >= (Number(state.onuReputationLockedUntil) || 0)) return state;
  return { ...state, geopolitics: { ...state.geopolitics, onuScore: 100, internationalSanctions: false } };
}
