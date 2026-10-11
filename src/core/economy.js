export const DEFAULT_BUDGET = Object.freeze({
  incomeTaxRate: 0.16,
  vatRate: 0.12,
  healthSpend: 0.045,
  educationSpend: 0.04,
  infrastructureSpend: 0.03,
  socialSpend: 0.055,
  securitySpend: 0.025,
  debtService: 0.015,
});

const TAX_MINIMUM = 0;
const TAX_MAXIMUM = 0.6;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampTaxRate(rate) {
  const number = Number(rate);
  return clamp(Number.isFinite(number) ? number : TAX_MINIMUM, TAX_MINIMUM, TAX_MAXIMUM);
}

export function projectBudget(economy, budget) {
  const monthlyGdp = economy.gdp / 12;
  const incomeTaxRate = clampTaxRate(budget.incomeTaxRate);
  const vatRate = clampTaxRate(budget.vatRate);
  const incomeTax = monthlyGdp * 0.52 * incomeTaxRate * 0.88;
  const vat = monthlyGdp * 0.64 * vatRate * 0.9;
  const spendingRate = [
    budget.healthSpend,
    budget.educationSpend,
    budget.infrastructureSpend,
    budget.socialSpend,
    budget.securitySpend,
    budget.debtService,
  ].reduce((total, rate) => total + Math.max(0, Number(rate) || 0), 0);
  const expenses = monthlyGdp * spendingRate;
  const revenue = incomeTax + vat;

  return {
    monthlyGdp,
    incomeTax,
    vat,
    revenue,
    expenses,
    monthlyBalance: revenue - expenses,
  };
}

export function advanceEconomy(economy, budget, lawEffects = {}) {
  const projection = projectBudget(economy, budget);
  const totalTaxRate = clampTaxRate(budget.incomeTaxRate) + clampTaxRate(budget.vatRate);
  const deficitPressure = -projection.monthlyBalance / projection.monthlyGdp;
  const growthRate = clamp(
    0.0025
      - (Math.max(0, totalTaxRate - 0.3) * 0.006)
      - (economy.inflation * 0.004)
      + (lawEffects.growthModifier ?? 0),
    -0.02,
    0.02,
  );
  const inflation = clamp(
    economy.inflation + (deficitPressure * 0.012) - 0.0008 + (lawEffects.inflationModifier ?? 0),
    0,
    0.8,
  );
  const unemployment = clamp(
    economy.unemployment
      - (growthRate * 0.45)
      + (Math.max(0, totalTaxRate - 0.35) * 0.004)
      + (lawEffects.unemploymentModifier ?? 0),
    0.02,
    0.45,
  );
  const popularity = clamp(
    economy.popularity
      + (projection.monthlyBalance >= 0 ? 0.25 : -0.25)
      - (inflation * 0.45)
      - (unemployment * 0.2)
      + (lawEffects.popularityModifier ?? 0),
    0,
    100,
  );

  return {
    ...economy,
    gdp: Math.round(economy.gdp * (1 + growthRate)),
    inflation,
    unemployment,
    popularity,
    cash: economy.cash + projection.monthlyBalance,
    ...projection,
  };
}
