// Setores da economia: agro, industria, servicos e energia. O PIB total continua sendo o que o motor ja calculava;
// os setores dividem esse crescimento entre ganhadores e perdedores conforme as decisoes do orcamento.
export const SECTOR_IDS = Object.freeze(['agro', 'industry', 'services', 'energy']);

export const SECTOR_DEFS = Object.freeze({
  agro: Object.freeze({ id: 'agro', label: 'Agropecuária', laborIntensity: 1.7 }),
  industry: Object.freeze({ id: 'industry', label: 'Indústria', laborIntensity: 1.0 }),
  services: Object.freeze({ id: 'services', label: 'Serviços', laborIntensity: 1.0 }),
  energy: Object.freeze({ id: 'energy', label: 'Energia', laborIntensity: 0.4 }),
});

const BASE_SHARES = Object.freeze({ agro: 0.1, industry: 0.22, services: 0.58, energy: 0.1 });

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeShares(shares) {
  const total = SECTOR_IDS.reduce((sum, id) => sum + shares[id], 0) || 1;
  return Object.fromEntries(SECTOR_IDS.map((id) => [id, shares[id] / total]));
}

// A mistura inicial varia por pais (semente) para economias diferentes terem forcas e fraquezas diferentes.
export function createSectors(seed = 1) {
  const jitter = (index, spread) => (((Math.imul((seed >>> 0) + 17, index + 31) >>> 0) % 1000) / 1000 - 0.5) * spread;
  const shares = normalizeShares({
    agro: clamp(BASE_SHARES.agro + jitter(1, 0.14), 0.03, 0.3),
    industry: clamp(BASE_SHARES.industry + jitter(2, 0.14), 0.08, 0.4),
    services: clamp(BASE_SHARES.services + jitter(3, 0.2), 0.3, 0.75),
    energy: clamp(BASE_SHARES.energy + jitter(4, 0.1), 0.04, 0.2),
  });
  return Object.fromEntries(SECTOR_IDS.map((id) => [id, { share: shares[id], growth: 0 }]));
}

export function normalizeSectors(value, seed = 1) {
  const fallback = createSectors(seed);
  if (!value || typeof value !== 'object') return fallback;
  const shares = {};
  for (const id of SECTOR_IDS) {
    const share = Number(value[id]?.share);
    shares[id] = Number.isFinite(share) && share > 0 ? share : fallback[id].share;
  }
  const normalized = normalizeShares(shares);
  return Object.fromEntries(SECTOR_IDS.map((id) => [id, {
    share: normalized[id],
    growth: clamp(Number(value[id]?.growth) || 0, -0.05, 0.05),
  }]));
}

// Participacao de cada setor no emprego (setores que empregam mais pesam mais no desemprego).
export function getEmploymentShares(sectors) {
  const weights = SECTOR_IDS.map((id) => (sectors[id]?.share ?? 0) * SECTOR_DEFS[id].laborIntensity);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return Object.fromEntries(SECTOR_IDS.map((id, index) => [id, weights[index] / total]));
}

/**
 * Avanca um mes. `growthRate` e o crescimento do PIB total; `drivers` traz o que favorece cada setor:
 * { infrastructure, education, science, interestGap, taxPressure, inflation }.
 * Os ajustes tem media ponderada zero: o PIB total nao muda, so a divisao entre setores.
 */
export function advanceSectors(sectors, growthRate, drivers = {}) {
  const current = normalizeSectors(sectors);
  const infrastructure = Number(drivers.infrastructure) || 0;
  const education = Number(drivers.education) || 0;
  const science = Number(drivers.science) || 0;
  const interestGap = Number(drivers.interestGap) || 0;
  const taxPressure = Number(drivers.taxPressure) || 0;
  const inflation = Number(drivers.inflation) || 0;
  const raw = {
    agro: -(inflation - 0.05) * 0.012 - (taxPressure * 0.004) + (infrastructure * 0.01),
    industry: (infrastructure * 0.05) + (science * 0.02) - (interestGap * 0.018) - (taxPressure * 0.006),
    services: (education * 0.035) + (science * 0.015) - (taxPressure * 0.003) - (Math.max(0, inflation - 0.08) * 0.01),
    energy: (infrastructure * 0.04) + (science * 0.01) - (interestGap * 0.006),
  };
  const mean = SECTOR_IDS.reduce((sum, id) => sum + (current[id].share * raw[id]), 0);
  const growth = Object.fromEntries(SECTOR_IDS.map((id) => [id, clamp(growthRate + raw[id] - mean, -0.05, 0.05)]));
  const grown = Object.fromEntries(SECTOR_IDS.map((id) => [id, current[id].share * (1 + growth[id])]));
  const shares = normalizeShares(grown);
  const next = Object.fromEntries(SECTOR_IDS.map((id) => [id, { share: shares[id], growth: growth[id] }]));
  const employment = getEmploymentShares(current);
  const employmentGrowth = SECTOR_IDS.reduce((sum, id) => sum + (employment[id] * growth[id]), 0);
  return { sectors: next, employmentGrowth };
}
