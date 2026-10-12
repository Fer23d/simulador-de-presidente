const MINISTER_DEFINITIONS = Object.freeze({
  economy: Object.freeze({ id: 'economy', title: 'Ministro da Economia', cost: 4_000_000_000, description: '+5% de arrecadacao mensal.', taxRevenueModifier: 0.05 }),
  defense: Object.freeze({ id: 'defense', title: 'Ministro da Defesa', cost: 5_000_000_000, description: '+20% de capacidade de recrutamento.', recruitmentMultiplier: 1.2 }),
});

export const MINISTERS = Object.freeze(Object.values(MINISTER_DEFINITIONS));

export function createMinisters() {
  return { economy: null, defense: null };
}

export function getMinisterModifiers(ministers = {}) {
  return Object.values(ministers).filter(Boolean).reduce((modifiers, minister) => {
    const definition = MINISTER_DEFINITIONS[minister.id];
    return {
      taxRevenueModifier: modifiers.taxRevenueModifier + (definition?.taxRevenueModifier ?? 0),
      recruitmentMultiplier: modifiers.recruitmentMultiplier * (definition?.recruitmentMultiplier ?? 1),
    };
  }, { taxRevenueModifier: 0, recruitmentMultiplier: 1 });
}

export function hireMinister(ministers, economy, ministerId) {
  const definition = MINISTER_DEFINITIONS[ministerId];
  if (!definition) return { ok: false, reason: 'Ministro nao encontrado.', ministers, economy };
  if (ministers?.[ministerId]) return { ok: false, reason: 'Este ministro ja esta no gabinete.', ministers, economy };
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
  if (!definition || !ministers?.[ministerId]) return { ok: false, reason: 'Nao ha ministro ativo nesta pasta.', ministers, economy };
  return {
    ok: true,
    reason: `${definition.title} foi demitido; a opiniao publica reagiu positivamente.`,
    ministers: { ...createMinisters(), ...ministers, [ministerId]: null },
    economy: (() => {
      const { popularity: _legacyPopularity, ...cleanEconomy } = economy;
      return cleanEconomy;
    })(),
  };
}
