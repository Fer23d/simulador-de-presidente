import { nextRandom } from './geopolitics.js';

const BILLION = 1_000_000_000;

export const AUTOMATION_CASH_COST = 200_000_000_000;
export const AUTOMATION_RESEARCH_COST = 250;
export const AUTOMATED_STEEL_OUTPUT = 3_000;

export const INTERNAL_PROJECTS = Object.freeze([
  Object.freeze({ id: 'roads', title: 'Construir Rodovia Nacional', cost: 5 * BILLION, target: 'infrastructure', field: 'roads', description: 'Aumenta a conectividade e o crescimento do PIB.' }),
  Object.freeze({ id: 'railways', title: 'Construir Ferrovia Nacional', cost: 7 * BILLION, target: 'infrastructure', field: 'railways', description: 'Reduz gargalos logísticos e amplia o crescimento.' }),
  Object.freeze({ id: 'airports', title: 'Construir Aeroporto Internacional', cost: 12 * BILLION, target: 'infrastructure', field: 'airports', description: 'Acelera comércio, turismo e circulação de pessoas.' }),
  Object.freeze({ id: 'hospitals', title: 'Construir Hospital Regional', cost: 8 * BILLION, target: 'health', field: 'hospitals', description: 'Aumenta a população saudável e o apoio dos trabalhadores.' }),
  Object.freeze({ id: 'clinics', title: 'Abrir Clínicas Comunitárias', cost: 3 * BILLION, target: 'health', field: 'clinics', description: 'Amplia o atendimento básico com manutenção moderada.' }),
  Object.freeze({ id: 'factories', title: 'Construir Complexo Industrial', cost: 10 * BILLION, target: 'industry', field: 'factories', description: 'Gera caixa e PIB, mas pressiona o ambiente todos os meses.' }),
  Object.freeze({ id: 'power_plants', title: 'Construir Usina Energética', cost: 12 * BILLION, target: 'industry', field: 'power_plants', description: 'Aumenta a capacidade produtiva e a arrecadação.' }),
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

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

export function buildInternalProject(state, projectId) {
  const project = INTERNAL_PROJECTS.find((item) => item.id === projectId);
  if (!project) return { ...state, notice: 'Projeto interno nao encontrado.' };
  if ((Number(state.economy.cash) || 0) < project.cost) {
    return { ...state, notice: `Caixa insuficiente para ${project.title.toLowerCase()}.` };
  }

  const currentTarget = state[project.target] ?? {};
  const nextTarget = { ...currentTarget, [project.field]: (Number(currentTarget[project.field]) || 0) + 1 };
  const nextState = {
    ...state,
    [project.target]: nextTarget,
    economy: { ...state.economy, cash: state.economy.cash - project.cost },
    notice: `${project.title} concluido.`,
  };

  if (project.id === 'hospitals') {
    const geneticMedicine = state.technology?.unlocked?.includes('genetic-medicine');
    const populationBonus = geneticMedicine ? 100_000 : 50_000;
    return {
      ...nextState,
      country: {
        ...state.country,
        populacao: (Number(state.country.populacao) || 0) + populationBonus,
        populacao_base: (Number(state.country.populacao_base) || 0) + populationBonus,
      },
      factions: {
        ...state.factions,
        trabalhadores: clamp((Number(state.factions?.trabalhadores) || 0) + (geneticMedicine ? 4 : 2), 0, 100),
      },
    };
  }
  return nextState;
}

export function calculateInternalMaintenance(state, technologyModifiers = {}) {
  const infrastructure = state.infrastructure ?? {};
  const health = state.health ?? {};
  const industry = state.industry ?? {};
  const baseCost = (Number(infrastructure.roads) || 0) * 50_000_000
    + (Number(infrastructure.railways) || 0) * 80_000_000
    + (Number(infrastructure.airports) || 0) * 120_000_000
    + (Number(health.hospitals) || 0) * 200_000_000
    + (Number(health.clinics) || 0) * 80_000_000
    + (Number(industry.factories) || 0) * 250_000_000
    + (Number(industry.power_plants) || 0) * 300_000_000;
  return Math.round(baseCost * (technologyModifiers.internalMaintenanceModifier ?? 1));
}

export function getInternalProjectModifiers(state, technologyModifiers = {}) {
  const infrastructure = state.infrastructure ?? {};
  const industry = state.industry ?? {};
  const infrastructureGrowth = ((Number(infrastructure.roads) || 0) * 0.00008
    + (Number(infrastructure.railways) || 0) * 0.00014
    + (Number(infrastructure.airports) || 0) * 0.00018)
    * (technologyModifiers.infrastructureGrowthMultiplier ?? 1);
  const industrialGrowth = (Number(industry.factories) || 0) * 0.00045
    + (Number(industry.power_plants) || 0) * 0.00035;
  return {
    growthModifier: infrastructureGrowth + industrialGrowth,
    cashRevenueModifier: (Number(industry.factories) || 0) * 0.004 + (Number(industry.power_plants) || 0) * 0.003,
  };
}

export function processarProjetosInternos(state, technologyModifiers = {}) {
  const industry = state.industry ?? {};
  const pollutionImpact = technologyModifiers.environmentIndustryImpactModifier ?? 1;
  const pollution = (Number(industry.factories) || 0) * 2 * pollutionImpact
    + (Number(industry.power_plants) || 0) * 1 * pollutionImpact;
  const currentEnvironment = Number.isFinite(Number(state.environment_health)) ? Number(state.environment_health) : 100;
  const environment_health = clamp(currentEnvironment - pollution, 0, 100);
  const internal_maintenance_cost = calculateInternalMaintenance(state, technologyModifiers);
  let randomSeed = state.randomSeed;
  let economy = state.economy;
  let ecologicalDisaster = false;
  let notice = null;

  if (environment_health < 40) {
    const roll = nextRandom(state.randomSeed || 1);
    randomSeed = roll.seed;
    if (roll.value < 0.12) {
      ecologicalDisaster = true;
      economy = {
        ...state.economy,
        gdp: Math.max(0, Math.round(state.economy.gdp * 0.97)),
        inflation: clamp((Number(state.economy.inflation) || 0) + 0.02, 0, 0.8),
        cash: state.economy.cash - 1_000_000_000,
      };
      notice = 'Desastre ecologico: colheitas destruidas e revolta ambiental nas ruas.';
    }
  }

  return {
    ...state,
    economy,
    environment_health,
    internal_maintenance_cost,
    ecologicalDisaster,
    randomSeed,
    notice,
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
