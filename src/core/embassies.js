// Embaixadores: ate 5 ao mesmo tempo, um por pais. Melhoram a relacao todo mes e a chance de pactos, mas cada um tem um
// perfil: o corrupto pode estourar num escandalo e o ambicioso pode desertar para o outro lado. Custam um salario mensal.
import { pushWorldNews } from './world_news.js';

export const MAX_EMBASSIES = 5;
export const HIRE_COST_RATE = 0.001;
export const UPKEEP_RATE = 0.0002; // do PIB por mes
export const RELATION_CAP = 80;

export const TRAITS = Object.freeze({
  loyal: Object.freeze({ id: 'loyal', label: 'Leal', relation: 0.4, pact: 0.06, risk: 0, text: 'Constante e confiável.' }),
  skilled: Object.freeze({ id: 'skilled', label: 'Hábil', relation: 0.7, pact: 0.1, risk: 0, text: 'Mais relação e pactos mais fáceis.' }),
  corrupt: Object.freeze({ id: 'corrupt', label: 'Corrupto', relation: 0.5, pact: 0.04, risk: 0.03, text: 'Pode estourar num escândalo (3% ao mês).' }),
  ambitious: Object.freeze({ id: 'ambitious', label: 'Ambicioso', relation: 0.9, pact: 0.08, risk: 0.02, text: 'Rende muito, mas pode desertar (2% ao mês).' }),
});
const TRAIT_ORDER = Object.freeze(['loyal', 'skilled', 'corrupt', 'ambitious']);

const monthOf = (state) => Number(state.monthCounter) || 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const contactOf = (state, id) => (state.geopolitics?.contacts ?? []).find((item) => item.id === id);

export const createEmbassies = () => ({ posts: {}, scandals: 0, defections: 0 });

export function normalizeEmbassies(value) {
  const out = createEmbassies();
  if (!value || typeof value !== 'object') return out;
  const int = (n) => Math.max(0, Math.floor(Number(n) || 0));
  for (const [id, post] of Object.entries(value.posts ?? {})) {
    if (!post || !TRAITS[post.trait] || Object.keys(out.posts).length >= MAX_EMBASSIES) continue;
    out.posts[id] = { trait: post.trait, since: int(post.since) };
  }
  out.scandals = int(value.scandals);
  out.defections = int(value.defections);
  return out;
}

const view = (state) => normalizeEmbassies(state.embassies);
export const hasEmbassy = (state, id) => Boolean(view(state).posts[id]);
export const listEmbassies = (state) => Object.entries(view(state).posts).map(([id, post]) => ({ id, ...post, name: contactOf(state, id)?.name ?? id, trait: TRAITS[post.trait] }));
export const getEmbassyPactBonus = (state, id) => TRAITS[view(state).posts[id]?.trait]?.pact ?? 0;
export const getUpkeep = (state) => Math.round((Number(state.economy?.gdp) || 0) * UPKEEP_RATE * Object.keys(view(state).posts).length);

function hash(month, salt, id) {
  const extra = [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

function isActive(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

export function getHireStatus(state, id) {
  const contact = contactOf(state, id);
  const data = view(state);
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  if (!contact || contact.destruido || contact.anexado || contact.annexedBy) return { available: false, reason: 'País fora do jogo.' };
  if (data.posts[id]) return { available: false, reason: 'Já há um embaixador aqui.', has: true };
  if (contact.atWar) return { available: false, reason: 'Em guerra: sem relações diplomáticas.' };
  if ((Number(contact.relation) || 0) < -30) return { available: false, reason: 'A relação está ruim demais para receber um embaixador.' };
  if (Object.keys(data.posts).length >= MAX_EMBASSIES) return { available: false, reason: `No máximo ${MAX_EMBASSIES} embaixadas.` };
  const cost = Math.round((Number(state.economy?.gdp) || 0) * HIRE_COST_RATE);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente.', cost };
  return { available: true, reason: '', cost };
}

export function hireAmbassador(state, id) {
  const status = getHireStatus(state, id);
  if (!status.available) return { ...state, notice: status.reason };
  const data = view(state);
  const month = monthOf(state);
  const trait = TRAIT_ORDER[Math.floor(hash(month, 911, id) * TRAIT_ORDER.length) % TRAIT_ORDER.length];
  const contact = contactOf(state, id);
  return {
    ...state,
    economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost },
    embassies: { ...data, posts: { ...data.posts, [id]: { trait, since: month } } },
    notice: `Embaixador ${TRAITS[trait].label.toLowerCase()} nomeado em ${contact.name}. ${TRAITS[trait].text}`,
  };
}

export function dismissAmbassador(state, id) {
  const data = view(state);
  if (!data.posts[id]) return state;
  const { [id]: removed, ...posts } = data.posts;
  return { ...state, embassies: { ...data, posts }, notice: `Embaixada em ${contactOf(state, id)?.name ?? id} fechada.` };
}

// Mensal: salario, ganho de relacao e os riscos de escandalo e desercao.
export function processEmbassies(state) {
  if (!isActive(state)) return state;
  const month = monthOf(state);
  let data = view(state);
  const ids = Object.keys(data.posts);
  if (!ids.length) return state;
  let next = { ...state, economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - getUpkeep(state) } };
  for (const id of ids) {
    const post = data.posts[id];
    const trait = TRAITS[post.trait];
    const contact = contactOf(next, id);
    if (!contact || contact.destruido || contact.anexado || contact.annexedBy || contact.atWar) {
      const { [id]: gone, ...rest } = data.posts;
      data = { ...data, posts: rest };
      continue;
    }
    if (trait.risk && hash(month, 953, id) < trait.risk) {
      const { [id]: gone, ...rest } = data.posts;
      const scandal = post.trait === 'corrupt';
      data = { ...data, posts: rest, scandals: data.scandals + (scandal ? 1 : 0), defections: data.defections + (scandal ? 0 : 1) };
      const hit = scandal ? 15 : 20;
      const text = scandal ? `Escândalo: o embaixador em ${contact.name} foi flagrado em corrupção (relação −${hit}, ONU −3).` : `O embaixador em ${contact.name} desertou e passou segredos ao governo local (relação −${hit}, ONU −2).`;
      next = {
        ...next,
        geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) - (scandal ? 3 : 2), 0, 100), contacts: next.geopolitics.contacts.map((item) => (item.id === id ? { ...item, relation: clamp((Number(item.relation) || 0) - hit, -100, 100) } : item)) },
      };
      next = pushWorldNews({ ...next, notice: text }, text, 'world');
      continue;
    }
    next = { ...next, geopolitics: { ...next.geopolitics, contacts: next.geopolitics.contacts.map((item) => (item.id === id && (Number(item.relation) || 0) < RELATION_CAP ? { ...item, relation: clamp((Number(item.relation) || 0) + trait.relation, -100, RELATION_CAP) } : item)) } };
  }
  return { ...next, embassies: data };
}
