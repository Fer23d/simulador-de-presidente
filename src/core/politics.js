export const AUTO_COUP_COST = 500_000_000_000;

function reject(state, notice) {
  return { ...state, notice };
}

export function canExecuteAutoCoup(state) {
  return !state.regime?.gameOver
    && state.government === 'republic'
    && (Number(state.economy?.cash) || 0) >= AUTO_COUP_COST;
}

export function openAutoCoup(state) {
  if (!canExecuteAutoCoup(state)) return reject(state, 'O Auto-Golpe exige uma Republica estavel e R$ 500 bi em caixa.');
  return { ...state, pendingGovernmentChoice: true, notice: 'Escolha quem governara depois do Auto-Golpe.' };
}

export function resolveAutoCoup(state, government) {
  if (!state.pendingGovernmentChoice) return reject(state, 'Nenhum Auto-Golpe aguarda decisao.');
  if (!['empire', 'corporate'].includes(government)) return reject(state, 'Regime de destino invalido.');
  const cash = (Number(state.economy?.cash) || 0) - AUTO_COUP_COST;
  const base = {
    ...state,
    pendingGovernmentChoice: false,
    government,
    economy: { ...state.economy, cash },
    title: government === 'empire' ? 'Imperador Supremo' : 'CEO Estatal',
    regime: {
      ...state.regime,
      type: government,
      electionsSuspended: government === 'empire',
      coupRisk: 0,
      revolutionRisk: government === 'empire' ? 0.02 : state.regime.revolutionRisk,
    },
    notice: government === 'empire'
      ? 'Auto-Golpe concluido: nasceu o Imperio Nacional.'
      : 'Auto-Golpe concluido: o Estado agora responde ao CEO Estatal.',
  };
  if (government === 'empire') {
    return {
      ...base,
      military: { ...state.military, combatAdjustment: (Number(state.military?.combatAdjustment) || 0) + 25, readiness: 1.35 },
    };
  }
  return base;
}

export function advanceGovernment(state) {
  if (state.government === 'empire') {
    return {
      ...state,
      military: { ...state.military, combatAdjustment: (Number(state.military?.combatAdjustment) || 0) + 3 },
      geopolitics: {
        ...state.geopolitics,
        contacts: (state.geopolitics?.contacts ?? []).map((contact) => ({
          ...contact,
          relation: Math.max(-100, (Number(contact.relation) || 0) - 10),
        })),
      },
    };
  }
  return state;
}

export function applyGovernmentEconomy(state, modifiers = {}) {
  if (state.government !== 'corporate') return modifiers;
  return { ...modifiers, taxRevenueModifier: (Number(modifiers.taxRevenueModifier) || 0) + 1 };
}

export function resolveCorporateDefault(state) {
  if (state.government !== 'corporate' || (Number(state.economy?.cash) || 0) >= 0 || state.regime?.gameOver) return state;
  return {
    ...state,
    regime: { ...state.regime, gameOver: true, outcome: 'aquisicao-hostil', electionsSuspended: true },
    notice: 'Aquisicao hostil: o caixa corporativo negativo comprou o governo inteiro.',
  };
}
