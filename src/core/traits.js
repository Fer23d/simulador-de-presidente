const TRAIT_MODIFIERS = Object.freeze({
  oil_rich: Object.freeze({ exportRevenueRate: 0.003, sanctionVulnerability: 0.5, researchMultiplier: 1, foodInflationModifier: 0, cashInterest: 0 }),
  military_tradition: Object.freeze({ exportRevenueRate: 0, sanctionVulnerability: 0, researchMultiplier: 1, foodInflationModifier: 0, cashInterest: 0 }),
  tech_giant: Object.freeze({ exportRevenueRate: 0, sanctionVulnerability: 0, researchMultiplier: 2, foodInflationModifier: 0, cashInterest: 0 }),
  agri_power: Object.freeze({ exportRevenueRate: 0, sanctionVulnerability: 0, researchMultiplier: 1, foodInflationModifier: -0.0015, cashInterest: 0 }),
  financial_hub: Object.freeze({ exportRevenueRate: 0, sanctionVulnerability: 0, researchMultiplier: 1, foodInflationModifier: 0, cashInterest: 0.001 }),
});

const DEFAULT_MODIFIERS = Object.freeze({ exportRevenueRate: 0, sanctionVulnerability: 0, researchMultiplier: 1, foodInflationModifier: 0, cashInterest: 0 });

export function getTraitModifiers(country, economy = {}) {
  const modifiers = TRAIT_MODIFIERS[country?.trait] ?? DEFAULT_MODIFIERS;
  const sanctions = Number(economy.sanctionSeverity) || 0;
  return {
    ...modifiers,
    exportRevenueRate: modifiers.exportRevenueRate * Math.max(0, 1 - (sanctions * modifiers.sanctionVulnerability)),
  };
}

export function getRecruitmentCostMultiplier(trait) {
  return trait === 'military_tradition' ? 0.5 : 1;
}
