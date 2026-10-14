export const TECHNOLOGIES = Object.freeze([
  Object.freeze({ id: 'drones', branch: 'Engenharia Militar', title: 'Drones', cost: 120, description: 'Aumenta a eficacia militar.', effects: { militaryEffectiveness: 0.12 } }),
  Object.freeze({ id: 'exoskeletons', branch: 'Engenharia Militar', title: 'Exoesqueletos', cost: 260, description: 'Dobra a eficacia da infantaria.', effects: { infantryMultiplier: 2 } }),
  Object.freeze({ id: 'efficient-fission', branch: 'Energia', title: 'Fissao Nuclear Eficiente', cost: 220, description: 'Reduz o custo de infraestrutura estrategica.', effects: { infrastructureCostModifier: -0.18 } }),
  Object.freeze({ id: 'state-hackers', branch: 'Cibernetica', title: 'Hackers de Estado', cost: 240, description: 'Garante sucesso em sabotagens.', effects: { guaranteedSabotage: true } }),
  Object.freeze({ id: 'transgenic-seeds', branch: 'Agronomia', title: 'Sementes Transgenicas', cost: 190, description: 'Elimina a pressao da inflacao de alimentos.', effects: { foodInflationModifier: -0.004 } }),
  Object.freeze({ id: 'genetic-therapy', branch: 'Saude', title: 'Terapia Genetica', cost: 250, description: 'Eleva permanentemente a popularidade de base.', effects: { popularityModifier: 0.5 } }),
  Object.freeze({ id: 'ai-logistics', branch: 'Civil', title: 'IA Logistica', cost: 140, description: 'Melhora crescimento e infraestrutura.', effects: { growthModifier: 0.0008, infrastructureCostModifier: -0.08 } }),
  Object.freeze({ id: 'genetic-medicine', branch: 'Saude e Social', title: 'Medicina Genetica', cost: 420, description: 'Amplia o efeito populacional e a estabilidade dos hospitais.', effects: { popularityModifier: 0.35 }, effect: (modifiers) => ({ ...modifiers, hospitalPopulationMultiplier: 2, hospitalStabilityBonus: 4 }) }),
  Object.freeze({ id: 'carbon-filtration', branch: 'Ambiente', title: 'Filtragem Industrial de Carbono', cost: 460, description: 'Reduz pela metade a poluicao de fabricas e usinas.', effects: {}, effect: (modifiers) => ({ ...modifiers, environmentIndustryImpactModifier: 0.5 }) }),
  Object.freeze({ id: 'maglev', branch: 'Infraestrutura', title: 'Rede Ferroviaria de Alta Velocidade (MAGLEV)', cost: 520, description: 'Multiplica o crescimento economico gerado pela infraestrutura.', effects: {}, effect: (modifiers) => ({ ...modifiers, infrastructureGrowthMultiplier: 1.5 }) }),
  Object.freeze({ id: 'quantum-espionage', branch: 'Cibernetica', title: 'Espionagem Quantica', cost: 700, description: 'Libera operacoes avancadas de inteligencia com furtividade superior.', effects: {}, effect: (modifiers) => ({ ...modifiers, quantumEspionage: true, guaranteedSabotage: true }) }),
  Object.freeze({ id: 'war-logistics-ai', branch: 'Engenharia Militar', title: 'Computador de Logistica de Guerra (IA Tatica)', cost: 850, description: 'Reduz pela metade a manutencao das Forcas Armadas.', effects: {}, effect: (modifiers) => ({ ...modifiers, militaryMaintenanceModifier: 0.5 }) }),
  Object.freeze({ id: 'advanced-bioengineering', branch: 'Biotecnologia', title: 'Engenharia Biologica Avancada', cost: 280, description: 'Libera operacoes biologicas clandestinas.', effects: {} }),
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getDefinition(id) {
  return TECHNOLOGIES.find((technology) => technology.id === id);
}

export function createTechnology() {
  return { points: 0, unlocked: [] };
}

export function advanceTechnology(technology, economy, budget, trait = '') {
  const scienceSpend = clamp(Number(budget.scienceSpend) || 0, 0, 0.15);
  const generated = Math.round((economy.gdp / 1_000_000_000) * scienceSpend * 0.1 * (trait === 'tech_giant' ? 2 : 1));
  return { ...technology, points: Math.max(0, (Number(technology.points) || 0) + generated), generated };
}

export function purchaseTechnology(technology, technologyId) {
  const definition = getDefinition(technologyId);
  if (!definition) return { ok: false, reason: 'Pesquisa nao encontrada.', technology };
  if (technology.unlocked?.includes(technologyId)) return { ok: false, reason: 'Pesquisa ja desbloqueada.', technology };
  if ((Number(technology.points) || 0) < definition.cost) return { ok: false, reason: 'Pontos de Pesquisa insuficientes.', technology };
  return {
    ok: true,
    reason: `${definition.title} desbloqueada.`,
    technology: { ...technology, points: technology.points - definition.cost, unlocked: [...technology.unlocked, technologyId] },
  };
}

export function getTechnologyModifiers(technology) {
  return (technology.unlocked ?? []).reduce((modifiers, technologyId) => {
    const definition = getDefinition(technologyId);
    const effects = definition?.effects ?? {};
    const nextModifiers = {
      militaryEffectiveness: modifiers.militaryEffectiveness + (effects.militaryEffectiveness ?? 0),
      infantryMultiplier: Math.max(modifiers.infantryMultiplier, effects.infantryMultiplier ?? 1),
      growthModifier: modifiers.growthModifier + (effects.growthModifier ?? 0),
      infrastructureCostModifier: modifiers.infrastructureCostModifier + (effects.infrastructureCostModifier ?? 0),
      popularityModifier: modifiers.popularityModifier + (effects.popularityModifier ?? 0),
      foodInflationModifier: modifiers.foodInflationModifier + (effects.foodInflationModifier ?? 0),
      guaranteedSabotage: modifiers.guaranteedSabotage || Boolean(effects.guaranteedSabotage),
      environmentIndustryImpactModifier: modifiers.environmentIndustryImpactModifier,
      infrastructureGrowthMultiplier: modifiers.infrastructureGrowthMultiplier,
      hospitalPopulationMultiplier: modifiers.hospitalPopulationMultiplier,
      hospitalStabilityBonus: modifiers.hospitalStabilityBonus,
      quantumEspionage: modifiers.quantumEspionage,
      militaryMaintenanceModifier: modifiers.militaryMaintenanceModifier,
    };
    return definition?.effect ? definition.effect(nextModifiers) : nextModifiers;
  }, {
    militaryEffectiveness: 0,
    infantryMultiplier: 1,
    growthModifier: 0,
    infrastructureCostModifier: 0,
    popularityModifier: 0,
    foodInflationModifier: 0,
    guaranteedSabotage: false,
    environmentIndustryImpactModifier: 1,
    infrastructureGrowthMultiplier: 1,
    hospitalPopulationMultiplier: 1,
    hospitalStabilityBonus: 0,
    quantumEspionage: false,
    militaryMaintenanceModifier: 1,
  });
}
