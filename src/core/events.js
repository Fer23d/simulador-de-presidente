export const EVENTS = Object.freeze([
  Object.freeze({
    id: 'corruption-scandal',
    title: 'Escandalo de Corrupcao',
    description: 'Documentos ligam membros do governo a contratos suspeitos.',
    options: Object.freeze([
      Object.freeze({ id: 'protect', label: 'Proteger ministro', effects: { cash: -2_000_000_000, popularity: -3, onu: -2 } }),
      Object.freeze({ id: 'investigate', label: 'Prender ministro', effects: { popularity: 2, cash: -500_000_000 } }),
    ]),
  }),
  Object.freeze({
    id: 'severe-drought',
    title: 'Seca Severa',
    description: 'A quebra de safra pressiona alimentos e produtores rurais.',
    options: Object.freeze([
      Object.freeze({ id: 'emergency-aid', label: 'Liberar ajuda emergencial', effects: { cash: -4_000_000_000, popularity: 2, inflation: -0.006 } }),
      Object.freeze({ id: 'market-response', label: 'Deixar o mercado reagir', effects: { inflation: 0.012, popularity: -2 } }),
    ]),
  }),
  Object.freeze({
    id: 'energy-strike',
    title: 'Greve no Setor de Energia',
    description: 'O abastecimento nacional pode sofrer interrupcoes.',
    options: Object.freeze([
      Object.freeze({ id: 'negotiate-unions', label: 'Negociar com sindicatos', effects: { cash: -1_500_000_000, popularity: 1 } }),
      Object.freeze({ id: 'enforce-operation', label: 'Forcar operacao', effects: { popularity: -3, onu: -1 } }),
    ]),
  }),
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nextRandom(seed) {
  const nextSeed = (Math.imul(Number(seed) >>> 0, 1664525) + 1013904223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 4_294_967_296 };
}

export function rollMonthlyEvent(seed, probability = 0.1) {
  const first = nextRandom(seed);
  if (first.value >= probability) return { event: null, seed: first.seed };
  const pick = nextRandom(first.seed);
  return { event: EVENTS[Math.floor(pick.value * EVENTS.length)], seed: pick.seed };
}

export function applyEventOption(state, optionId) {
  const event = state.pendingEvent;
  const option = event?.options?.find((candidate) => candidate.id === optionId);
  if (!option) return { ...state, notice: 'Opcao de crise invalida.' };
  const effects = option.effects ?? {};
  const onuScore = clamp((Number(state.geopolitics.onuScore) || 0) + (Number(effects.onu) || 0), 0, 100);
  return {
    ...state,
    economy: {
      ...state.economy,
      cash: state.economy.cash + (Number(effects.cash) || 0),
      popularity: clamp(state.economy.popularity + (Number(effects.popularity) || 0), 0, 100),
      inflation: clamp(state.economy.inflation + (Number(effects.inflation) || 0), 0, 0.8),
      unemployment: clamp(state.economy.unemployment + (Number(effects.unemployment) || 0), 0.02, 0.45),
    },
    geopolitics: {
      ...state.geopolitics,
      onuScore,
      internationalSanctions: onuScore < 25,
    },
    pendingEvent: null,
    notice: `${option.label}: resposta a ${event.title} concluida.`,
  };
}
