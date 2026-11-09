// Eleicoes presidenciais: mandato de 4 anos, campanha nos 3 ultimos meses e apuracao no mes da eleicao.
// So valem em democracia; ditaduras e imperios nao tem urnas.
import { getFactionSupport, adjustFactions } from './factions.js';
import { getVoteForecast } from './congress.js';

export const ELECTION_TERM_MONTHS = 48;
export const CAMPAIGN_MONTHS = 3;
export const CAMPAIGN_BONUS_CAP = 10;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function createElection() {
  return { nextMonth: ELECTION_TERM_MONTHS, campaignBonus: 0, campaignActionMonths: {}, lastResult: null, results: [] };
}

export function normalizeElection(value) {
  const base = createElection();
  if (!value || typeof value !== 'object') return base;
  const lastResult = value.lastResult && typeof value.lastResult === 'object'
    ? { won: value.lastResult.won === true, share: clamp(Number(value.lastResult.share) || 0, 0, 100), month: Math.max(0, Math.floor(Number(value.lastResult.month) || 0)) }
    : null;
  return {
    nextMonth: Math.max(1, Math.floor(Number(value.nextMonth) || base.nextMonth)),
    campaignBonus: clamp(Number(value.campaignBonus) || 0, 0, CAMPAIGN_BONUS_CAP),
    campaignActionMonths: Object.fromEntries(Object.entries(value.campaignActionMonths ?? {})
      .filter(([key, month]) => ['advertising', 'promises'].includes(key) && Number.isFinite(Number(month)))
      .map(([key, month]) => [key, Number(month)])),
    lastResult,
    results: Array.isArray(value.results) ? value.results.filter((item) => item && typeof item.won === 'boolean').slice(-6) : [],
  };
}

// Saves antigos (ou saltos de tempo) podem ja ter passado da data marcada: a proxima eleicao cai no proximo multiplo de 4 anos.
export function alignElection(election, month) {
  const current = Number(month) || 0;
  if (election.nextMonth >= current) return election;
  return { ...election, nextMonth: (Math.floor(current / ELECTION_TERM_MONTHS) + 1) * ELECTION_TERM_MONTHS };
}

export function hasElections(state) {
  return state.regime?.type === 'democracy' && !state.regime?.electionsSuspended && !state.regime?.gameOver
    && !state.is_wasteland && !state.city;
}

export function monthsToElection(state) {
  const election = alignElection(normalizeElection(state.election), state.monthCounter);
  return Math.max(0, election.nextMonth - (Number(state.monthCounter) || 0));
}

export function isCampaign(state) {
  return hasElections(state) && monthsToElection(state) <= CAMPAIGN_MONTHS;
}

// Intencao de voto (0 a 100): apoio das faccoes, economia, tensao social e esforco de campanha.
export function getPollingShare(state, noise = 0) {
  const election = normalizeElection(state.election);
  const approval = getFactionSupport(state.factions);
  const inflation = Number(state.economy?.inflation) || 0;
  const unemployment = Number(state.economy?.unemployment) || 0;
  const unrest = Number(state.regime?.unrest) || 0;
  const forecast = state.congress ? getVoteForecast(state.congress, state.factions) : null;
  const congressMood = forecast ? ((forecast.votesFor / forecast.totalSeats) - 0.5) * 6 : 0;
  const share = 22
    + (approval * 0.55)
    - (Math.max(0, inflation - 0.04) * 100 * 0.9)
    - (Math.max(0, unemployment - 0.07) * 100 * 0.9)
    - (unrest * 0.12)
    + congressMood
    + election.campaignBonus
    + noise;
  return clamp(share, 0, 100);
}

export const CAMPAIGN_ACTIONS = Object.freeze({
  advertising: Object.freeze({ id: 'advertising', label: 'Propaganda na TV e no rádio', detail: 'Custa 3% do PIB mensal. Soma 3 pontos de intenção de voto.' }),
  promises: Object.freeze({ id: 'promises', label: 'Promessas populistas', detail: 'Custa 1% do PIB mensal e solta a inflação. Soma 4 pontos, mas desgasta a elite.' }),
});

export function getCampaignActionStatus(state, kind) {
  if (!CAMPAIGN_ACTIONS[kind]) return { available: false, reason: 'Ação desconhecida.' };
  if (!isCampaign(state)) return { available: false, reason: 'A campanha só abre nos 3 meses antes da eleição.' };
  const election = normalizeElection(state.election);
  if (Number(election.campaignActionMonths[kind]) === (Number(state.monthCounter) || 0)) return { available: false, reason: 'Já feito neste mês.' };
  if (election.campaignBonus >= CAMPAIGN_BONUS_CAP) return { available: false, reason: 'A campanha já rendeu o máximo.' };
  return { available: true, reason: '' };
}

export function applyCampaignAction(state, kind) {
  const status = getCampaignActionStatus(state, kind);
  if (!status.available) return { ...state, notice: status.reason };
  const election = normalizeElection(state.election);
  const month = Number(state.monthCounter) || 0;
  const monthlyGdp = (Number(state.economy.gdp) || 0) / 12;
  const marks = { ...election.campaignActionMonths, [kind]: month };
  if (kind === 'advertising') {
    return {
      ...state,
      election: { ...election, campaignBonus: clamp(election.campaignBonus + 3, 0, CAMPAIGN_BONUS_CAP), campaignActionMonths: marks },
      economy: { ...state.economy, cash: state.economy.cash - Math.round(monthlyGdp * 0.03) },
      notice: 'A propaganda foi ao ar: a intenção de voto subiu.',
    };
  }
  return {
    ...state,
    election: { ...election, campaignBonus: clamp(election.campaignBonus + 4, 0, CAMPAIGN_BONUS_CAP), campaignActionMonths: marks },
    economy: { ...state.economy, cash: state.economy.cash - Math.round(monthlyGdp * 0.01), inflation: clamp(state.economy.inflation + 0.004, 0, 0.8) },
    factions: adjustFactions(state.factions, { elite: -2 }),
    notice: 'As promessas animaram o eleitorado, mas os mercados desconfiaram.',
  };
}

function electionNoise(state) {
  const seed = Math.abs(Math.floor(Number(state.randomSeed) || 1));
  return ((seed % 7) - 3) * 0.8;
}

// Chamado ao fim de cada mes: avisa da campanha e apura a eleicao no mes marcado.
export function processElection(state) {
  if (!hasElections(state)) return state;
  const month = Number(state.monthCounter) || 0;
  const election = alignElection(normalizeElection(state.election), month);
  const remaining = election.nextMonth - month;
  if (remaining === CAMPAIGN_MONTHS) {
    return {
      ...state,
      election,
      notice: 'A campanha eleitoral começou: faltam 3 meses para as urnas.',
      news: [{ text: 'A campanha eleitoral começou: faltam 3 meses para a eleição presidencial.', calendar: { ...state.calendar } }, ...(state.news ?? [])].slice(0, 5),
    };
  }
  if (remaining > 0) return { ...state, election };
  const share = getPollingShare(state, electionNoise(state));
  const won = share >= 50;
  const result = { won, share: Math.round(share * 10) / 10, month };
  const results = [...election.results, result].slice(-6);
  const percent = result.share.toFixed(1).replace('.', ',');
  if (won) {
    const mandate = state.presidentialMandate ?? {};
    return {
      ...state,
      election: { ...election, nextMonth: election.nextMonth + ELECTION_TERM_MONTHS, campaignBonus: 0, campaignActionMonths: {}, lastResult: result, results },
      presidentialMandate: { ...mandate, term: (Number(mandate.term) || 1) + 1 },
      notice: `Reeleição! O presidente venceu com ${percent}% dos votos e começa um novo mandato.`,
      news: [{ text: `Reeleição: ${percent}% dos votos garantem mais quatro anos de governo.`, calendar: { ...state.calendar } }, ...(state.news ?? [])].slice(0, 5),
    };
  }
  return {
    ...state,
    election: { ...election, campaignBonus: 0, lastResult: result, results },
    regime: { ...state.regime, gameOver: true, outcome: 'derrota-eleitoral' },
    notice: `Derrota nas urnas: apenas ${percent}% dos votos. O mandato chegou ao fim.`,
    news: [{ text: `Derrota eleitoral: ${percent}% dos votos e fim do governo.`, calendar: { ...state.calendar } }, ...(state.news ?? [])].slice(0, 5),
  };
}
