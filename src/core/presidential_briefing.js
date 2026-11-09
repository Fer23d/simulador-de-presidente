const MAX_FACTION = 100;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function numberOr(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeEffects(effects = {}) {
  return {
    cash: numberOr(effects.cash),
    inflation: numberOr(effects.inflation),
    unemployment: numberOr(effects.unemployment),
    onu: numberOr(effects.onu),
    legacyScore: numberOr(effects.legacyScore),
    factions: Object.fromEntries(Object.entries(effects.factions ?? {}).filter(([key, value]) => Number.isFinite(Number(value)) && typeof key === 'string')),
  };
}

function hasLowSupport(state, faction) {
  return numberOr(state.factions?.[faction], 50) < 52;
}

export const PRESIDENTIAL_BRIEFINGS = Object.freeze([
  {
    id: 'cost-of-living',
    title: 'O preço da sobrevivência',
    subtitle: 'A inflação chegou ao refeitório e aos bairros mais pobres.',
    description: 'O gabinete traz números que não cabem num gráfico: a comida subiu, os salários perderam força e a rua começou a contar centavos. Uma decisão rápida pode aliviar a pressão — ou apenas empurrá-la para o próximo mês.',
    condition: (state) => numberOr(state.economy?.inflation) >= 0.08,
    options: [
      { id: 'subsidize', label: '[ LIBERAR SUBSÍDIO IMEDIATO ]', detail: 'Custa R$ 2 bi, reduz a inflação e acalma os trabalhadores.', effects: { cash: -2_000_000_000, inflation: -0.01, factions: { trabalhadores: 6, elite: -2 }, legacyScore: 2 } },
      { id: 'market-correction', label: '[ DEIXAR O MERCADO CORRIGIR ]', detail: 'Preserva o caixa, mas transfere o custo para as famílias.', effects: { inflation: 0.012, factions: { trabalhadores: -5, elite: 3 }, legacyScore: -1 } },
    ],
  },
  {
    id: 'congress-pressure',
    title: 'A maioria tem um preço',
    subtitle: 'O Congresso exige uma ponte entre promessa e orçamento.',
    description: 'Deputados de todos os blocos ocupam a antessala do gabinete. Ninguém fala em ideologia; todos falam em cargos, verbas e garantias. A próxima votação será um teste de autoridade, não apenas de matemática.',
    condition: (state) => numberOr(state.congress?.blocs?.reduce((sum, bloc) => sum + numberOr(bloc.support), 0), 0) / Math.max(1, state.congress?.blocs?.length ?? 1) < 0.55 || numberOr(state.factions?.elite, 50) < 50,
    options: [
      { id: 'negotiate', label: '[ NEGOCIAR UM PACTO ]', detail: 'Custa R$ 1 bi e distribui apoio entre as facções.', effects: { cash: -1_000_000_000, factions: { elite: 3, trabalhadores: 3, religiosos: 2 }, legacyScore: 1 } },
      { id: 'confront', label: '[ ENFRENTAR O CONGRESSO ]', detail: 'Preserva o caixa, mas transforma a votação numa batalha pública.', effects: { onu: -1, factions: { militares: 5, trabalhadores: -4 }, legacyScore: 1 } },
    ],
  },
  {
    id: 'generals-demand',
    title: 'A sala dos generais',
    subtitle: 'A cadeia de comando quer saber quem realmente governa.',
    description: 'O chefe do Estado-Maior não ameaça um golpe. Ainda. Ele apresenta relatórios de fronteira, mapas de risco e uma frase curta: sem recursos, a lealdade do quartel vira uma hipótese.',
    condition: (state) => hasLowSupport(state, 'militares'),
    options: [
      { id: 'invest-defense', label: '[ REFORÇAR A DEFESA ]', detail: 'Custa R$ 3 bi e recupera o apoio militar.', effects: { cash: -3_000_000_000, factions: { militares: 8, elite: 2 }, legacyScore: 1 } },
      { id: 'civilian-control', label: '[ REAFIRMAR O CONTROLE CIVIL ]', detail: 'Aumenta a reputação democrática, mas irrita os quartéis.', effects: { onu: 3, factions: { militares: -6, trabalhadores: 4 }, legacyScore: 3 } },
    ],
  },
  {
    id: 'public-mandate',
    title: 'A promessa do mês',
    subtitle: 'O país quer uma direção antes que os números escolham por você.',
    description: 'O rádio transmite discursos contraditórios, os jornais disputam a narrativa e cada setor da sociedade espera uma prova de que o seu governo ainda tem um plano. A decisão será registrada muito depois de os números desaparecerem.',
    condition: () => true,
    options: [
      { id: 'public-works', label: '[ LANÇAR UM PLANO DE OBRAS ]', detail: 'Custa R$ 2 bi, cria crescimento e fortalece os trabalhadores.', effects: { cash: -2_000_000_000, factions: { trabalhadores: 5, elite: -2 }, legacyScore: 4 } },
      { id: 'austerity', label: '[ IMPOR DISCIPLINA FISCAL ]', detail: 'Protege o caixa, mas aumenta o desemprego e desgasta a base popular.', effects: { unemployment: 0.01, factions: { elite: 4, trabalhadores: -5 }, legacyScore: 2 } },
    ],
  },
]);

export function createPresidentialMandate(value = {}) {
  return {
    term: Math.max(1, Math.floor(numberOr(value.term, 1))),
    monthsInOffice: Math.max(0, Math.floor(numberOr(value.monthsInOffice))),
    decisionsMade: Array.isArray(value.decisionsMade) ? value.decisionsMade.filter((id) => typeof id === 'string').slice(-24) : [],
    promises: Array.isArray(value.promises) ? value.promises.filter((id) => typeof id === 'string').slice(-12) : [],
    scandals: Array.isArray(value.scandals) ? value.scandals.filter((id) => typeof id === 'string').slice(-12) : [],
    legacyScore: numberOr(value.legacyScore),
    lastBriefingMonth: value.lastBriefingMonth != null && Number.isFinite(Number(value.lastBriefingMonth)) ? Math.floor(Number(value.lastBriefingMonth)) : null,
  };
}

// Um briefing a cada 2 ou 3 meses (alterna pela semente): os meses entre eles ficam livres para o jogador.
export const BRIEFING_MIN_GAP = 2;

function publicBriefing(briefing) {
  return {
    id: briefing.id,
    title: briefing.title,
    subtitle: briefing.subtitle,
    description: briefing.description,
    options: briefing.options.map((option) => ({
      id: option.id,
      label: option.label,
      detail: option.detail,
    })),
  };
}

export function getPresidentialBriefing(id) {
  const briefing = PRESIDENTIAL_BRIEFINGS.find((item) => item.id === id);
  return briefing ? publicBriefing(briefing) : null;
}

export function selectPresidentialBriefing(state) {
  const candidates = PRESIDENTIAL_BRIEFINGS.filter((briefing) => briefing.condition(state));
  const seed = Math.abs(Math.floor(numberOr(state.randomSeed, 1)));
  return publicBriefing(candidates[seed % candidates.length] ?? PRESIDENTIAL_BRIEFINGS[PRESIDENTIAL_BRIEFINGS.length - 1]);
}

function hasBlockingDecision(state) {
  return Boolean(state.pendingEvent
    || state.pendingStory
    || state.pendingBunkerEvent
    || state.pendingUnVote
    || state.pendingGlobalBid
    || state.pendingInterrogation
    || state.pendingAllianceInvocation
    || state.geopolitics?.peaceTreaty?.status === 'pending');
}

export function queuePresidentialBriefing(state) {
  if (state.is_wasteland || state.city || state.regime?.gameOver || state.pendingBriefing || hasBlockingDecision(state)) return state;
  if (numberOr(state.monthCounter) < 1) return state;
  const mandate = createPresidentialMandate(state.presidentialMandate);
  const monthCounter = numberOr(state.monthCounter);
  const gap = BRIEFING_MIN_GAP + (Math.abs(Math.floor(numberOr(state.randomSeed, 1))) % 2);
  const monthsInOffice = mandate.monthsInOffice + 1;
  if (mandate.lastBriefingMonth !== null && monthCounter - mandate.lastBriefingMonth < gap) {
    return { ...state, presidentialMandate: { ...mandate, monthsInOffice } };
  }
  return {
    ...state,
    pendingBriefing: selectPresidentialBriefing(state),
    presidentialMandate: { ...mandate, monthsInOffice, lastBriefingMonth: monthCounter },
    notice: 'Briefing presidencial: uma decisão aguarda o seu comando.',
  };
}

function getPendingOption(state, optionId) {
  const briefing = PRESIDENTIAL_BRIEFINGS.find((item) => item.id === state.pendingBriefing?.id);
  const option = briefing?.options.find((item) => item.id === optionId);
  return briefing && option ? { briefing, option } : null;
}

export function resolvePresidentialBriefing(state, optionId) {
  const selected = getPendingOption(state, optionId);
  if (!selected) return { ...state, notice: 'Nenhuma decisão presidencial válida está pendente.' };
  const effects = normalizeEffects(selected.option.effects);
  const economy = {
    ...state.economy,
    cash: numberOr(state.economy?.cash) + effects.cash,
    inflation: clamp(numberOr(state.economy?.inflation) + effects.inflation, 0, 0.8),
    unemployment: clamp(numberOr(state.economy?.unemployment, 0.05) + effects.unemployment, 0.02, 0.45),
  };
  const factions = Object.fromEntries(Object.entries(state.factions ?? {}).map(([id, value]) => [
    id,
    clamp(numberOr(value, 50) + numberOr(effects.factions[id]), 0, MAX_FACTION),
  ]));
  const geopolitics = effects.onu === 0
    ? state.geopolitics
    : { ...state.geopolitics, onuScore: clamp(numberOr(state.geopolitics?.onuScore, 50) + effects.onu, 0, 100) };
  const mandate = createPresidentialMandate(state.presidentialMandate);
  const historyEntry = {
    month: state.calendar?.month ?? 1,
    year: state.calendar?.year ?? 2026,
    type: 'briefing',
    text: `${selected.briefing.title}: ${selected.option.label.replace(/^\[ | \]$/g, '')}.`,
  };
  return {
    ...state,
    economy,
    factions,
    geopolitics,
    pendingBriefing: null,
    presidentialMandate: {
      ...mandate,
      decisionsMade: [...mandate.decisionsMade, `${selected.briefing.id}:${selected.option.id}`].slice(-24),
      legacyScore: mandate.legacyScore + effects.legacyScore,
    },
    history_log: [...(state.history_log ?? []), historyEntry],
    news: [{ text: `Decisão presidencial: ${selected.option.label}.`, calendar: { ...state.calendar } }, ...(state.news ?? [])].slice(0, 5),
    notice: `${selected.option.label} — ${selected.briefing.title}.`,
  };
}
