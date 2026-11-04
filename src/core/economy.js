export const DEFAULT_BUDGET = Object.freeze({
  incomeTaxRate: 0.16,
  vatRate: 0.12,
  healthSpend: 0.045,
  educationSpend: 0.04,
  infrastructureSpend: 0.03,
  scienceSpend: 0.02,
  defenseSpend: 0.035,
  socialSpend: 0.055,
  securitySpend: 0.025,
  debtService: 0.015,
  // Taxa básica de juros do banco central: alavanca contra a inflacao (juros altos esfriam preços e o crescimento).
  interestRate: 0.1,
});

export const INFLATION_HISTORY_LIMIT = 60;
export const NEUTRAL_INTEREST_RATE = 0.1;

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
  scienceSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
  defenseSpend: Object.freeze({ minimum: SPENDING_MINIMUM, maximum: SPENDING_MAXIMUM }),
  interestRate: Object.freeze({ minimum: 0, maximum: 0.3 }),
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

// Juros efetivos da política monetaria (0 a 30%) e o custo mensal do rombo fiscal escondido (desvios).
function effectiveInterest(budget) {
  const rate = Number(budget.interestRate);
  return clamp(Number.isFinite(rate) ? rate : NEUTRAL_INTEREST_RATE, 0, 0.3);
}

export const FISCAL_HOLE_MONTHLY_COST = 0.015;
export const FISCAL_HOLE_MONTHLY_DECAY = 0.02;

export function fiscalHoleCost(economy, budget) {
  const hole = Math.max(0, Number(economy.fiscalHole) || 0);
  return hole * (FISCAL_HOLE_MONTHLY_COST + effectiveInterest(budget) / 12);
}

export function projectBudget(economy, budget, modifiers = {}) {
  const monthlyGdp = economy.gdp / 12;
  const interest = effectiveInterest(budget);
  const incomeTaxRate = clampTaxRate(budget.incomeTaxRate);
  const vatRate = clampTaxRate(budget.vatRate);
  // Juros altos encarecem o credito e encolhem a base tributável; juros baixos a ampliam um pouco.
  const interestDrag = 1 - ((interest - NEUTRAL_INTEREST_RATE) * 0.35);
  const taxRevenueMultiplier = Math.max(0, (1 + (Number(modifiers.taxRevenueModifier) || 0)) * interestDrag);
  const incomeTax = monthlyGdp * 0.52 * incomeTaxRate * 0.88 * taxRevenueMultiplier;
  const vat = monthlyGdp * 0.64 * vatRate * 0.9 * taxRevenueMultiplier;
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
    normalizedRate(budget.scienceSpend),
    normalizedRate(budget.defenseSpend),
    normalizedRate(budget.socialSpend),
    normalizedRate(budget.securitySpend),
    // O serviço da divida acompanha os juros: com a taxa básica em 20% ele custa o dobro.
    normalizedRate(budget.debtService) * (interest / NEUTRAL_INTEREST_RATE),
  ].reduce((total, rate) => total + rate, 0);
  const holeCost = fiscalHoleCost(economy, budget);
  const expenses = (monthlyGdp * spendingRate) + holeCost;
  const cashRevenueMultiplier = Math.max(0, 1 + (Number(modifiers.cashRevenueModifier) || 0));
  const revenue = (incomeTax + vat + tradeRevenue) * cashRevenueMultiplier;

  return {
    monthlyGdp,
    incomeTax,
    vat,
    tradeRevenue,
    revenue,
    expenses,
    fiscalHoleCost: holeCost,
    monthlyBalance: revenue - expenses,
  };
}

export function normalizeInflationHistory(history, fallback = 0) {
  const points = Array.isArray(history) ? history.map(Number).filter(Number.isFinite).map((value) => clamp(value, 0, 0.8)) : [];
  if (!points.length) points.push(clamp(Number(fallback) || 0, 0, 0.8));
  return points.slice(-INFLATION_HISTORY_LIMIT);
}

// Resumo da inflação para o painel: nivel, tendência dos últimos 3 meses e maior pico registrado.
export function summarizeInflation(economy) {
  const history = normalizeInflationHistory(economy.inflationHistory, economy.inflation);
  const current = clamp(Number(economy.inflation) || 0, 0, 0.8);
  const reference = history[Math.max(0, history.length - 4)];
  const delta = current - reference;
  const trend = delta > 0.002 ? 'up' : delta < -0.002 ? 'down' : 'stable';
  const level = current >= 0.2 ? 'hyper' : current >= 0.08 ? 'high' : current <= 0.02 ? 'low' : 'healthy';
  return { current, trend, level, peak: Math.max(...history, current), history };
}

export function advanceEconomy(economy, budget, lawEffects = {}, modifiers = {}) {
  const { popularity: _legacyPopularity, ...currentEconomy } = economy;
  const projection = projectBudget(economy, budget, { ...modifiers, taxRevenueModifier: lawEffects.taxRevenueModifier });
  const totalTaxRate = clampTaxRate(budget.incomeTaxRate) + clampTaxRate(budget.vatRate);
  const deficitPressure = -projection.monthlyBalance / projection.monthlyGdp;
  const taxPressure = Math.max(0, totalTaxRate - 0.3);
  const healthEffect = Math.max(0, normalizedRate(budget.healthSpend) - 0.03);
  const educationEffect = Math.max(0, normalizedRate(budget.educationSpend) - 0.025);
  const infrastructureEffect = Math.max(0, normalizedRate(budget.infrastructureSpend) - 0.02);
  const interestGap = clamp(Number.isFinite(Number(budget.interestRate)) ? Number(budget.interestRate) : NEUTRAL_INTEREST_RATE, 0, 0.3) - NEUTRAL_INTEREST_RATE;
  const growthRate = clamp(
    0.0025
      - (taxPressure * 0.006)
      - (interestGap * 0.012)
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
      - (interestGap * 0.012)
      - (taxPressure * 0.004)
      + Math.min(0.012, (Math.max(0, Number(economy.fiscalHole) || 0) / Math.max(1, economy.gdp)) * 0.6)
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
  return {
    ...currentEconomy,
    gdp: Math.round(economy.gdp * (1 + growthRate)),
    inflation,
    fiscalHole: Math.max(0, Number(economy.fiscalHole) || 0) * (1 - FISCAL_HOLE_MONTHLY_DECAY),
    inflationHistory: [...normalizeInflationHistory(economy.inflationHistory, economy.inflation), inflation].slice(-INFLATION_HISTORY_LIMIT),
    unemployment,
    cash: economy.cash + projection.monthlyBalance + (lawEffects.cashModifier ?? 0),
    ...projection,
  };
}
