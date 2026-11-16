const MINISTER_DEFINITIONS = Object.freeze({
  economy: Object.freeze({ id: 'economy', title: 'Ministro da Economia', cost: 4_000_000_000, description: '+5% de arrecadação mensal.', taxRevenueModifier: 0.05 }),
  defense: Object.freeze({ id: 'defense', title: 'Ministro da Defesa', cost: 5_000_000_000, description: '+20% de capacidade de recrutamento.', recruitmentMultiplier: 1.2 }),
  foreign: Object.freeze({ id: 'foreign', title: 'Ministro das Relações Exteriores', cost: 4_000_000_000, description: '+6% de chance de fechar pactos de não agressão.', pactBonus: 0.06 }),
  intelligence: Object.freeze({ id: 'intelligence', title: 'Ministro da Inteligência', cost: 5_000_000_000, description: 'Reduz em 30% o risco de seus espiões serem descobertos.', spyRisk: 0.7 }),
  health: Object.freeze({ id: 'health', title: 'Ministro da Saúde', cost: 3_500_000_000, description: 'Reduz a tensão social em 0,6 ponto por mês.', monthly: Object.freeze({ unrest: -0.6 }) }),
  education: Object.freeze({ id: 'education', title: 'Ministro da Educação', cost: 4_500_000_000, description: 'O PIB cresce 0,03% a mais por mês.', monthly: Object.freeze({ gdpGrowth: 0.0003 }) }),
  agriculture: Object.freeze({ id: 'agriculture', title: 'Ministro da Agricultura', cost: 3_500_000_000, description: 'A inflação cai 0,03 ponto por mês (até 0,5%).', monthly: Object.freeze({ inflation: -0.0003 }) }),
  infrastructure: Object.freeze({ id: 'infrastructure', title: 'Ministro da Infraestrutura', cost: 5_000_000_000, description: 'Trabalhadores +0,2 e elite +0,1 de apoio por mês.', monthly: Object.freeze({ trabalhadores: 0.2, elite: 0.1 }) }),
  justice: Object.freeze({ id: 'justice', title: 'Ministro da Justiça', cost: 4_000_000_000, description: 'Reduz o risco de golpe em 0,4 ponto percentual por mês.', monthly: Object.freeze({ coupRisk: -0.004 }) }),
});

export const MINISTERS = Object.freeze(Object.values(MINISTER_DEFINITIONS));

export function createMinisters() {
  return Object.fromEntries(MINISTERS.map((item) => [item.id, null]));
}

// Mantem so os ministros que existem e estao ativos (saves antigos tem apenas economia e defesa).
export function normalizeMinisters(value) {
  const base = createMinisters();
  for (const item of MINISTERS) if (value?.[item.id]?.id === item.id) base[item.id] = { id: item.id };
  return base;
}

export function getMinisterModifiers(ministers = {}) {
  return Object.values(ministers).filter(Boolean).reduce((modifiers, minister) => {
    const definition = MINISTER_DEFINITIONS[minister.id];
    return {
      taxRevenueModifier: modifiers.taxRevenueModifier + (definition?.taxRevenueModifier ?? 0),
      recruitmentMultiplier: modifiers.recruitmentMultiplier * (definition?.recruitmentMultiplier ?? 1),
      pactBonus: modifiers.pactBonus + (definition?.pactBonus ?? 0),
      spyRisk: modifiers.spyRisk * (definition?.spyRisk ?? 1),
    };
  }, { taxRevenueModifier: 0, recruitmentMultiplier: 1, pactBonus: 0, spyRisk: 1 });
}

// Efeitos mensais dos ministerios civis (saude, educacao, agricultura, infraestrutura e justica).
export function processMinisters(state) {
  if (state.regime?.gameOver || state.is_wasteland || state.city || !state.ministers) return state;
  const sum = { unrest: 0, gdpGrowth: 0, inflation: 0, trabalhadores: 0, elite: 0, coupRisk: 0 };
  for (const minister of Object.values(state.ministers).filter(Boolean)) {
    for (const [key, value] of Object.entries(MINISTER_DEFINITIONS[minister.id]?.monthly ?? {})) sum[key] += value;
  }
  if (!Object.values(sum).some(Boolean)) return state;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const economy = state.economy ? { ...state.economy } : state.economy;
  if (economy && sum.gdpGrowth) economy.gdp = (Number(economy.gdp) || 0) * (1 + sum.gdpGrowth);
  if (economy && sum.inflation) economy.inflation = Math.max(Math.min(Number(economy.inflation) || 0, 0.005), (Number(economy.inflation) || 0) + sum.inflation);
  const factions = state.factions && (sum.trabalhadores || sum.elite)
    ? { ...state.factions, trabalhadores: clamp((Number(state.factions.trabalhadores) || 0) + sum.trabalhadores, 0, 100), elite: clamp((Number(state.factions.elite) || 0) + sum.elite, 0, 100) }
    : state.factions;
  const regime = state.regime ? { ...state.regime, unrest: clamp((Number(state.regime.unrest) || 0) + sum.unrest, 0, 100), coupRisk: clamp((Number(state.regime.coupRisk) || 0) + sum.coupRisk, 0, 0.8) } : state.regime;
  return { ...state, economy, factions, regime };
}

export function hireMinister(ministers, economy, ministerId) {
  const definition = MINISTER_DEFINITIONS[ministerId];
  if (!definition) return { ok: false, reason: 'Ministro não encontrado.', ministers, economy };
  if (ministers?.[ministerId]) return { ok: false, reason: 'Este ministro já está no gabinete.', ministers, economy };
  if ((Number(economy?.cash) || 0) < definition.cost) return { ok: false, reason: 'Caixa insuficiente para contratar este ministro.', ministers, economy };
  return {
    ok: true,
    reason: `${definition.title} assumiu o gabinete.`,
    ministers: { ...createMinisters(), ...ministers, [ministerId]: { id: definition.id } },
    economy: { ...economy, cash: economy.cash - definition.cost },
  };
}

export function dismissMinister(ministers, economy, ministerId) {
  const definition = MINISTER_DEFINITIONS[ministerId];
  if (!definition || !ministers?.[ministerId]) return { ok: false, reason: 'Não ha ministro ativo nesta pasta.', ministers, economy };
  return {
    ok: true,
    reason: `${definition.title} foi demitido; a opinião pública reagiu positivamente.`,
    ministers: { ...createMinisters(), ...ministers, [ministerId]: null },
    economy: (() => {
      const { popularity: _legacyPopularity, ...cleanEconomy } = economy;
      return cleanEconomy;
    })(),
  };
}
