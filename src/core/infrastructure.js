export const AUTOMATION_CASH_COST = 200_000_000_000;
export const AUTOMATION_RESEARCH_COST = 250;
export const AUTOMATED_STEEL_OUTPUT = 3_000;

export function automatizarIndustria(state) {
  if (state.country.industry_automated) return { ...state, notice: 'O parque industrial ja esta automatizado.' };
  if ((Number(state.economy.cash) || 0) < AUTOMATION_CASH_COST) return { ...state, notice: 'Caixa insuficiente para automatizar o parque industrial.' };
  if ((Number(state.technology.points) || 0) < AUTOMATION_RESEARCH_COST) return { ...state, notice: 'Pontos de Pesquisa insuficientes para a automacao industrial.' };
  return {
    ...state,
    country: { ...state.country, industry_automated: true },
    economy: { ...state.economy, cash: state.economy.cash - AUTOMATION_CASH_COST },
    technology: { ...state.technology, points: state.technology.points - AUTOMATION_RESEARCH_COST },
    notice: 'Parque industrial automatizado: a producao de aco foi triplicada.',
  };
}

export function processarAutomacaoIndustrial(state) {
  if (!state.country.industry_automated) return state;
  return {
    ...state,
    country: { ...state.country, steel: (Number(state.country.steel) || 0) + AUTOMATED_STEEL_OUTPUT },
    factions: { ...state.factions, trabalhadores: Math.max(0, (Number(state.factions.trabalhadores) || 0) - 5) },
  };
}
