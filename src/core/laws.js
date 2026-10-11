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
  title: 'Reforma Tributaria Produtiva',
  description: 'Simplifica regras fiscais e reduz distorcoes sobre investimentos.',
  affinity: Object.freeze({ left: 0.3, center: 0.66, right: 0.74, nationalist: 0.42 }),
  monthlyEffects: Object.freeze({ growthModifier: 0.00045, inflationModifier: -0.0001, unemploymentModifier: -0.0001, popularityModifier: -0.08 }),
});

export const LAW_ENVIRONMENTAL_PROTECTION = Object.freeze({
  id: 'environmental-protection',
  stateKey: 'environmentalProtection',
  title: 'Lei de Protecao Ambiental',
  description: 'Amplia fiscalizacao e protege recursos naturais estrategicos.',
  affinity: Object.freeze({ left: 0.7, center: 0.5, right: 0.2, nationalist: 0.35 }),
  monthlyEffects: Object.freeze({ growthModifier: -0.00015, inflationModifier: 0, unemploymentModifier: 0, popularityModifier: 0.12 }),
});

export const LAWS = Object.freeze([LAW_LABOR_REFORM, LAW_TAX_REFORM, LAW_ENVIRONMENTAL_PROTECTION]);
