// Rede de espionagem: agentes por pais, em 3 niveis. Quanto mais fundo, mais voce ve e mais operacoes liberam.
//   Nivel 1 Informante: revela poder exato, defesa digital e chance de ataque contra voce.
//   Nivel 2 Rede: revela planos (cobica, coalizao) e libera "Roubar tecnologia" e "Comprar influencia".
//   Nivel 3 Agente infiltrado: libera "Sabotar o exercito".
// Cada mes a rede pode ser descoberta (risco sobe com o nivel e com a hostilidade); se cair, a relacao e a ONU sofrem.
import { getRivalTargets } from './world_order.js';
import { hasEmbassy } from './embassies.js';
import { getMinisterModifiers } from './ministers.js';
import { pushWorldNews } from './world_news.js';

export const MAX_LEVEL = 3;
export const LEVEL_NAMES = Object.freeze(['Sem rede', 'Informante', 'Rede de agentes', 'Agente infiltrado']);
export const INSTALL_COST_RATE = Object.freeze([0, 0.002, 0.004, 0.008]);
export const OP_COOLDOWN_MONTHS = 6;
export const MAX_NETWORKS = 6;

export const OPS = Object.freeze({
  steal: Object.freeze({ id: 'steal', label: 'Roubar tecnologia', level: 2, costRate: 0.003, base: 0.55, text: 'Rende pontos de pesquisa militar.' }),
  influence: Object.freeze({ id: 'influence', label: 'Comprar influência', level: 2, costRate: 0.002, base: 0.7, text: 'Sobe a relação com o país em 12 pontos.' }),
  sabotage: Object.freeze({ id: 'sabotage', label: 'Sabotar o exército', level: 3, costRate: 0.004, base: 0.5, text: 'Derruba 15% do poder militar do alvo.' }),
});

const monthOf = (state) => Number(state.monthCounter) || 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const contactOf = (state, id) => (state.geopolitics?.contacts ?? []).find((item) => item.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((item) => (item.id === id ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item)) } });

export const createSpies = () => ({ nets: {}, cooldowns: {}, exposed: 0, ops: 0 });

export function normalizeSpies(value) {
  const out = createSpies();
  if (!value || typeof value !== 'object') return out;
  const int = (n) => Math.max(0, Math.floor(Number(n) || 0));
  for (const [id, net] of Object.entries(value.nets ?? {})) {
    const level = clamp(int(net?.level), 1, MAX_LEVEL);
    if (net && level >= 1 && Object.keys(out.nets).length < MAX_NETWORKS) out.nets[id] = { level, since: int(net.since) };
  }
  for (const [key, month] of Object.entries(value.cooldowns ?? {})) out.cooldowns[key] = int(month);
  out.exposed = int(value.exposed);
  out.ops = int(value.ops);
  return out;
}

const view = (state) => normalizeSpies(state.spies);
export const getLevel = (state, id) => view(state).nets[id]?.level ?? 0;
export const listNetworks = (state) => Object.entries(view(state).nets).map(([id, net]) => ({ id, ...net, name: contactOf(state, id)?.name ?? id }));

function hash(month, salt, id) {
  const extra = [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

function isActive(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

export function getInstallStatus(state, id) {
  const contact = contactOf(state, id);
  const data = view(state);
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  if (!contact || contact.destruido || contact.anexado || contact.annexedBy) return { available: false, reason: 'País fora do jogo.' };
  const level = data.nets[id]?.level ?? 0;
  if (level >= MAX_LEVEL) return { available: false, reason: 'Rede no nível máximo.', level };
  if (!canInstallAgain(state, id)) return { available: false, reason: 'O país está de sobreaviso depois de descobrir seus agentes.', level };
  if (!level && Object.keys(data.nets).length >= MAX_NETWORKS) return { available: false, reason: `No máximo ${MAX_NETWORKS} redes ao mesmo tempo.`, level };
  const cost = Math.round((Number(state.economy?.gdp) || 0) * INSTALL_COST_RATE[level + 1]);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente.', level, cost };
  return { available: true, reason: '', level, cost };
}

export function installAgent(state, id) {
  const status = getInstallStatus(state, id);
  if (!status.available) return { ...state, notice: status.reason };
  const data = view(state);
  const contact = contactOf(state, id);
  const level = status.level + 1;
  return {
    ...state,
    economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost },
    spies: { ...data, nets: { ...data.nets, [id]: { level, since: data.nets[id]?.since ?? monthOf(state) } } },
    notice: `${LEVEL_NAMES[level]} instalado em ${contact.name}.`,
  };
}

export function getOpStatus(state, id, opId) {
  const op = OPS[opId];
  const contact = contactOf(state, id);
  const level = getLevel(state, id);
  if (!op || !contact || !isActive(state)) return { available: false, reason: 'Indisponível.' };
  if (level < op.level) return { available: false, reason: `Exige ${LEVEL_NAMES[op.level]}.` };
  if (contact.destruido || contact.anexado || contact.annexedBy) return { available: false, reason: 'País fora do jogo.' };
  const until = view(state).cooldowns[`${id}:${opId}`];
  if (Number.isFinite(until) && until > monthOf(state)) return { available: false, reason: `Aguarde ${until - monthOf(state)} mês(es).` };
  const cost = Math.round((Number(state.economy?.gdp) || 0) * op.costRate);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente.', cost };
  const chance = clamp(op.base + (level - op.level) * 0.1 + (hasEmbassy(state, id) ? 0.08 : 0) - (Number(contact.cyber_defense) || 0) / 400, 0.2, 0.9);
  return { available: true, reason: '', cost, chance };
}

// Perde a rede: relacao e ONU sofrem e o pais fica de sobreaviso (nao aceita nova rede por 12 meses).
function burn(state, id, relationHit, onuHit, why) {
  const data = view(state);
  const { [id]: lost, ...nets } = data.nets;
  const contact = contactOf(state, id);
  let next = patchContact({ ...state, spies: { ...data, nets, exposed: data.exposed + 1, cooldowns: { ...data.cooldowns, [`${id}:install`]: monthOf(state) + 12 } } }, id, (item) => ({ relation: clamp((Number(item.relation) || 0) - relationHit, -100, 100) }));
  next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) - onuHit, 0, 100) } };
  const text = `${why} em ${contact?.name ?? id}: a rede foi desmantelada (relação −${relationHit}, ONU −${onuHit}).`;
  return pushWorldNews({ ...next, notice: text }, text, 'world');
}

export function runOp(state, id, opId) {
  const status = getOpStatus(state, id, opId);
  if (!status.available) return { ...state, notice: status.reason };
  const op = OPS[opId];
  const contact = contactOf(state, id);
  const data = view(state);
  const month = monthOf(state);
  let next = {
    ...state,
    economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost },
    spies: { ...data, ops: data.ops + 1, cooldowns: { ...data.cooldowns, [`${id}:${opId}`]: month + OP_COOLDOWN_MONTHS } },
  };
  const roll = hash(month, 677 + op.level, id + opId);
  if (roll >= status.chance) return burn(next, id, op.level === 3 ? 40 : 25, op.level === 3 ? 5 : 3, `Operação de ${op.label.toLowerCase()} fracassou`);
  if (opId === 'steal') {
    const points = 40 + (getLevel(state, id) * 10);
    return { ...next, military_research_points: (Number(next.military_research_points) || 0) + points, notice: `Agentes em ${contact.name} roubaram projetos: +${points} pontos de pesquisa militar.` };
  }
  if (opId === 'influence') {
    return { ...patchContact(next, id, (item) => ({ relation: clamp((Number(item.relation) || 0) + 12, -100, 100) })), notice: `A influência comprada em ${contact.name} funcionou: relação +12.` };
  }
  return { ...patchContact(next, id, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) * 0.85) })), notice: `Sabotagem em ${contact.name}: o poder militar do país caiu 15%.` };
}

// O que a rede revela sobre o pais (vazio se nao ha agente).
export function getIntel(state, id) {
  const level = getLevel(state, id);
  const contact = contactOf(state, id);
  if (!level || !contact) return null;
  const lines = [`Poder militar exato: ${(Number(contact.militaryPower) || 0).toFixed(1)} · defesa digital ${(Number(contact.cyber_defense) || 0).toFixed(0)}.`];
  lines.push(contact.atWar ? 'Está em guerra com você.' : ((Number(contact.relation) || 0) < -30 ? 'Hostil: pode agir contra você.' : 'Sem sinais de agressão contra você.'));
  if (level >= 2) {
    const plans = getRivalTargets(state).filter((item) => item.aggressorId === id || item.aggressor === id || item.aggressorName === contact.name);
    lines.push(plans.length ? `Planeja anexar ${plans.map((item) => item.victimName).join(', ')}.` : 'Sem planos de anexação conhecidos.');
    const bloc = (state.worldOrder?.coalitions ?? []).find((item) => item.members.includes(id));
    lines.push(bloc ? `Membro da coalizão "${bloc.name}".` : 'Fora de coalizões.');
  }
  return { level, name: LEVEL_NAMES[level], lines };
}

// Mensal: risco de a rede ser descoberta.
export function processSpies(state) {
  if (!isActive(state)) return state;
  let next = state;
  const month = monthOf(state);
  for (const [id, net] of Object.entries(view(state).nets)) {
    const contact = contactOf(next, id);
    if (!contact || contact.destruido || contact.anexado) continue;
    const hostile = contact.atWar ? 2 : ((Number(contact.relation) || 0) < -30 ? 1.5 : 1);
    const risk = 0.012 * net.level * hostile * (hasEmbassy(next, id) ? 0.5 : 1) * getMinisterModifiers(next.ministers).spyRisk;
    if (hash(month, 701, id) < risk) next = burn(next, id, 15 + net.level * 5, 2 + net.level, 'Espiões descobertos');
  }
  return next;
}

export function canInstallAgain(state, id) {
  const until = view(state).cooldowns[`${id}:install`];
  return !(Number.isFinite(until) && until > monthOf(state));
}
