import { nextRandom } from './geopolitics.js';

const METHODS = Object.freeze({
  'truth-serum': { chance: 0.7, cost: 0 },
  'psychological-pressure': { chance: 0.45, cost: 0 },
  bribe: { chance: 0.85, cost: 1_000_000_000 },
});

function hasBlockingState(state) {
  return Boolean(
    state.regime?.gameOver
    || state.pendingInterrogation
    || state.pendingEvent
    || state.pendingUnVote
    || state.pendingGlobalBid
    || state.pendingFinalDilemma
    || state.geopolitics?.peaceTreaty?.status === 'pending',
  );
}

export function sortearCapturaAgente(state) {
  if (hasBlockingState(state)) return state;
  const random = nextRandom(state.randomSeed);
  if (random.value >= 0.05) return { ...state, randomSeed: random.seed };
  return {
    ...state,
    randomSeed: random.seed,
    pendingInterrogation: { phase: 'choice', prisonerId: 847 },
    notice: 'Prisioneiro #847 adquirido. Iniciando interrogatorio.',
  };
}

export function resolverInterrogatorio(state, method) {
  const operation = METHODS[method];
  if (state.pendingInterrogation?.phase !== 'choice' || !operation) return { ...state, notice: 'Metodo de interrogatorio invalido.' };
  if ((Number(state.economy?.cash) || 0) < operation.cost) return { ...state, notice: 'Caixa insuficiente para subornar o agente.' };
  const random = nextRandom(state.randomSeed);
  const economy = operation.cost > 0 ? { ...state.economy, cash: state.economy.cash - operation.cost } : state.economy;
  if (random.value >= operation.chance) {
    return { ...state, economy, randomSeed: random.seed, pendingInterrogation: null, notice: 'O agente resistiu ao interrogatorio.' };
  }
  return {
    ...state,
    economy,
    randomSeed: random.seed,
    pendingInterrogation: { ...state.pendingInterrogation, phase: 'reward' },
    notice: 'O agente quebrou. Selecione a exploracao da informacao.',
  };
}

export function escolherInterrogatorio(state, action) {
  const method = { soro: 'truth-serum', tortura: 'psychological-pressure' }[action];
  if (action === 'suborno') {
    const cost = 1_000_000_000;
    if (state.pendingInterrogation?.phase !== 'choice') return { ...state, notice: 'Nenhum interrogatorio aguarda escolha.' };
    if ((Number(state.economy?.cash) || 0) < cost) return { ...state, notice: 'Caixa insuficiente para subornar o agente.' };
    return {
      ...state,
      economy: { ...state.economy, cash: state.economy.cash - cost },
      double_agent_active: true,
      pendingInterrogation: null,
      notice: 'Suborno aceito. Agente estrangeiro convertido em agente duplo.',
    };
  }
  if (!method) return { ...state, notice: 'Acao de interrogatorio invalida.' };
  const resolved = resolverInterrogatorio(state, method);
  return resolved.pendingInterrogation?.phase === 'reward'
    ? reivindicarInterrogatorio(resolved, 'extract-secrets')
    : resolved;
}

export function reivindicarInterrogatorio(state, reward) {
  if (state.pendingInterrogation?.phase !== 'reward') return { ...state, notice: 'Nenhuma recompensa de interrogatorio esta disponivel.' };
  if (reward === 'extract-secrets') {
    return {
      ...state,
      technology: { ...state.technology, points: (Number(state.technology?.points) || 0) + 2_000 },
      pendingInterrogation: null,
      notice: 'Segredos roubados convertidos em 2.000 Pontos de Pesquisa.',
    };
  }
  if (reward === 'turn-double-agent') {
    return { ...state, double_agent_active: true, pendingInterrogation: null, notice: 'Agente estrangeiro convertido em agente duplo.' };
  }
  return { ...state, notice: 'Recompensa de interrogatorio invalida.' };
}
