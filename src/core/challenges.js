// Desafios de variedade: objetivos alem de anexar paises, acompanhados automaticamente (ate 3 ao mesmo tempo).
import { adjustFactions } from './factions.js';
import { pushWorldNews } from './world_news.js';

export const MAX_ACTIVE_CHALLENGES = 3;

const monthOf = (state) => Number(state.monthCounter) || 0;
const contactsOf = (state) => state.geopolitics?.contacts ?? [];
const wars = (state) => Number(state.reputation?.stats?.warsDeclared) || 0;
const annexedCount = (state) => Math.max(contactsOf(state).filter((item) => item.anexado).length, (state.geopolitics?.annexedCountryIds ?? []).length);
const playerBloc = (state) => (state.worldOrder?.coalitions ?? []).find((item) => item.player);

// baseline(state): valores guardados ao aceitar; metric(state, entry): progresso atual.
export const CHALLENGES = Object.freeze({
  peace: { id: 'peace', icon: '🕊️', title: 'Paz duradoura', goal: 24, unit: 'meses', text: 'Fique 24 meses seguidos sem declarar guerra. Declarar guerra zera a contagem.', reward: { cashRate: 0.05, label: '5% do PIB e mais apoio dos trabalhadores', factions: { trabalhadores: 4, elite: 2 } }, baseline: (s) => ({ since: monthOf(s), warsSeen: wars(s) }), metric: (s, e) => monthOf(s) - (e.base.since ?? 0) },
  pacts: { id: 'pacts', icon: '🤝', title: 'Mestre dos pactos', goal: 6, unit: 'pactos', text: 'Assine 6 pactos de não agressão.', reward: { cashRate: 0.03, label: '3% do PIB e prestígio com a elite', factions: { elite: 3 } }, baseline: (s) => ({ signed: s.worldOrder?.signed ?? 0 }), metric: (s, e) => (s.worldOrder?.signed ?? 0) - (e.base.signed ?? 0) },
  contracts: { id: 'contracts', icon: '💰', title: 'Senhor da guerra', goal: 5, unit: 'contratos', text: 'Cumpra 5 contratos de guerra oferecidos por outros países.', reward: { cashRate: 0.06, label: '6% do PIB e apoio dos militares', factions: { militares: 4 } }, baseline: (s) => ({ done: s.contracts?.fulfilled ?? 0 }), metric: (s, e) => (s.contracts?.fulfilled ?? 0) - (e.base.done ?? 0) },
  allies: { id: 'allies', icon: '🛡️', title: 'Rede de aliados', goal: 5, unit: 'aliados', text: 'Tenha 5 aliados ao mesmo tempo.', reward: { cashRate: 0.04, label: '4% do PIB e apoio da elite', factions: { elite: 3, militares: 2 } }, baseline: () => ({}), metric: (s) => contactsOf(s).filter((item) => item.alliance && !item.destruido).length },
  conquest: { id: 'conquest', icon: '⚔️', title: 'Conquistador', goal: 5, unit: 'países', text: 'Anexe 5 países a partir de agora.', reward: { cashRate: 0.08, label: '8% do PIB e apoio dos militares', factions: { militares: 5 } }, baseline: (s) => ({ annexed: annexedCount(s) }), metric: (s, e) => annexedCount(s) - (e.base.annexed ?? 0) },
  puppets: { id: 'puppets', icon: '🎭', title: 'Império de fantoches', goal: 3, unit: 'fantoches', text: 'Tenha 3 países fantoche ao mesmo tempo.', reward: { cashRate: 0.05, label: '5% do PIB e apoio da elite', factions: { elite: 4 } }, baseline: () => ({}), metric: (s) => contactsOf(s).filter((item) => item.puppet && item.is_puppet_of === 'jogador' && !item.destruido).length },
  liberator: { id: 'liberator', icon: '🗽', title: 'Libertador', goal: 2, unit: 'países', text: 'Liberte 2 países anexados por rivais.', reward: { cashRate: 0.04, label: '4% do PIB e mais apoio dos trabalhadores', factions: { trabalhadores: 4 } }, baseline: (s) => ({ lib: s.worldOrder?.liberated ?? 0 }), metric: (s, e) => (s.worldOrder?.liberated ?? 0) - (e.base.lib ?? 0) },
  bloc: { id: 'bloc', icon: '🏰', title: 'Líder de bloco', goal: 4, unit: 'aliados no bloco', text: 'Forme um bloco de defesa coletiva com 4 aliados.', reward: { cashRate: 0.05, label: '5% do PIB e apoio dos militares', factions: { militares: 3, elite: 2 } }, baseline: () => ({}), metric: (s) => playerBloc(s)?.members?.length ?? 0 },
});
export const CHALLENGE_LIST = Object.freeze(Object.values(CHALLENGES));

export const createChallenges = () => ({ active: {}, completed: {} });

export function normalizeChallenges(value) {
  const out = createChallenges();
  if (!value || typeof value !== 'object') return out;
  for (const [id, entry] of Object.entries(value.active ?? {})) {
    if (!CHALLENGES[id] || !entry || typeof entry !== 'object' || Object.keys(out.active).length >= MAX_ACTIVE_CHALLENGES) continue;
    const base = entry.base && typeof entry.base === 'object' ? Object.fromEntries(Object.entries(entry.base).map(([key, number]) => [key, Number(number) || 0])) : {};
    out.active[id] = { startMonth: Math.max(0, Math.floor(Number(entry.startMonth) || 0)), base };
  }
  for (const [id, entry] of Object.entries(value.completed ?? {})) if (CHALLENGES[id] && entry) out.completed[id] = { month: Math.max(0, Math.floor(Number(entry.month) || 0)) };
  return out;
}

const view = (state) => normalizeChallenges(state.challenges);

// Progresso atual (0..meta). Sem desafio ativo mostra o valor instantaneo dos que dependem do estado de agora.
export function getChallengeValue(state, id) {
  const def = CHALLENGES[id];
  if (!def) return 0;
  const entry = view(state).active[id];
  if (!entry) return 0;
  return Math.min(def.goal, Math.max(0, def.metric(state, entry)));
}

export function getChallengeStatus(state, id) {
  const data = view(state);
  if (!CHALLENGES[id]) return { available: false, reason: 'Desafio desconhecido.' };
  if (state.regime?.gameOver || state.is_wasteland || state.city) return { available: false, reason: 'Indisponível.' };
  if (data.completed[id]) return { available: false, reason: 'Desafio já cumprido.', done: true };
  if (data.active[id]) return { available: false, reason: 'Em andamento.', running: true };
  if (Object.keys(data.active).length >= MAX_ACTIVE_CHALLENGES) return { available: false, reason: `No máximo ${MAX_ACTIVE_CHALLENGES} desafios ao mesmo tempo.` };
  return { available: true, reason: '' };
}

export function startChallenge(state, id) {
  const status = getChallengeStatus(state, id);
  if (!status.available) return { ...state, notice: status.reason };
  const data = view(state);
  const def = CHALLENGES[id];
  return { ...state, challenges: { ...data, active: { ...data.active, [id]: { startMonth: monthOf(state), base: def.baseline(state) } } }, notice: `Desafio aceito: ${def.title}. ${def.text}` };
}

export function abandonChallenge(state, id) {
  const data = view(state);
  if (!data.active[id]) return state;
  const { [id]: removed, ...rest } = data.active;
  return { ...state, challenges: { ...data, active: rest }, notice: `Você desistiu do desafio "${CHALLENGES[id].title}".` };
}

// Mensal: zera a paz se houve guerra e conclui o que foi cumprido.
export function processChallenges(state) {
  if (state.regime?.gameOver || state.is_wasteland || state.city || !state.geopolitics?.contacts) return state;
  let data = view(state);
  const ids = Object.keys(data.active);
  if (!ids.length) return state;
  let next = state;
  for (const id of ids) {
    const def = CHALLENGES[id];
    let entry = data.active[id];
    if (id === 'peace' && wars(next) > (entry.base.warsSeen ?? 0)) {
      entry = { ...entry, base: { since: monthOf(next), warsSeen: wars(next) } };
      data = { ...data, active: { ...data.active, [id]: entry } };
    }
    if (def.metric(next, entry) < def.goal) continue;
    const { [id]: removed, ...rest } = data.active;
    data = { active: rest, completed: { ...data.completed, [id]: { month: monthOf(next) } } };
    const gdp = Number(next.economy?.gdp) || 0;
    next = {
      ...next,
      economy: { ...next.economy, cash: (Number(next.economy?.cash) || 0) + gdp * def.reward.cashRate },
      factions: adjustFactions(next.factions, def.reward.factions),
      notice: `Desafio cumprido: ${def.title}! Recompensa: ${def.reward.label}.`,
    };
    next = pushWorldNews(next, `Desafio cumprido: ${def.title}.`, 'challenge');
  }
  return { ...next, challenges: data };
}
