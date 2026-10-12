import { nextRandom } from './geopolitics.js';

const CAPITALIST_LAWS = new Set(['deregulation', 'privatization']);
const LOBBY_BLOCKED_LAWS = new Set(['tax-reform', 'wealth-tax']);

export function getMegacorpModifiers(power) {
  return { taxRevenueModifier: (Number(power) || 0) > 0 ? 0.2 : 0 };
}

export function processarMegacorporacoes(state) {
  const activeLawIds = state.activeLawIds ?? [];
  const capitalistLawCount = activeLawIds.filter((id) => CAPITALIST_LAWS.has(id)).length;
  if (!capitalistLawCount) return state;
  return { ...state, megacorp_power: Math.min(100, (Number(state.megacorp_power) || 0) + (capitalistLawCount * 3)) };
}

export function isLobbyBlocked(law, power) {
  return (Number(power) || 0) > 80 && (law.category === 'Ambiente' || LOBBY_BLOCKED_LAWS.has(law.id));
}

export function estatizarMegacorporacoes(state) {
  if ((Number(state.megacorp_power) || 0) <= 0) return { ...state, notice: 'Nao ha megacorporacoes dominantes para estatizar.' };
  const random = nextRandom(state.randomSeed);
  const eliteCoup = random.value < 0.3;
  return {
    ...state,
    megacorp_power: 0,
    randomSeed: random.seed,
    regime: eliteCoup ? { ...state.regime, gameOver: true, endReason: 'Golpe financiado pela elite corporativa.' } : state.regime,
    notice: eliteCoup ? 'Golpe de Estado: a elite corporativa financiou a queda do governo.' : 'Megacorporacoes estatizadas. O poder corporativo foi dissolvido.',
  };
}
