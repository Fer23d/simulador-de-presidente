export const SLUSH_FUND_ESCAPE_THRESHOLD = 50_000_000_000;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function isEscapeEligible(state) {
  return (Number(state.slush_fund) || 0) >= SLUSH_FUND_ESCAPE_THRESHOLD;
}

export function desviarFundos(state) {
  const cash = Math.max(0, Number(state.economy?.cash) || 0);
  const diverted = Math.floor(cash * 0.05);
  if (diverted < 1) return { ...state, notice: 'Caixa insuficiente para desviar fundos.' };

  const transfers = Math.max(0, Math.floor(Number(state.slushFundTransfersThisMonth) || 0));
  const factions = transfers < 1
    ? state.factions
    : Object.fromEntries(Object.entries(state.factions ?? {}).map(([key, value]) => [key, clamp((Number(value) || 0) - 2, 0, 100)]));

  return {
    ...state,
    economy: { ...state.economy, cash: cash - diverted },
    slush_fund: Math.max(0, Number(state.slush_fund) || 0) + diverted,
    slushFundTransfersThisMonth: transfers + 1,
    factions,
    notice: transfers < 1
      ? 'Fundos desviados para a conta offshore.'
      : 'Fundos desviados. A estabilidade interna foi comprometida.',
  };
}

export function interceptarFinalCaixa2(state) {
  if (!state.regime?.gameOver || !isEscapeEligible(state)) return state;
  return {
    ...state,
    pendingFinalDilemma: false,
    escape_ending_triggered: true,
    regime: { ...state.regime, gameOver: true, outcome: 'fuga-offshore' },
    notice: 'O pais caiu, mas o helicoptero privado decolou rumo a conta offshore.',
  };
}
