// Conquistas da conta (valem para qualquer partida): ligadas a inflacao, divida, eleicoes, Congresso, relatorio anual,
// diplomacia e aos finais da Porta. Sao avaliadas a partir do estado do jogo, sem contadores extras.
import { getDebtStatus } from './economy.js';
import { SECTOR_IDS, normalizeSectors } from './sectors.js';
import { getBlocLoyalty } from './congress_life.js';

export const ACHIEVEMENTS_KEY = 'simulador-presidente-conquistas-v1';

const months = (state) => Number(state.monthCounter) || 0;
const isPresidency = (state) => !state.is_wasteland && !state.city;
const contacts = (state) => state.geopolitics?.contacts ?? [];
const wins = (state) => (state.election?.results ?? []).filter((result) => result.won).length;

export const ACHIEVEMENTS = Object.freeze([
  { id: 'steady_hand', icon: '🧊', title: 'Mão firme', description: 'Fique 24 meses seguidos com a inflação mensal abaixo de 5%.',
    check: (state) => { const history = state.economy?.inflationHistory ?? []; return history.length >= 24 && history.slice(-24).every((value) => value < 0.05); } },
  { id: 'price_stability', icon: '🏷️', title: 'Preços estáveis', description: 'Chegue a 2% de inflação ou menos depois do primeiro ano.',
    check: (state) => isPresidency(state) && months(state) >= 12 && (Number(state.economy?.inflation) || 1) <= 0.02 },
  { id: 'full_employment', icon: '👷', title: 'Pleno emprego', description: 'Desemprego de 4% ou menos depois de dois anos de governo.',
    check: (state) => isPresidency(state) && months(state) >= 24 && (Number(state.economy?.unemployment) || 1) <= 0.04 },
  { id: 'rainy_day_fund', icon: '🏦', title: 'Cofre cheio', description: 'Tenha caixa equivalente a 10% do PIB.',
    check: (state) => isPresidency(state) && months(state) >= 12 && (Number(state.economy?.cash) || 0) >= (Number(state.economy?.gdp) || 1) * 0.1 },
  { id: 'gold_rating', icon: '🥇', title: 'Crédito de ouro', description: 'Mantenha o rating AAA depois de três anos de governo.',
    check: (state) => isPresidency(state) && months(state) >= 36 && getDebtStatus(state.economy ?? {}, state.budget ?? {}).rating === 'AAA' },
  { id: 'balanced_economy', icon: '⚖️', title: 'Economia equilibrada', description: 'Deixe os quatro setores com mais de 12% do PIB cada, e nenhum acima de 55%.',
    check: (state) => {
      if (!isPresidency(state) || months(state) < 12) return false;
      const sectors = normalizeSectors(state.economy?.sectors);
      return SECTOR_IDS.every((id) => sectors[id].share > 0.12 && sectors[id].share < 0.55);
    } },
  { id: 'reelected', icon: '🗳️', title: 'Reeleito', description: 'Vença uma eleição presidencial.',
    check: (state) => wins(state) >= 1 },
  { id: 'twice_reelected', icon: '👑', title: 'Dois mandatos de sobra', description: 'Vença duas eleições presidenciais.',
    check: (state) => wins(state) >= 2 },
  { id: 'perfect_year', icon: '🏅', title: 'Ano perfeito', description: 'Cumpra as quatro metas do ano e receba nota A+.',
    check: (state) => (state.yearReports ?? []).some((report) => report.grade === 'A+') },
  { id: 'five_reports', icon: '📑', title: 'Gabinete experiente', description: 'Receba cinco relatórios anuais.',
    check: (state) => (state.yearReports ?? []).length >= 5 },
  { id: 'loyal_base', icon: '🤝', title: 'Base fiel', description: 'Deixe as quatro bancadas com 70% de lealdade ou mais ao mesmo tempo.',
    check: (state) => isPresidency(state) && months(state) >= 12 && (state.congress?.blocs ?? []).length === 4 && state.congress.blocs.every((bloc) => getBlocLoyalty(bloc) >= 70) },
  { id: 'allies_ten', icon: '🌐', title: 'Rede de aliados', description: 'Tenha 10 países aliados.',
    check: (state) => contacts(state).filter((contact) => contact.alliance).length >= 10 },
  { id: 'trade_network', icon: '🚢', title: 'Rota comercial', description: 'Feche acordos comerciais com 25 países.',
    check: (state) => contacts(state).filter((contact) => contact.tradeTreaty).length >= 25 },
  { id: 'respected', icon: '🕊️', title: 'Voz respeitada', description: 'Chegue a 90 pontos de reputação na ONU.',
    check: (state) => isPresidency(state) && (Number(state.geopolitics?.onuScore) || 0) >= 90 },
  { id: 'decade', icon: '📆', title: 'Uma década no poder', description: 'Chegue a 10 anos de governo em uma democracia.',
    check: (state) => isPresidency(state) && months(state) >= 120 && state.regime?.type === 'democracy' && !state.regime?.gameOver },
  { id: 'cayman', icon: '🏝️', title: 'Passagem para as Cayman', description: 'Desvie fundos para o caixa 2 (e carregue a culpa).',
    check: (state) => (Number(state.slush_fund) || 0) > 0 },
  { id: 'year_zero', icon: '☢️', title: 'Ano Zero', description: 'Sobreviva até assumir o comando do Vault.',
    check: (state) => state.is_wasteland === true && !state.wasteland_cinematic_ready },
  { id: 'door_opened', icon: '🚪', title: 'A Porta se abre', description: 'Alcance qualquer final da Porta.',
    check: (state, trophies) => Boolean(state.ending) || (trophies?.endings?.length ?? 0) >= 1 },
  { id: 'all_endings', icon: '🏆', title: 'Todos os destinos', description: 'Descubra os sete finais da Porta.',
    check: (state, trophies) => (trophies?.endings?.length ?? 0) >= 7 },
]);

export function createAchievementStore(value = {}) {
  const unlocked = {};
  for (const [id, info] of Object.entries(value?.unlocked ?? {})) {
    if (!ACHIEVEMENTS.some((item) => item.id === id)) continue;
    unlocked[id] = { year: Number(info?.year) || null, country: typeof info?.country === 'string' ? info.country : '' };
  }
  return { version: 1, unlocked };
}

// Devolve as conquistas que passaram a valer neste estado e ainda nao estavam na conta.
export function findNewAchievements(state, store, trophies = null) {
  const known = createAchievementStore(store).unlocked;
  return ACHIEVEMENTS.filter((item) => !known[item.id] && item.check(state, trophies));
}

export function recordAchievements(store, items, state) {
  const current = createAchievementStore(store);
  const unlocked = { ...current.unlocked };
  for (const item of items) unlocked[item.id] = { year: Number(state.calendar?.year) || null, country: state.country?.id ?? '' };
  return { ...current, unlocked };
}
