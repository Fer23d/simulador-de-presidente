const FACTION_KEYS = Object.freeze(['elite', 'trabalhadores', 'militares', 'religiosos']);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createFactions() {
  return { elite: 50, trabalhadores: 50, militares: 50, religiosos: 50 };
}

export function normalizeFactions(factions = {}) {
  return Object.fromEntries(FACTION_KEYS.map((key) => [key, clamp(Number(factions[key]) || 0, 0, 100)]));
}

export function getFactionSupport(factions, { includePurged = false } = {}) {
  const normalized = normalizeFactions(factions);
  const active = includePurged || !normalized.elite ? FACTION_KEYS.filter((key) => key !== 'elite') : FACTION_KEYS;
  return active.reduce((total, key) => total + normalized[key], 0) / active.length;
}

export function getFactionModifiers(factions) {
  const normalized = normalizeFactions(factions);
  return {
    growthModifier: normalized.elite > 0 && normalized.elite < 20 ? -0.012 : 0,
    militaryCoup: normalized.militares < 20,
  };
}

export function adjustFactions(factions, changes = {}) {
  const normalized = normalizeFactions(factions);
  return Object.fromEntries(FACTION_KEYS.map((key) => [key, clamp(normalized[key] + (Number(changes[key]) || 0), 0, 100)]));
}

export function advanceFactions(factions, beforeEconomy, economy, budget, effects = {}, modifiers = {}) {
  const normalized = normalizeFactions(factions);
  const totalTax = (Number(budget.incomeTaxRate) || 0) + (Number(budget.vatRate) || 0);
  const growth = ((Number(economy.gdp) || 0) / Math.max(1, Number(beforeEconomy.gdp) || 1)) - 1;
  const legacyOpinion = (Number(effects.popularityModifier) || 0) + (Number(modifiers.popularityModifier) || 0);
  return adjustFactions(normalized, {
    elite: (growth * 160) - (Math.max(0, totalTax - 0.3) * 22) + (legacyOpinion * 0.25),
    trabalhadores: (growth * 80) - ((Number(economy.inflation) || 0) * 9) - ((Number(economy.unemployment) || 0) * 7) + ((Number(budget.socialSpend) || 0) * 20) + (legacyOpinion * 0.65),
    militares: ((Number(budget.defenseSpend) || 0) * 22) + (Number(effects.militarySupportModifier) || 0) + (legacyOpinion * 0.15),
    religiosos: ((Number(budget.securitySpend) || 0) * 14) + ((Number(budget.socialSpend) || 0) * 8) + (legacyOpinion * 0.35),
  });
}
