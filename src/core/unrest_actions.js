// Respostas do presidente a protestos e crise politica (tensao social em regime.unrest).
import { adjustFactions } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// Meses entre usos da mesma acao e quanto cada uma custa/rende.
export const UNREST_ACTIONS = Object.freeze({
  subsidy: Object.freeze({
    id: 'subsidy', label: 'Subsídio emergencial', cooldown: 2, minimum: 0,
    detail: 'Custa 2% do PIB mensal. Alivia a tensão e agrada aos trabalhadores, mas pressiona os preços.',
  }),
  dialogue: Object.freeze({
    id: 'dialogue', label: 'Diálogo com os sindicatos', cooldown: 3, minimum: 15,
    detail: 'Sem custo em caixa. Reduz a tensão com um pouco de desgaste na elite.',
  }),
  repression: Object.freeze({
    id: 'repression', label: 'Reprimir protestos', cooldown: 6, minimum: 30,
    detail: 'Derruba a tensão na hora, mas abala a imagem no exterior e deixa uma ressaca nos meses seguintes.',
  }),
});

export const REPRESSION_HANGOVER_MONTHS = 4;
export const REPRESSION_HANGOVER_PRESSURE = 4;

export function getUnrestActionStatus(state, kind) {
  const action = UNREST_ACTIONS[kind];
  if (!action) return { available: false, reason: 'Ação desconhecida.' };
  if (state.regime?.gameOver || state.is_wasteland || state.city) return { available: false, reason: 'Indisponível.' };
  const month = Number(state.monthCounter) || 0;
  const last = Number(state.unrestActionMonths?.[kind]);
  if (Number.isFinite(last) && month - last < action.cooldown) {
    return { available: false, reason: `Disponível em ${action.cooldown - (month - last)} mês(es).` };
  }
  const unrest = Number(state.regime?.unrest) || 0;
  if (unrest < action.minimum) return { available: false, reason: `Só com tensão acima de ${action.minimum}.` };
  return { available: true, reason: '' };
}

export function repressionHangover(state) {
  return (Number(state.repressionUntil) || 0) > (Number(state.monthCounter) || 0) ? REPRESSION_HANGOVER_PRESSURE : 0;
}

export function applyUnrestAction(state, kind) {
  const action = UNREST_ACTIONS[kind];
  const status = getUnrestActionStatus(state, kind);
  if (!action || !status.available) return { ...state, notice: status.reason || 'Ação indisponível.' };
  const month = Number(state.monthCounter) || 0;
  const unrest = Number(state.regime?.unrest) || 0;
  const marks = { ...(state.unrestActionMonths ?? {}), [kind]: month };
  const withRegime = (value) => ({ ...state.regime, unrest: clamp(value, 0, 100) });
  if (kind === 'subsidy') {
    const cost = Math.round(((Number(state.economy.gdp) || 0) / 12) * 0.02);
    return {
      ...state,
      unrestActionMonths: marks,
      economy: { ...state.economy, cash: state.economy.cash - cost, inflation: clamp(state.economy.inflation + 0.002, 0, 0.8) },
      factions: adjustFactions(state.factions, { trabalhadores: 4, elite: -1 }),
      regime: withRegime(unrest - 12),
      notice: 'Subsídio emergencial liberado: a tensão nas ruas diminuiu, e os preços sentem o gasto.',
    };
  }
  if (kind === 'dialogue') {
    return {
      ...state,
      unrestActionMonths: marks,
      factions: adjustFactions(state.factions, { trabalhadores: 3, elite: -3 }),
      regime: withRegime(unrest - 8),
      notice: 'Os sindicatos foram ouvidos: a tensão diminuiu, e a elite reclamou.',
    };
  }
  return {
    ...state,
    unrestActionMonths: marks,
    repressionUntil: month + REPRESSION_HANGOVER_MONTHS,
    factions: adjustFactions(state.factions, { trabalhadores: -8, militares: 4 }),
    geopolitics: state.geopolitics ? { ...state.geopolitics, onuScore: clamp((Number(state.geopolitics.onuScore) || 0) - 8, 0, 100) } : state.geopolitics,
    regime: withRegime(unrest - 30),
    notice: 'Os protestos foram dispersos à força. A calma é só aparente e o exterior condenou a violência.',
  };
}
