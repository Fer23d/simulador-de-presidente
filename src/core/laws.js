export const LAW_LABOR_REFORM = Object.freeze({
  id: 'labor-reform',
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
