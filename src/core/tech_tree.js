const BILLION = 1_000_000_000;

export const MILITARY_TECHNOLOGIES = Object.freeze([
  Object.freeze({ id: 'missiles', title: '[ MÍSSEIS BALÍSTICOS ]', cost: 1_000, requires: Object.freeze([]) }),
  Object.freeze({ id: 'cyber', title: '[ CIBER-GUERRA ZERO-DAY ]', cost: 2_500, requires: Object.freeze([]) }),
  Object.freeze({ id: 'bio', title: '[ ENGENHARIA PATOGÉNICA (VÍRUS) ]', cost: 5_000, requires: Object.freeze([]) }),
  Object.freeze({ id: 'nuke', title: '[ ENRIQUECIMENTO DE URÂNIO ]', cost: 10_000, requires: Object.freeze(['missiles']) }),
  Object.freeze({ id: 'dead_hand', title: '[ I.A. MÃO MORTA ]', cost: 25_000, requires: Object.freeze(['nuke']) }),
]);

export function getMilitaryTechnology(techId) {
  return MILITARY_TECHNOLOGIES.find((technology) => technology.id === techId);
}

export function calculateMilitaryResearchPoints(economy = {}, budget = {}) {
  const gdp = Math.max(0, Number(economy.gdp) || 0);
  const defenseSpend = Math.max(0, Number(budget.defenseSpend) || 0);
  if (defenseSpend === 0) return 0;
  return Math.max(1, Math.floor((gdp / BILLION) * defenseSpend));
}

export function pesquisarTecnologia(state, techId) {
  const technology = getMilitaryTechnology(techId);
  if (!technology) return { ...state, notice: 'Projeto militar nao encontrado.' };

  const unlocked = Array.isArray(state.unlocked_techs) ? state.unlocked_techs : [];
  if (unlocked.includes(techId)) return { ...state, notice: `${technology.title} ja foi concluido.` };

  const missingRequirements = technology.requires.filter((requiredId) => !unlocked.includes(requiredId));
  if (missingRequirements.length > 0) {
    return { ...state, notice: `${technology.title} possui dependencia militar pendente.` };
  }

  const points = Math.max(0, Number(state.military_research_points) || 0);
  if (points < technology.cost) return { ...state, notice: 'Pontos de Pesquisa Militar insuficientes.' };

  return {
    ...state,
    military_research_points: points - technology.cost,
    unlocked_techs: [...unlocked, techId],
    notice: `${technology.title} desbloqueada.`,
  };
}
