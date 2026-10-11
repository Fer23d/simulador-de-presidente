export const LAW_LABOR_REFORM = Object.freeze({
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
  id: 'tax-reform',
  stateKey: 'taxReform',
  title: 'Reforma Tributaria',
  description: 'Amplia a capacidade de arrecadacao e simplifica regras fiscais; irrita a esquerda.',
  affinity: Object.freeze({ left: 0.3, center: 0.66, right: 0.74, nationalist: 0.42 }),
  monthlyEffects: Object.freeze({ growthModifier: 0.00035, inflationModifier: -0.0001, unemploymentModifier: -0.0001, popularityModifier: -0.12, taxRevenueModifier: 0.08 }),
});

export const LAW_ENVIRONMENTAL_PROTECTION = Object.freeze({
  id: 'environmental-protection',
  stateKey: 'environmentalProtection',
  title: 'Lei Ambiental Rigida',
  description: 'Amplia a fiscalizacao ambiental: desacelera o PIB, mas recupera prestigio internacional.',
  affinity: Object.freeze({ left: 0.7, center: 0.5, right: 0.2, nationalist: 0.35 }),
  monthlyEffects: Object.freeze({ growthModifier: -0.00035, inflationModifier: 0, unemploymentModifier: 0, popularityModifier: 0.12, onuModifier: 0.7 }),
});

export const LAW_MEDIA_CENSORSHIP = Object.freeze({
  id: 'media-censorship',
  stateKey: 'mediaCensorship',
  title: 'Censura da Midia',
  description: 'Restringe comunicacao independente e reduz pressao interna, ao custo de condenacao global.',
  affinity: Object.freeze({ left: 0.08, center: 0.2, right: 0.45, nationalist: 0.82 }),
  monthlyEffects: Object.freeze({ popularityModifier: -0.16, coupRiskModifier: -0.06, onuModifier: -2.5 }),
});

export const LAW_MILITARY_SUBSIDY = Object.freeze({
  id: 'military-subsidy',
  stateKey: 'militarySubsidy',
  title: 'Subsidio Militar',
  description: 'Financia a cadeia de defesa: amplia apoio militar, mas cria um custo mensal permanente.',
  affinity: Object.freeze({ left: 0.2, center: 0.45, right: 0.74, nationalist: 0.8 }),
  monthlyEffects: Object.freeze({ popularityModifier: -0.05, militarySupportModifier: 1.5, cashModifier: -1_200_000_000 }),
});

export const LAWS = Object.freeze([
  LAW_LABOR_REFORM,
  LAW_TAX_REFORM,
  LAW_ENVIRONMENTAL_PROTECTION,
  LAW_MEDIA_CENSORSHIP,
  LAW_MILITARY_SUBSIDY,
]);
