const CONSTITUTIONS = new Set(['stratocratic', 'technocratic', 'theocratic']);

function cloneWithout(object, keys) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([key]) => !keys.includes(key)));
}

export function canPromulgarConstituicao(state) {
  return !state.regime?.constitution
    && (Number(state.factions?.militares) >= 100 || Number(state.factions?.elite) >= 100);
}

export function promulgarConstituicao(state, pillar) {
  if (!CONSTITUTIONS.has(pillar)) return { ...state, notice: 'Pilar constitucional invalido.' };
  if (!canPromulgarConstituicao(state)) return { ...state, notice: 'A Constituicao exige elite ou militares com apoio total.' };

  if (pillar === 'stratocratic') {
    return {
      ...state,
      regime: {
        ...state.regime,
        type: 'stratocratic_state',
        constitution: pillar,
        stratocraticInflationFloor: Math.min(0.8, (Number(state.economy.inflation) || 0) * 2),
      },
      notice: 'Nova Constituicao promulgada: Estado Estratocratico.',
    };
  }
  if (pillar === 'technocratic') {
    return { ...state, regime: { ...state.regime, type: 'technocratic_state', constitution: pillar }, notice: 'Nova Constituicao promulgada: Tecnocracia Absoluta.' };
  }
  return {
    ...state,
    regime: { ...state.regime, type: 'theocratic_state', constitution: pillar, stabilityLocked: true },
    factions: cloneWithout(state.factions, ['elite', 'trabalhadores']),
    notice: 'Nova Constituicao promulgada: Estado Teocratico.',
  };
}

/** Applies permanent constitutional rules after the normal monthly systems resolve. */
export function aplicarModificadoresConstitucionais(state, monthly = {}) {
  const constitution = state.regime?.constitution;
  let economy = monthly.economy ?? state.economy;
  let military = monthly.military ?? state.military;
  let factions = monthly.factions ?? state.factions;
  let technology = monthly.technology ?? state.technology;

  if (constitution === 'stratocratic') {
    const armedPopulation = Math.floor((Number(state.country?.populacao_base) || 0) * 0.1);
    military = {
      ...military,
      exercito: { ...military.exercito, soldados: Math.max(Number(military.exercito?.soldados) || 0, armedPopulation) },
    };
    economy = { ...economy, inflation: Math.max(Number(economy.inflation) || 0, Number(state.regime.stratocraticInflationFloor) || 0) };
  }

  if (constitution === 'technocratic') {
    const revenueCut = Math.max(0, Number(economy.revenue) || 0) * 0.3;
    const revenue = Math.max(0, (Number(economy.revenue) || 0) - revenueCut);
    economy = {
      ...economy,
      revenue,
      monthlyBalance: revenue - (Number(economy.expenses) || 0),
      cash: (Number(economy.cash) || 0) - revenueCut,
    };
    factions = Object.fromEntries(Object.entries(factions ?? {}).map(([key, value]) => [key, Math.max(50, Number(value) || 0)]));
  }

  if (constitution === 'theocratic') {
    factions = cloneWithout(factions, ['elite', 'trabalhadores']);
    technology = { ...technology, generated: 0 };
  }

  return { ...monthly, economy, military, factions, technology };
}

