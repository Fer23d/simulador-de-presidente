// Ordem mundial: pactos de nao agressao, potencias rivais que anexam paises e coalizoes de defesa coletiva.
//  - Pactos (1 a 4 anos): o parceiro nao declara guerra nem ataca seus territorios; quebrar o pacto custa caro.
//    Voce propoe (a chance depende da relacao) e outros paises tambem oferecem.
//  - Depois que voce anexa 3 paises, o mundo acorda: potencias passam a anexar vizinhos mais fracos e a cobicar seus territorios.
//  - Coalizoes (ate 5 paises, nenhum em duas): quem ataca um membro enfrenta todos; protegem os membros de anexacao.
import { distanceKm } from './offensives.js';
import { SPECIALTIES, getSpecialties } from './specialties.js';
import { getPoderTotal } from './military.js';
import { createGeopolitics } from './geopolitics.js';
import { adjustFactions } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const PACT_YEARS = Object.freeze([1, 2, 3, 4]);
export const MAX_ACTIVE_PACTS = 6;
export const PACT_REFUSAL_COOLDOWN = 6;
export const PACT_OFFER_DEADLINE = 3;
export const PACT_OFFER_CHANCE = 0.07;
export const AWAKEN_ANNEXATIONS = 3;
export const ANNEX_COOLDOWN_MONTHS = 5;
export const ANNEX_MONTHLY_CHANCE = 0.12;
export const ANNEX_MAX_KM = 7000;
export const COALITION_MAX_MEMBERS = 5;
export const COALITION_MIN_MEMBERS = 3;
export const COALITION_MAX_COUNT = 4;
export const COALITION_FORM_COOLDOWN = 6;
export const COALITION_FORM_CHANCE = 0.1;
export const COALITION_GROW_CHANCE = 0.04;
export const BREAK_ONU_PENALTY = 15;
export const PLAYER_BLOC_MAX_ALLIES = COALITION_MAX_MEMBERS - 1;
export const BLOC_FOUND_COST_RATE = 0.01;
export const BRIBE_COST_RATE = 0.015;
export const BRIBE_COOLDOWN = 6;
export const RENEW_WINDOW_MONTHS = 6;
export const PACT_TRADE_RATE = 0.004;
export const PACT_TRADE_AFTER = 12;
export const LIBERATION_COST_RATE = 0.02;
export const COALITION_COLORS = Object.freeze(['#ffb000', '#ff5ec4', '#7cf0ff', '#c8ff4d', '#ff8a4d']);

export function createWorldOrder() {
  return { pacts: {}, offer: null, cooldowns: {}, offerCooldowns: {}, signed: 0, broken: 0, awake: false, awakeMonth: -1, annexations: [], lastAnnexMonth: -99, coalitions: [], lastFormMonth: -99, coalitionWars: 0, nextCoalitionId: 1, liberated: 0 };
}

const month0 = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback);

export function normalizeWorldOrder(value) {
  const base = createWorldOrder();
  if (!value || typeof value !== 'object') return base;
  const pacts = {};
  for (const [id, pact] of Object.entries(value.pacts ?? {})) {
    const end = month0(pact?.end, NaN);
    if (typeof id === 'string' && Number.isFinite(end)) pacts[id] = { start: month0(pact.start), end, years: clamp(month0(pact.years, 1), 1, 4) };
  }
  const offer = value.offer && typeof value.offer.id === 'string' && Number.isFinite(Number(value.offer.deadline))
    ? { id: value.offer.id, years: clamp(month0(value.offer.years, 1), 1, 4), deadline: month0(value.offer.deadline) }
    : null;
  const cleanMap = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, month0(v)]));
  const seen = new Set();
  const coalitions = (Array.isArray(value.coalitions) ? value.coalitions : []).map((item, index) => {
    const isPlayer = item?.player === true;
    const members = [...new Set((Array.isArray(item?.members) ? item.members : []).filter((id) => typeof id === 'string'))].filter((id) => !seen.has(id)).slice(0, isPlayer ? PLAYER_BLOC_MAX_ALLIES : COALITION_MAX_MEMBERS);
    members.forEach((id) => seen.add(id));
    return { id: typeof item?.id === 'string' ? item.id : `bloc${index + 1}`, name: typeof item?.name === 'string' && item.name ? item.name.slice(0, 60) : 'Coalizão', leader: members.includes(item?.leader) ? item.leader : members[0], members, formedMonth: month0(item?.formedMonth), colorIndex: clamp(month0(item?.colorIndex, index), 0, COALITION_COLORS.length - 1), player: isPlayer };
  }).filter((item) => item.members.length >= (item.player ? 1 : 2));
  const annexations = (Array.isArray(value.annexations) ? value.annexations : []).filter((item) => item && typeof item.by === 'string' && typeof item.victim === 'string').slice(-12).map((item) => ({ by: item.by, victim: item.victim, month: month0(item.month), covets: Array.isArray(item.covets) ? item.covets.filter((id) => typeof id === 'string').slice(0, 3) : [] }));
  return {
    pacts, offer, cooldowns: cleanMap(value.cooldowns), offerCooldowns: cleanMap(value.offerCooldowns),
    signed: Math.max(0, month0(value.signed)), broken: Math.max(0, month0(value.broken)),
    awake: value.awake === true, awakeMonth: month0(value.awakeMonth, -1), annexations, lastAnnexMonth: month0(value.lastAnnexMonth, -99),
    coalitions, lastFormMonth: month0(value.lastFormMonth, -99), coalitionWars: Math.max(0, month0(value.coalitionWars)),
    nextCoalitionId: Math.max(coalitions.length + 1, month0(value.nextCoalitionId, 1)), liberated: Math.max(0, month0(value.liberated)),
  };
}

const view = (state) => normalizeWorldOrder(state.worldOrder);
const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });
const setOrder = (state, order) => ({ ...state, worldOrder: order });
const monthOf = (state) => Number(state.monthCounter) || 0;

function isActive(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

const idSalt = (id) => [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0);

function isFriendly(state, contact) {
  return Boolean(contact.alliance) || (state.player_alliance ?? []).includes(contact.id) || (Boolean(contact.puppet) && contact.is_puppet_of === 'jogador');
}

// Paises ainda "no jogo": nem destruidos, nem anexados por voce, nem por outra potencia.
function isLive(contact) {
  return !contact.destruido && !contact.anexado && !contact.annexed && !contact.wasteland && !contact.annexedBy;
}

// ---------- consultas ----------
export function hasPact(state, contactId) {
  const pact = state.worldOrder?.pacts?.[contactId];
  return Boolean(pact) && pact.end > monthOf(state);
}

export function getPact(state, contactId) {
  return hasPact(state, contactId) ? state.worldOrder.pacts[contactId] : null;
}

export function listPacts(state) {
  const now = monthOf(state);
  return Object.entries(view(state).pacts).filter(([, pact]) => pact.end > now).map(([id, pact]) => ({ id, name: findContact(state, id)?.name ?? id, ...pact, monthsLeft: pact.end - now })).sort((a, b) => a.end - b.end);
}

export function isAwake(state) {
  return state.worldOrder?.awake === true;
}

export function getCoalitionOf(state, contactId) {
  return (state.worldOrder?.coalitions ?? []).find((item) => item.members.includes(contactId)) ?? null;
}

export function coalitionColor(coalition) {
  return COALITION_COLORS[coalition?.colorIndex ?? 0] ?? COALITION_COLORS[0];
}

// Atacantes de coalizao reunem apoio dos outros membros.
export function getCoalitionBonus(state, contactId) {
  const coalition = getCoalitionOf(state, contactId);
  return coalition ? 1 + (0.12 * (coalition.members.length - 1)) : 1;
}

export function getAnnexedByRivals(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.annexedBy);
}

// ---------- pactos ----------
export function getPactChance(state, contactId, years = 1) {
  const contact = findContact(state, contactId);
  if (!contact) return 0;
  const relation = Number(contact.relation) || 0;
  return clamp(0.32 + (relation / 150) + (contact.tradeTreaty ? 0.1 : 0) - (0.05 * (years - 1)), 0.05, 0.92);
}

export function getPactStatus(state, contactId, years = 1) {
  const contact = findContact(state, contactId);
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  if (!contact || !isLive(contact)) return { available: false, reason: 'País fora do jogo.' };
  if (contact.atWar) return { available: false, reason: 'Em guerra: só um tratado de paz encerra o conflito.' };
  if (isFriendly(state, contact)) return { available: false, reason: 'Já é aliado ou fantoche seu.' };
  if (hasPact(state, contactId)) return { available: false, reason: 'Já existe um pacto em vigor.' };
  if (listPacts(state).length >= MAX_ACTIVE_PACTS) return { available: false, reason: `Limite de ${MAX_ACTIVE_PACTS} pactos simultâneos.` };
  if ((Number(contact.relation) || 0) < -40) return { available: false, reason: 'A relação está ruim demais para negociar um pacto.' };
  const cooldown = view(state).cooldowns[contactId];
  if (Number.isFinite(cooldown) && cooldown > monthOf(state)) return { available: false, reason: `Recusou recentemente: tente de novo em ${cooldown - monthOf(state)} mês(es).` };
  return { available: true, reason: '', chance: getPactChance(state, contactId, years) };
}

function signPact(state, contactId, years, relationBonus) {
  const order = view(state);
  const month = monthOf(state);
  const next = patchContact(state, contactId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) + relationBonus, -100, 100) }));
  return setOrder(next, { ...order, pacts: { ...order.pacts, [contactId]: { start: month, end: month + (years * 12), years } }, signed: order.signed + 1, offer: order.offer?.id === contactId ? null : order.offer });
}

export function proposePact(state, contactId, years = 1) {
  const length = PACT_YEARS.includes(Number(years)) ? Number(years) : 1;
  const status = getPactStatus(state, contactId, length);
  if (!status.available) return { ...state, notice: status.reason };
  const contact = findContact(state, contactId);
  const month = monthOf(state);
  const accepted = hash(month, 811 + idSalt(contactId), state) < status.chance;
  if (!accepted) {
    const order = view(state);
    const next = patchContact(state, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) - 3, -100, 100) }));
    return { ...setOrder(next, { ...order, cooldowns: { ...order.cooldowns, [contactId]: month + PACT_REFUSAL_COOLDOWN } }), notice: `${contact.name} recusou o pacto de não agressão (chance era ${Math.round(status.chance * 100)}%). Nova tentativa em ${PACT_REFUSAL_COOLDOWN} meses.` };
  }
  return { ...signPact(state, contactId, length, 8), notice: `${contact.name} assinou um pacto de não agressão de ${length} ano(s): sem guerra nem ataques entre vocês até ${12 * length} meses à frente.` };
}

function applyBreak(state, contactId, penalty) {
  const order = view(state);
  const { [contactId]: removed, ...pacts } = order.pacts;
  let next = setOrder(state, { ...order, pacts, broken: order.broken + 1, cooldowns: { ...order.cooldowns, [contactId]: monthOf(state) + 24 } });
  if (penalty.onu) next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) - penalty.onu, 0, 100) } };
  if (penalty.others) next = { ...next, geopolitics: { ...next.geopolitics, contacts: next.geopolitics.contacts.map((contact) => (contact.id === contactId || !isLive(contact) ? contact : { ...contact, relation: clamp((Number(contact.relation) || 0) - penalty.others, -100, 100) })) } };
  return next;
}

// Rompimento voluntario: custa um pouco de imagem.
export function breakPact(state, contactId) {
  if (!hasPact(state, contactId)) return { ...state, notice: 'Não há pacto em vigor com esse país.' };
  const name = findContact(state, contactId)?.name ?? contactId;
  const next = applyBreak(state, contactId, { onu: 5, others: 2 });
  return { ...patchContact(next, contactId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) - 25, -100, 100) })), notice: `Você rompeu o pacto com ${name}: a relação despencou e o mundo notou (ONU −5).` };
}

// Declarar guerra a quem assinou pacto com voce e traicao: ONU e todas as relacoes sofrem.
export function penalizePactWar(state, contactId) {
  if (!hasPact(state, contactId)) return state;
  const name = findContact(state, contactId)?.name ?? contactId;
  return { ...applyBreak(state, contactId, { onu: BREAK_ONU_PENALTY, others: 6 }), notice: `Você violou o pacto de não agressão com ${name}: a ONU caiu ${BREAK_ONU_PENALTY} pontos e o mundo desconfia de você.` };
}

export function answerPactOffer(state, accept) {
  const order = view(state);
  const offer = order.offer;
  if (!offer) return { ...state, notice: 'Nenhuma proposta de pacto pendente.' };
  const contact = findContact(state, offer.id);
  const month = monthOf(state);
  if (!contact || !isLive(contact) || contact.atWar) return { ...setOrder(state, { ...order, offer: null }), notice: 'A proposta perdeu o sentido.' };
  if (accept) {
    if (listPacts(state).length >= MAX_ACTIVE_PACTS) return { ...state, notice: `Limite de ${MAX_ACTIVE_PACTS} pactos simultâneos.` };
    return { ...signPact(state, offer.id, offer.years, 6), notice: `Pacto de não agressão de ${offer.years} ano(s) assinado com ${contact.name}.` };
  }
  const next = patchContact(state, offer.id, (item) => ({ relation: clamp((Number(item.relation) || 0) - 2, -100, 100) }));
  return { ...setOrder(next, { ...order, offer: null, offerCooldowns: { ...order.offerCooldowns, [offer.id]: month + 8 } }), notice: `Você recusou o pacto oferecido por ${contact.name}.` };
}

// Pactos cumpridos ha mais de um ano aquecem o comercio: bonus mensal em caixa por pacto.
export function getPactTradeBonus(state) {
  const now = monthOf(state);
  const gdp = Number(state.economy?.gdp) || 0;
  const mature = listPacts(state).filter((item) => now - item.start >= PACT_TRADE_AFTER).length;
  return (gdp / 12) * PACT_TRADE_RATE * mature;
}

export function getRenewStatus(state, contactId) {
  const pact = getPact(state, contactId);
  if (!pact) return { available: false, reason: 'Sem pacto em vigor.' };
  const left = pact.end - monthOf(state);
  if (left > RENEW_WINDOW_MONTHS) return { available: false, reason: `Só dá para renovar nos últimos ${RENEW_WINDOW_MONTHS} meses (faltam ${left}).` };
  return { available: true, reason: '', left, chance: clamp(getPactChance(state, contactId, 1) + 0.3, 0.3, 0.95) };
}

export function renewPact(state, contactId, years = 1) {
  const length = PACT_YEARS.includes(Number(years)) ? Number(years) : 1;
  const status = getRenewStatus(state, contactId);
  if (!status.available) return { ...state, notice: status.reason };
  const contact = findContact(state, contactId);
  const order = view(state);
  const month = monthOf(state);
  const chance = clamp(status.chance - (0.05 * (length - 1)), 0.2, 0.95);
  if (hash(month, 911 + idSalt(contactId), state) >= chance) {
    return { ...setOrder(state, { ...order, cooldowns: { ...order.cooldowns, [`r_${contactId}`]: month + 3 } }), notice: `${contact.name} não quis renovar agora (chance era ${Math.round(chance * 100)}%).` };
  }
  const pact = order.pacts[contactId];
  const end = Math.min(pact.end + (length * 12), month + 48);
  const next = patchContact(state, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) + 5, -100, 100) }));
  return { ...setOrder(next, { ...order, pacts: { ...order.pacts, [contactId]: { ...pact, end, years: clamp(Math.ceil((end - pact.start) / 12), 1, 4) } } }), notice: `Pacto com ${contact.name} renovado até ${end - month} mês(es) à frente (relação +5).` };
}

function processPacts(state) {
  const month = monthOf(state);
  let next = state;
  const notes = [];
  let order = view(next);
  for (const [id, pact] of Object.entries(order.pacts)) {
    const name = findContact(next, id)?.name ?? id;
    const contact = findContact(next, id);
    if (contact && (contact.atWar || !isLive(contact))) {
      const { [id]: gone, ...rest } = order.pacts;
      order = { ...order, pacts: rest };
      continue;
    }
    if (pact.end <= month) {
      const { [id]: gone, ...rest } = order.pacts;
      order = { ...order, pacts: rest };
      notes.push(`O pacto de não agressão com ${name} expirou. Proponha um novo se quiser manter a paz.`);
    } else if (pact.end - month === RENEW_WINDOW_MONTHS) {
      notes.push(`O pacto com ${name} expira em ${RENEW_WINDOW_MONTHS} meses: já dá para renová-lo na aba Diplomacia.`);
    } else if (pact.end - month === 3) {
      notes.push(`O pacto com ${name} expira em 3 meses.`);
    }
  }
  // oferta pendente vence
  if (order.offer && order.offer.deadline <= month) {
    order = { ...order, offerCooldowns: { ...order.offerCooldowns, [order.offer.id]: month + 8 }, offer: null };
    notes.push('A proposta de pacto expirou sem resposta.');
  }
  // nova oferta de uma IA
  if (!order.offer && month >= 3 && hash(month, 431, next) < PACT_OFFER_CHANCE && Object.keys(order.pacts).length < MAX_ACTIVE_PACTS) {
    const pool = (next.geopolitics.contacts ?? [])
      .filter((contact) => isLive(contact) && !contact.atWar && !isFriendly(next, contact) && !order.pacts[contact.id] && (Number(contact.relation) || 0) >= 10 && (Number(contact.militaryPower) || 0) >= 5 && !((order.offerCooldowns[contact.id] ?? -1) > month) && !((order.cooldowns[contact.id] ?? -1) > month))
      .sort((a, b) => (Number(b.relation) || 0) - (Number(a.relation) || 0)).slice(0, 8);
    if (pool.length) {
      const pick = pool[Math.floor(hash(month, 457, next) * pool.length) % pool.length];
      const years = 1 + (Math.floor(hash(month, 463, next) * 4) % 4);
      order = { ...order, offer: { id: pick.id, years, deadline: month + PACT_OFFER_DEADLINE } };
      notes.push(`${pick.name} propõe um pacto de não agressão de ${years} ano(s). Responda na aba Diplomacia.`);
    }
  }
  next = setOrder(next, order);
  const bonus = getPactTradeBonus(next);
  if (bonus > 0) next = { ...next, economy: { ...next.economy, cash: (Number(next.economy.cash) || 0) + bonus } };
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}

// ---------- potencias rivais ----------
function annexedCount(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.anexado).length;
}

function protectedByCoalition(state, aggressor, victim) {
  const coalition = getCoalitionOf(state, victim.id);
  if (!coalition) return false;
  const others = coalition.members.filter((id) => id !== victim.id).map((id) => findContact(state, id)).filter(Boolean);
  const total = others.reduce((sum, contact) => sum + (Number(contact.militaryPower) || 0), Number(victim.militaryPower) || 0);
  return (Number(aggressor.militaryPower) || 0) <= total * 1.2;
}

// Candidatos a ser anexados por um agressor, do mais provavel ao menos. Recursos que o agressor nao tem pesam a favor.
function victimCandidates(state, aggressor, order) {
  const treatyTarget = state.geopolitics?.peaceTreaty?.targetId;
  const mine = getCoalitionOf(state, aggressor.id);
  const nuclearIds = Object.keys(state.nuclearRace?.programs ?? {});
  const owned = new Set(getSpecialties(aggressor.id));
  return (state.geopolitics.contacts ?? [])
    .filter((contact) => contact.id !== aggressor.id && isLive(contact) && !isFriendly(state, contact) && !contact.atWar && contact.id !== treatyTarget
      && !nuclearIds.includes(contact.id) && state.tradeWar?.active?.aggressorId !== contact.id
      && (Number(contact.militaryPower) || 0) < (Number(aggressor.militaryPower) || 0) * 0.7
      && distanceKm(aggressor.id, contact.id) <= ANNEX_MAX_KM
      && !(mine && mine.members.includes(contact.id))
      && !protectedByCoalition(state, aggressor, contact))
    .map((contact) => {
      const covets = getSpecialties(contact.id).filter((id) => !owned.has(id));
      const score = (distanceKm(aggressor.id, contact.id) / 1000) + ((Number(contact.militaryPower) || 0) / Math.max(1, Number(aggressor.militaryPower) || 1)) * 4 - (covets.length * 2.5);
      return { contact, score, covets };
    })
    .sort((a, b) => a.score - b.score);
}

// Radar: o alvo preferido das maiores potencias (para o jogador agir antes).
export function getRivalTargets(state, limit = 3) {
  const order = view(state);
  const aggressors = (state.geopolitics?.contacts ?? [])
    .filter((contact) => isLive(contact) && !isFriendly(state, contact) && (Number(contact.militaryPower) || 0) >= 25)
    .sort((a, b) => (Number(b.militaryPower) || 0) - (Number(a.militaryPower) || 0)).slice(0, 6);
  const targets = [];
  for (const aggressor of aggressors) {
    const best = victimCandidates(state, aggressor, order)[0];
    if (best && !targets.some((item) => item.victimId === best.contact.id)) targets.push({ aggressorId: aggressor.id, aggressorName: aggressor.name, victimId: best.contact.id, victimName: best.contact.name, covets: best.covets });
  }
  return targets.slice(0, limit);
}

function rivalAnnex(state, order, month) {
  const aggressors = (state.geopolitics.contacts ?? [])
    .filter((contact) => isLive(contact) && !isFriendly(state, contact) && (Number(contact.militaryPower) || 0) >= 25)
    .sort((a, b) => (Number(b.militaryPower) || 0) - (Number(a.militaryPower) || 0)).slice(0, 10);
  if (!aggressors.length) return { state, order };
  const aggressor = aggressors[Math.floor(hash(month, 521, state) * aggressors.length) % aggressors.length];
  const victims = victimCandidates(state, aggressor, order).slice(0, 3);
  if (!victims.length) return { state, order };
  const pick = victims[Math.floor(hash(month, 547, state) * victims.length) % victims.length];
  const victim = pick.contact;
  let next = patchContact(state, victim.id, { destruido: true, annexedBy: aggressor.id, militaryPower: 0, atWar: false });
  next = patchContact(next, aggressor.id, (item) => ({
    pib_base: (Number(item.pib_base) || 0) + ((Number(victim.pib_base) || 0) * 0.8),
    population: (Number(item.population) || 0) + (Number(victim.population) || 0),
    militaryPower: clamp((Number(item.militaryPower) || 0) + 3 + ((Number(victim.militaryPower) || 0) * 0.2), 0, 100),
    annexationsMade: (Number(item.annexationsMade) || 0) + 1,
  }));
  const { [victim.id]: removedPact, ...pacts } = order.pacts;
  const updated = { ...order, pacts, lastAnnexMonth: month, annexations: [...order.annexations, { by: aggressor.id, victim: victim.id, month, covets: pick.covets }].slice(-12) };
  const reason = pick.covets.length ? ` de olho em ${pick.covets.map((id) => SPECIALTIES[id]?.long ?? id).join(' e ')}` : '';
  return { state: { ...next, notice: `${aggressor.name} anexou ${victim.name}${reason}. As potências agora disputam o mapa.` }, order: updated };
}

// ---------- coalizoes ----------
function cleanCoalitions(state, order) {
  const notes = [];
  const coalitions = order.coalitions.map((coalition) => {
    const members = coalition.members.filter((id) => {
      const contact = findContact(state, id);
      const ok = contact && isLive(contact) && (coalition.player ? isFriendly(state, contact) : !isFriendly(state, contact));
      if (!ok && contact && !contact.destruido) notes.push(`${contact.name} deixou a coalizão ${coalition.name}.`);
      return ok;
    });
    return { ...coalition, members, leader: members.includes(coalition.leader) ? coalition.leader : members[0] };
  }).filter((coalition) => {
    if (coalition.members.length >= (coalition.player ? 1 : 2)) return true;
    notes.push(`A coalizão ${coalition.name} se desfez.`);
    return false;
  });
  return { order: { ...order, coalitions }, notes };
}

function formCoalition(state, order, month) {
  const taken = new Set(order.coalitions.flatMap((item) => item.members));
  const pool = (state.geopolitics.contacts ?? []).filter((contact) => isLive(contact) && !isFriendly(state, contact) && !taken.has(contact.id) && (Number(contact.militaryPower) || 0) >= 8 && (Number(contact.relation) || 0) < 70);
  const leaders = [...pool].filter((contact) => (Number(contact.militaryPower) || 0) >= 20).sort((a, b) => (Number(b.militaryPower) || 0) - (Number(a.militaryPower) || 0)).slice(0, 5);
  if (!leaders.length) return { state, order };
  const leader = leaders[Math.floor(hash(month, 601, state) * leaders.length) % leaders.length];
  const near = pool.filter((contact) => contact.id !== leader.id && distanceKm(leader.id, contact.id) <= 8000).sort((a, b) => distanceKm(leader.id, a.id) - distanceKm(leader.id, b.id)).slice(0, COALITION_MAX_MEMBERS - 1);
  if (near.length + 1 < COALITION_MIN_MEMBERS) return { state, order };
  const used = new Set(order.coalitions.map((item) => item.colorIndex));
  const colorIndex = COALITION_COLORS.findIndex((_, index) => !used.has(index));
  const members = [leader.id, ...near.map((contact) => contact.id)];
  const coalition = { id: `bloc${order.nextCoalitionId}`, name: `Pacto de Defesa de ${leader.name}`, leader: leader.id, members, formedMonth: month, colorIndex: colorIndex < 0 ? 0 : colorIndex };
  let next = state;
  members.forEach((id) => { next = patchContact(next, id, (contact) => ({ relation: clamp((Number(contact.relation) || 0) - 6, -100, 100) })); });
  return { state: { ...next, notice: `Nasce a coalizão "${coalition.name}" (${members.length} países): atacar um membro é atacar todos.` }, order: { ...order, coalitions: [...order.coalitions, coalition], lastFormMonth: month, nextCoalitionId: order.nextCoalitionId + 1 } };
}

function growCoalitions(state, order, month) {
  const taken = new Set(order.coalitions.flatMap((item) => item.members));
  let notice = null;
  const coalitions = order.coalitions.map((coalition, index) => {
    if (coalition.player || coalition.members.length >= COALITION_MAX_MEMBERS || hash(month, 677 + (index * 13), state) >= COALITION_GROW_CHANCE) return coalition;
    const candidate = (state.geopolitics.contacts ?? []).filter((contact) => isLive(contact) && !isFriendly(state, contact) && !taken.has(contact.id) && (Number(contact.militaryPower) || 0) >= 8 && (Number(contact.relation) || 0) < 70 && distanceKm(coalition.leader, contact.id) <= 6500)
      .sort((a, b) => distanceKm(coalition.leader, a.id) - distanceKm(coalition.leader, b.id))[0];
    if (!candidate) return coalition;
    taken.add(candidate.id);
    notice = `${candidate.name} entrou na coalizão ${coalition.name} (${coalition.members.length + 1}/${COALITION_MAX_MEMBERS}).`;
    return { ...coalition, members: [...coalition.members, candidate.id] };
  });
  return { order: { ...order, coalitions }, notice };
}

// Defesa coletiva: se um membro esta em guerra com voce, todos os outros (que nao sao seus amigos) entram na guerra.
export function coalitionRespond(state) {
  if (!isActive(state)) return state;
  const order = view(state);
  let next = state;
  let nextOrder = order;
  const notes = [];
  for (const coalition of order.coalitions) {
    if (coalition.player) continue;
    const warring = coalition.members.map((id) => findContact(next, id)).filter((contact) => contact?.atWar);
    if (!warring.length) continue;
    const joined = [];
    for (const id of coalition.members) {
      const contact = findContact(next, id);
      if (!contact || contact.atWar || !isLive(contact) || isFriendly(next, contact)) continue;
      next = patchContact(next, id, { atWar: true, atWarAgainst: state.country.id, warInitiator: id, defensiveWar: true, relation: -100 });
      if (nextOrder.pacts[id]) {
        const { [id]: gone, ...pacts } = nextOrder.pacts;
        nextOrder = { ...nextOrder, pacts, broken: nextOrder.broken + 1 };
      }
      joined.push(contact.name);
    }
    if (joined.length) {
      nextOrder = { ...nextOrder, coalitionWars: nextOrder.coalitionWars + 1 };
      notes.push(`${coalition.name} acionou a defesa coletiva: ${joined.join(', ')} declararam guerra contra você.`);
    }
  }
  return notes.length ? { ...setOrder(next, nextOrder), notice: notes.join(' '), defconPeacefulMonths: 0 } : state;
}

// ---------- ciclo mensal ----------
export function processWorldOrder(state) {
  if (!isActive(state)) return state;
  const month = monthOf(state);
  let next = processPacts(state);
  let order = view(next);
  const notes = [];
  if (!order.awake && Math.max(annexedCount(next), (next.geopolitics.annexedCountryIds ?? []).length) >= AWAKEN_ANNEXATIONS) {
    order = { ...order, awake: true, awakeMonth: month };
    notes.push(`Com ${AWAKEN_ANNEXATIONS} países anexados por você, o mundo reage: potências passam a anexar vizinhos, formar coalizões e cobiçar seus territórios.`);
  }
  {
    const cleaned = cleanCoalitions(next, order);
    order = cleaned.order;
    notes.push(...cleaned.notes);
  }
  if (order.awake) {
    if (month - order.lastAnnexMonth >= ANNEX_COOLDOWN_MONTHS && hash(month, 503, next) < ANNEX_MONTHLY_CHANCE) {
      const result = rivalAnnex(next, order, month);
      if (result.order !== order) notes.push(result.state.notice);
      next = result.state;
      order = result.order;
    }
    if (order.coalitions.filter((item) => !item.player).length < COALITION_MAX_COUNT && month - order.lastFormMonth >= COALITION_FORM_COOLDOWN && hash(month, 587, next) < COALITION_FORM_CHANCE) {
      const result = formCoalition(next, order, month);
      if (result.order !== order) notes.push(result.state.notice);
      next = result.state;
      order = result.order;
    }
    const grown = growCoalitions(next, order, month);
    order = grown.order;
    if (grown.notice) notes.push(grown.notice);
  }
  next = coalitionRespond(setOrder(next, order));
  if (next.notice && next.notice !== state.notice && !notes.includes(next.notice)) notes.push(next.notice);
  return notes.length ? { ...next, notice: [...new Set(notes)].join(' ') } : next;
}

// ---------- contra-acoes: subornar membros e fundar o proprio bloco ----------
const gdpOf = (state) => Number(state.economy?.gdp) || 0;

export function getBribeStatus(state, contactId) {
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  const coalition = getCoalitionOf(state, contactId);
  const contact = findContact(state, contactId);
  if (!coalition || coalition.player || !contact) return { available: false, reason: 'Não é membro de uma coalizão rival.' };
  const cooldown = view(state).cooldowns[`b_${contactId}`];
  if (Number.isFinite(cooldown) && cooldown > monthOf(state)) return { available: false, reason: `Tentativa recente: aguarde ${cooldown - monthOf(state)} mês(es).` };
  const cost = Math.round(gdpOf(state) * BRIBE_COST_RATE);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente.', cost };
  const chance = clamp(0.25 + ((Number(contact.relation) || 0) / 200) + (coalition.members.length <= 3 ? 0.12 : 0) - (coalition.leader === contactId ? 0.15 : 0), 0.08, 0.8);
  return { available: true, reason: '', cost, chance, coalition };
}

export function bribeMember(state, contactId) {
  const status = getBribeStatus(state, contactId);
  if (!status.available) return { ...state, notice: status.reason };
  const contact = findContact(state, contactId);
  const order = view(state);
  const month = monthOf(state);
  const paid = { ...state, economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost } };
  const cooled = { ...order, cooldowns: { ...order.cooldowns, [`b_${contactId}`]: month + BRIBE_COOLDOWN } };
  if (hash(month, 977 + idSalt(contactId), state) >= status.chance) {
    const next = patchContact(paid, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) - 8, -100, 100) }));
    return { ...setOrder(next, cooled), notice: `${contact.name} recusou o suborno e o escândalo vazou (relação −8). Chance era ${Math.round(status.chance * 100)}%.` };
  }
  const left = { ...cooled, coalitions: cooled.coalitions.map((item) => (item.id === status.coalition.id ? { ...item, members: item.members.filter((id) => id !== contactId), leader: item.leader === contactId ? item.members.find((id) => id !== contactId) : item.leader } : item)) };
  const cleaned = cleanCoalitions(patchContact(paid, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) + 15, -100, 100) })), left);
  const extra = cleaned.notes.length ? ` ${cleaned.notes.join(' ')}` : '';
  return { ...setOrder(patchContact(paid, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) + 15, -100, 100) })), cleaned.order), notice: `${contact.name} deixou a coalizão ${status.coalition.name} após negociações discretas (relação +15).${extra}` };
}

export function getPlayerBloc(state) {
  return (state.worldOrder?.coalitions ?? []).find((item) => item.player) ?? null;
}

export function getInviteStatus(state, contactId) {
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  const contact = findContact(state, contactId);
  if (!contact || !isLive(contact)) return { available: false, reason: 'País fora do jogo.' };
  if (!contact.alliance) return { available: false, reason: 'Só aliados formais entram no seu bloco.' };
  if (contact.atWar) return { available: false, reason: 'Em guerra.' };
  const bloc = getPlayerBloc(state);
  if (bloc?.members.includes(contactId)) return { available: false, reason: 'Já está no seu bloco.', inBloc: true };
  if (getCoalitionOf(state, contactId)) return { available: false, reason: 'Já pertence a outra coalizão.' };
  if (bloc && bloc.members.length >= PLAYER_BLOC_MAX_ALLIES) return { available: false, reason: `Seu bloco já tem ${PLAYER_BLOC_MAX_ALLIES} aliados (limite de ${COALITION_MAX_MEMBERS} países com você).` };
  const cost = bloc ? 0 : Math.round(gdpOf(state) * BLOC_FOUND_COST_RATE);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente para fundar o bloco.', cost };
  return { available: true, reason: '', cost, founding: !bloc };
}

export function inviteToBloc(state, contactId) {
  const status = getInviteStatus(state, contactId);
  if (!status.available) return { ...state, notice: status.reason };
  const order = view(state);
  const contact = findContact(state, contactId);
  const paid = { ...state, economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost } };
  const next = patchContact(paid, contactId, (item) => ({ relation: clamp((Number(item.relation) || 0) + 6, -100, 100) }));
  if (status.founding) {
    const used = new Set(order.coalitions.map((item) => item.colorIndex));
    const colorIndex = Math.max(0, COALITION_COLORS.findIndex((_, index) => !used.has(index)));
    const bloc = { id: `bloc${order.nextCoalitionId}`, name: `Bloco de ${state.country?.nome ?? 'você'}`, leader: contactId, members: [contactId], formedMonth: monthOf(state), colorIndex, player: true };
    return { ...setOrder(next, { ...order, coalitions: [...order.coalitions, bloc], nextCoalitionId: order.nextCoalitionId + 1 }), notice: `Você fundou o "${bloc.name}" com ${contact.name}: membros se protegem da anexação rival e reforçam a defesa dos seus territórios.` };
  }
  return { ...setOrder(next, { ...order, coalitions: order.coalitions.map((item) => (item.player ? { ...item, members: [...item.members, contactId] } : item)) }), notice: `${contact.name} entrou no seu bloco.` };
}

export function leaveBloc(state, contactId) {
  const bloc = getPlayerBloc(state);
  if (!bloc?.members.includes(contactId)) return { ...state, notice: 'Esse país não está no seu bloco.' };
  const order = view(state);
  const members = bloc.members.filter((id) => id !== contactId);
  const coalitions = members.length ? order.coalitions.map((item) => (item.player ? { ...item, members, leader: members.includes(item.leader) ? item.leader : members[0] } : item)) : order.coalitions.filter((item) => !item.player);
  return { ...setOrder(state, { ...order, coalitions }), notice: `${findContact(state, contactId)?.name ?? contactId} saiu do seu bloco.${members.length ? '' : ' O bloco foi dissolvido.'}` };
}

export function dissolveBloc(state) {
  const bloc = getPlayerBloc(state);
  if (!bloc) return { ...state, notice: 'Você não tem um bloco.' };
  const order = view(state);
  return { ...setOrder(state, { ...order, coalitions: order.coalitions.filter((item) => !item.player) }), notice: `O ${bloc.name} foi dissolvido.` };
}

// Forca dos membros do bloco somada a defesa dos territorios.
export function getBlocSupport(state) {
  const bloc = getPlayerBloc(state);
  if (!bloc) return 0;
  return bloc.members.reduce((sum, id) => sum + ((Number(findContact(state, id)?.militaryPower) || 0) * 0.08), 0);
}

// ---------- libertar paises anexados por rivais ----------
export function getLiberationStatus(state, victimId) {
  const victim = findContact(state, victimId);
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  if (!victim?.annexedBy) return { available: false, reason: 'Este país não foi anexado por um rival.' };
  const captor = findContact(state, victim.annexedBy);
  if (!captor || captor.destruido || captor.anexado) return { available: false, reason: 'O captor não está mais no jogo.' };
  if (!captor.atWar) return { available: false, reason: `Declare guerra a ${captor.name} para libertar ${victim.name}.` };
  const mine = getPoderTotal(state.military);
  const theirs = Number(captor.militaryPower) || 0;
  if (mine < theirs * 0.8) return { available: false, reason: `Suas forças (${mine.toFixed(0)}) ainda são fracas diante de ${captor.name} (${theirs.toFixed(0)}).` };
  const cost = Math.round(gdpOf(state) * LIBERATION_COST_RATE);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente para a campanha.', cost };
  return { available: true, reason: '', cost, captor };
}

export function liberateCountry(state, victimId, keep = false) {
  const status = getLiberationStatus(state, victimId);
  if (!status.available) return { ...state, notice: status.reason };
  const victim = findContact(state, victimId);
  const captor = status.captor;
  const fresh = createGeopolitics(state.country.id).contacts.find((item) => item.id === victimId) ?? {};
  const order = view(state);
  let next = { ...state, economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost } };
  next = patchContact(next, captor.id, (item) => ({
    militaryPower: Math.max(0, (Number(item.militaryPower) || 0) * 0.8),
    pib_base: Math.max(0, (Number(item.pib_base) || 0) - ((Number(fresh.pib_base) || 0) * 0.8)),
    population: Math.max(0, (Number(item.population) || 0) - (Number(fresh.population) || 0)),
  }));
  if (keep) {
    next = patchContact(next, victimId, { annexedBy: null, anexado: true, annexed: true, destruido: true, militaryPower: 0, relation: 0 });
    next = { ...next, geopolitics: { ...next.geopolitics, annexedCountryIds: [...new Set([...(next.geopolitics.annexedCountryIds ?? []), victimId])] }, factions: adjustFactions(next.factions, { militares: 1.5, elite: 0.5 }) };
    return { ...setOrder(next, { ...order, liberated: order.liberated + 1 }), notice: `${victim.name} foi arrancado de ${captor.name} e agora é território seu (campanha custou o equivalente a ${Math.round(LIBERATION_COST_RATE * 100)}% do PIB).` };
  }
  next = patchContact(next, victimId, { annexedBy: null, destruido: false, annexed: false, anexado: false, atWar: false, pib_base: fresh.pib_base ?? 0, population: fresh.population ?? 0, area_km2: fresh.area_km2 ?? 0, militaryPower: Math.max(5, Math.round((Number(fresh.militaryPower) || 10) * 0.4)), relation: 70 });
  next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) + 6, 0, 100) }, factions: adjustFactions(next.factions, { militares: 1, trabalhadores: 0.5 }) };
  return { ...setOrder(next, { ...order, liberated: order.liberated + 1 }), notice: `${victim.name} foi libertado de ${captor.name} e voltou a ser independente: relação +70 e a ONU aplaudiu (+6).` };
}
