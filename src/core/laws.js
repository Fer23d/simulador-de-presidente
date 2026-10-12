export const LAW_LABOR_REFORM = Object.freeze({
  category: 'Sociedade',
  id: 'labor-reform',
  stateKey: 'laborReform',
  title: 'Lei Trabalhista de Protecao e Qualificacao',
  description: 'Amplia qualificacao profissional e atualiza garantias de trabalho.',
  affinity: Object.freeze({
    left: 0.75,
    center: 0.55,
    right: 0.18,
    nationalist: 0.15,
  }),
  monthlyEffects: Object.freeze({
    growthModifier: -0.0002,
    inflationModifier: 0.0001,
    unemploymentModifier: -0.00035,
    popularityModifier: 0.18,
  }),
});

export const LAW_TAX_REFORM = Object.freeze({
  category: 'Economia',
  id: 'tax-reform',
  stateKey: 'taxReform',
  title: 'Reforma Tributaria',
  description: 'Amplia a capacidade de arrecadacao e simplifica regras fiscais; irrita a esquerda.',
  affinity: Object.freeze({ left: 0.3, center: 0.66, right: 0.74, nationalist: 0.42 }),
  monthlyEffects: Object.freeze({ growthModifier: 0.00035, inflationModifier: -0.0001, unemploymentModifier: -0.0001, popularityModifier: -0.12, taxRevenueModifier: 0.08 }),
});

export const LAW_ENVIRONMENTAL_PROTECTION = Object.freeze({
  category: 'Ambiente',
  id: 'environmental-protection',
  stateKey: 'environmentalProtection',
  title: 'Lei Ambiental Rigida',
  description: 'Amplia a fiscalizacao ambiental: desacelera o PIB, mas recupera prestigio internacional.',
  affinity: Object.freeze({ left: 0.7, center: 0.5, right: 0.2, nationalist: 0.35 }),
  monthlyEffects: Object.freeze({ growthModifier: -0.00035, inflationModifier: 0, unemploymentModifier: 0, popularityModifier: 0.12, onuModifier: 0.7 }),
});

export const LAW_MEDIA_CENSORSHIP = Object.freeze({
  category: 'Seguranca',
  id: 'media-censorship',
  stateKey: 'mediaCensorship',
  title: 'Censura da Midia',
  description: 'Restringe comunicacao independente e reduz pressao interna, ao custo de condenacao global.',
  affinity: Object.freeze({ left: 0.08, center: 0.2, right: 0.45, nationalist: 0.82 }),
  monthlyEffects: Object.freeze({ popularityModifier: -0.16, coupRiskModifier: -0.06, onuModifier: -2.5 }),
});

export const LAW_MILITARY_SUBSIDY = Object.freeze({
  category: 'Seguranca',
  id: 'military-subsidy',
  stateKey: 'militarySubsidy',
  title: 'Subsidio Militar',
  description: 'Financia a cadeia de defesa: amplia apoio militar, mas cria um custo mensal permanente.',
  affinity: Object.freeze({ left: 0.2, center: 0.45, right: 0.74, nationalist: 0.8 }),
  monthlyEffects: Object.freeze({ popularityModifier: -0.05, militarySupportModifier: 1.5, cashModifier: -1_200_000_000 }),
});

function policy(id, stateKey, title, category, monthlyEffects) {
  return Object.freeze({ id, stateKey, title, category, description: title, affinity: Object.freeze({ left: 0.5, center: 0.5, right: 0.5, nationalist: 0.5 }), monthlyEffects: Object.freeze(monthlyEffects) });
}

export const LAW_OIL_NATIONALIZATION = policy('oil-nationalization', 'oilNationalization', 'Estatizacao do Petroleo', 'Economia', { cashModifier: 1_000_000_000, popularityModifier: -0.08 });
export const LAW_PRESS_CENSORSHIP = policy('press-censorship', 'pressCensorship', 'Censura da Imprensa', 'Seguranca', { popularityModifier: -0.04, onuModifier: -4, coupRiskModifier: -0.08 });
export const LAW_MANDATORY_SERVICE = policy('mandatory-service', 'mandatoryService', 'Servico Militar Obrigatorio', 'Seguranca', { growthModifier: -0.0003, popularityModifier: -0.12, militarySupportModifier: 0.8 });
export const LAW_WEALTH_TAX = policy('wealth-tax', 'wealthTax', 'Imposto sobre Grandes Fortunas', 'Economia', { cashModifier: 800_000_000, growthModifier: -0.00045, popularityModifier: -0.1 });
export const LAW_UNIVERSAL_HEALTH = policy('universal-health', 'universalHealth', 'Saude Universal', 'Sociedade', { popularityModifier: 0.2, unemploymentModifier: -0.0001, cashModifier: -600_000_000 });
export const LAW_HOUSING_PROGRAM = policy('housing-program', 'housingProgram', 'Programa Nacional de Habitacao', 'Sociedade', { popularityModifier: 0.16, growthModifier: 0.00015, cashModifier: -500_000_000 });
export const LAW_GREEN_ENERGY = policy('green-energy', 'greenEnergy', 'Transicao para Energia Limpa', 'Ambiente', { growthModifier: -0.0001, onuModifier: 1.2, inflationModifier: -0.0001 });
export const LAW_FOREST_PROTECTION = policy('forest-protection', 'forestProtection', 'Protecao Florestal', 'Ambiente', { growthModifier: -0.00015, onuModifier: 0.9, popularityModifier: 0.06 });
export const LAW_ANTI_CORRUPTION = policy('anti-corruption', 'antiCorruption', 'Lei Anticorrupcao', 'Seguranca', { popularityModifier: 0.11, onuModifier: 0.5, cashModifier: 250_000_000 });
export const LAW_EXPORT_INCENTIVE = policy('export-incentive', 'exportIncentive', 'Incentivo a Exportacoes', 'Economia', { growthModifier: 0.0004, inflationModifier: -0.0001 });
export const LAW_DEREGULATION = policy('deregulation', 'deregulation', 'Desregulamentacao Empresarial', 'Economia', { growthModifier: 0.00055, popularityModifier: -0.08 });
export const LAW_PRIVATIZATION = policy('privatization', 'privatization', 'Programa de Privatizacao', 'Economia', { cashModifier: 1_500_000_000, growthModifier: 0.0003, popularityModifier: -0.1 });

export const LAWS = Object.freeze([
  LAW_LABOR_REFORM,
  LAW_TAX_REFORM,
  LAW_ENVIRONMENTAL_PROTECTION,
  LAW_MEDIA_CENSORSHIP,
  LAW_MILITARY_SUBSIDY,
  LAW_OIL_NATIONALIZATION,
  LAW_PRESS_CENSORSHIP,
  LAW_MANDATORY_SERVICE,
  LAW_WEALTH_TAX,
  LAW_UNIVERSAL_HEALTH,
  LAW_HOUSING_PROGRAM,
  LAW_GREEN_ENERGY,
  LAW_FOREST_PROTECTION,
  LAW_ANTI_CORRUPTION,
  LAW_EXPORT_INCENTIVE,
  LAW_DEREGULATION,
  LAW_PRIVATIZATION,
]);

export function aggregateActiveLawEffects(lawsState = {}) {
  return LAWS.reduce((total, law) => {
    if (!lawsState[law.stateKey]?.approved) return total;
    return Object.entries(law.monthlyEffects).reduce(
      (effects, [key, value]) => ({ ...effects, [key]: (effects[key] ?? 0) + value }),
      total,
    );
  }, {});
}
