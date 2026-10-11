export const DEFAULT_BUDGET = Object.freeze({
  incomeTaxRate: 0.16,
  vatRate: 0.12,
  healthSpend: 0.045,
  educationSpend: 0.04,
  infrastructureSpend: 0.03,
  defenseSpend: 0.035,
  socialSpend: 0.055,
  securitySpend: 0.025,
  debtService: 0.015,
});

const TAX_MINIMUM = 0;
const TAX_MAXIMUM = 0.6;
const SPENDING_MINIMUM = 0;
const SPENDING_MAXIMUM = 0.15;

export const BUDGET_LIMITS = Object.freeze({
  incomeTaxRate: Object.freeze({ minimum: TAX_MINIMUM, maximum: TAX_MAXIMUM }),
  vatRate: Object.freeze({ minimum: TAX_MINIMUM, maximum: TAX_MAXIMUM }),
  healthSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
  educationSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
  infrastructureSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
  defenseSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampTaxRate(rate) {
  const number = Number(rate);
  return clamp(Number.isFinite(number) ? number : TAX_MINIMUM, TAX_MINIMUM, TAX_MAXIMUM);
}

export function clampBudgetRate(key, value) {
  const limits = BUDGET_LIMITS[key];
  if (!limits) return null;
  const number = Number(value);
  return clamp(Number.isFinite(number) ? number : limits.minimum, limits.minimum, limits.maximum);
}

export function setBudgetRate(budget, key, value) {
  const rate = clampBudgetRate(key, value);
  return rate === null ? budget : { ...budget, [key]: rate };
}

function normalizedRate(value) {
  return Math.max(0, Number(value) || 0);
}

export function projectBudget(economy, budget, modifiers = {}) {
  const monthlyGdp = economy.gdp / 12;
  const incomeTaxRate = clampTaxRate(budget.incomeTaxRate);
  const vatRate = clampTaxRate(budget.vatRate);
  const incomeTax = monthlyGdp * 0.52 * incomeTaxRate * 0.88;
  const vat = monthlyGdp * 0.64 * vatRate * 0.9;
  const tradeRevenue = monthlyGdp * Math.max(0, Number(modifiers.tradeRevenueRate) || 0);
  const infrastructureCostMultiplier = clamp(
    1 + (Number(modifiers.infrastructureCostModifier) || 0),
    0.5,
    1.5,
  );
  const spendingRate = [
    normalizedRate(budget.healthSpend),
    normalizedRate(budget.educationSpend),
    normalizedRate(budget.infrastructureSpend) * infrastructureCostMultiplier,
    normalizedRate(budget.defenseSpend),
    normalizedRate(budget.socialSpend),
    normalizedRate(budget.securitySpend),
    normalizedRate(budget.debtService),
  ].reduce((total, rate) => total + rate, 0);
  const expenses = monthlyGdp * spendingRate;
  const revenue = incomeTax + vat + tradeRevenue;

  return {
    monthlyGdp,
    incomeTax,
    vat,
    tradeRevenue,
    revenue,
    expenses,
    monthlyBalance: revenue - expenses,
  };
}

export function advanceEconomy(economy, budget, lawEffects = {}, modifiers = {}) {
  const projection = projectBudget(economy, budget, modifiers);
  const totalTaxRate = clampTaxRate(budget.incomeTaxRate) + clampTaxRate(budget.vatRate);
  const deficitPressure = -projection.monthlyBalance / projection.monthlyGdp;
  const taxPressure = Math.max(0, totalTaxRate - 0.3);
  const healthEffect = Math.max(0, normalizedRate(budget.healthSpend) - 0.03);
  const educationEffect = Math.max(0, normalizedRate(budget.educationSpend) - 0.025);
  const infrastructureEffect = Math.max(0, normalizedRate(budget.infrastructureSpend) - 0.02);
  const growthRate = clamp(
    0.0025
      - (taxPressure * 0.006)
      - (economy.inflation * 0.004)
      + (educationEffect * 0.02)
      + (infrastructureEffect * 0.03)
      + (lawEffects.growthModifier ?? 0)
      + (modifiers.growthModifier ?? 0),
    -0.02,
    0.02,
  );
  const inflation = clamp(
    economy.inflation
      + (deficitPressure * 0.012)
      - 0.0008
      - (healthEffect * 0.01)
      + (lawEffects.inflationModifier ?? 0)
      + (modifiers.inflationModifier ?? 0),
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
      - (taxPressure * 5)
      + (lawEffects.popularityModifier ?? 0)
      + (modifiers.popularityModifier ?? 0),
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
