// Contratos de guerra: a cada 8 meses um pais amigo pode oferecer uma recompensa para voce atacar um rival dele.
// Aceitar e um compromisso (prazo de 6 meses para declarar guerra ao alvo). Ao declarar:
//   + recompensa em caixa e +15 de relacao com quem encomendou;
//   - a ONU cai um pouco e a relacao com o alvo vai a -100.
// Se o prazo passa sem ataque, o contratante se ofende.
import { getDifficulty } from './difficulty.js';
import { distanceKm, getSupply } from './offensives.js';
import { getCoalitionOf, getPlayerBloc, hasPact } from './world_order.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const OFFER_INTERVAL_MONTHS = 8;
export const OFFER_FIRST_MONTH = 6;
export const OFFER_ANSWER_MONTHS = 3;
export const PLEDGE_MONTHS = 6;
export const OFFER_CHANCE = 0.6;
export const SPONSOR_RELATION_BONUS = 15;
export const ONU_PENALTY = 5;
export const BROKEN_PLEDGE_PENALTY = 10;
export const MIN_SPONSOR_RELATION = 20;
export const MAX_PROXY_ORDERS = 2;
export const PROXY_COOLDOWN_MONTHS = 6;
export const PROXY_LEAK_CHANCE = 0.4;

export function createContracts() {
  return { offer: null, active: null, lastOfferMonth: -99, fulfilled: 0, failed: 0, earned: 0, proxies: [], proxyCooldowns: {}, proxyWon: 0, proxyLost: 0, proxyRefused: 0 };
}

const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback);

function normalizeContract(value, extra = []) {
  if (!value || typeof value.sponsorId !== 'string' || typeof value.targetId !== 'string') return null;
  const result = { sponsorId: value.sponsorId, targetId: value.targetId, reward: Math.max(0, Number(value.reward) || 0), deadline: int(value.deadline) };
  for (const key of extra) result[key] = int(value[key]);
  return result;
}

export function normalizeContracts(value) {
  const base = createContracts();
  if (!value || typeof value !== 'object') return base;
  return {
    offer: normalizeContract(value.offer),
    active: normalizeContract(value.active),
    lastOfferMonth: int(value.lastOfferMonth, -99),
    fulfilled: Math.max(0, int(value.fulfilled)),
    failed: Math.max(0, int(value.failed)),
    earned: Math.max(0, Number(value.earned) || 0),
    proxies: (Array.isArray(value.proxies) ? value.proxies : []).map((item) => (item && typeof item.contractorId === 'string' && typeof item.targetId === 'string'
      ? { contractorId: item.contractorId, targetId: item.targetId, cost: Math.max(0, Number(item.cost) || 0), orderedMonth: int(item.orderedMonth), resolveMonth: int(item.resolveMonth) } : null)).filter(Boolean).slice(0, MAX_PROXY_ORDERS),
    proxyCooldowns: Object.fromEntries(Object.entries(value.proxyCooldowns ?? {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, int(v)])),
    proxyWon: Math.max(0, int(value.proxyWon)), proxyLost: Math.max(0, int(value.proxyLost)), proxyRefused: Math.max(0, int(value.proxyRefused)),
  };
}

const view = (state) => normalizeContracts(state.contracts);
const monthOf = (state) => Number(state.monthCounter) || 0;
const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function isActive(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function isFriendly(state, contact) {
  return Boolean(contact.alliance) || (state.player_alliance ?? []).includes(contact.id) || (Boolean(contact.puppet) && contact.is_puppet_of === 'jogador');
}

const isLive = (contact) => !contact.destruido && !contact.anexado && !contact.annexed && !contact.wasteland && !contact.annexedBy;

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

export function getReward(state, target) {
  const gdp = Number(state.economy?.gdp) || 0;
  const power = Number(target.militaryPower) || 0;
  return Math.round(gdp * clamp(0.015 + (power / 100) * 0.03, 0.015, 0.045) * getDifficulty(state).reward);
}

// Avisos mostrados na oferta (riscos de atacar esse alvo).
export function getContractWarnings(state, targetId) {
  const target = findContact(state, targetId);
  if (!target) return [];
  const warnings = [];
  const coalition = getCoalitionOf(state, targetId);
  if (coalition && !coalition.player) warnings.push(`Membro da coalizão ${coalition.name}: atacar traz todos os membros para a guerra.`);
  if (target.has_nukes) warnings.push('Potência nuclear: o risco de escalada no DEFCON é alto.');
  if ((Number(target.militaryPower) || 0) >= 40) warnings.push('Exército forte: a guerra tende a ser longa.');
  return warnings;
}

function pickOffer(state, month) {
  const contacts = state.geopolitics.contacts ?? [];
  const bloc = getPlayerBloc(state);
  const sponsors = contacts
    .filter((contact) => isLive(contact) && !contact.atWar && (Number(contact.relation) || 0) >= MIN_SPONSOR_RELATION && (Number(contact.militaryPower) || 0) >= 5)
    .sort((a, b) => (Number(b.relation) || 0) - (Number(a.relation) || 0)).slice(0, 12);
  if (!sponsors.length) return null;
  const sponsor = sponsors[Math.floor(hash(month, 1301, state) * sponsors.length) % sponsors.length];
  const sponsorCoalition = getCoalitionOf(state, sponsor.id);
  const targets = contacts
    .filter((contact) => contact.id !== sponsor.id && isLive(contact) && !contact.atWar && !isFriendly(state, contact) && !hasPact(state, contact.id)
      && !(bloc && bloc.members.includes(contact.id)) && !(sponsorCoalition && sponsorCoalition.members.includes(contact.id))
      && (Number(contact.militaryPower) || 0) <= (Number(sponsor.militaryPower) || 0) * 1.2 + 10
      && distanceKm(sponsor.id, contact.id) <= 7000)
    .sort((a, b) => distanceKm(sponsor.id, a.id) - distanceKm(sponsor.id, b.id)).slice(0, 6);
  if (!targets.length) return null;
  const target = targets[Math.floor(hash(month, 1303, state) * targets.length) % targets.length];
  return { sponsorId: sponsor.id, targetId: target.id, reward: getReward(state, target), deadline: month + OFFER_ANSWER_MONTHS };
}

export function answerContractOffer(state, accept) {
  const data = view(state);
  const offer = data.offer;
  if (!offer) return { ...state, notice: 'Nenhuma oferta pendente.' };
  const sponsor = findContact(state, offer.sponsorId);
  const target = findContact(state, offer.targetId);
  const month = monthOf(state);
  if (!accept) return { ...state, contracts: { ...data, offer: null }, notice: `Você recusou a oferta de ${sponsor?.name ?? offer.sponsorId}.` };
  if (data.active) return { ...state, notice: 'Você já tem um contrato em andamento.' };
  if (!target || !isLive(target) || target.atWar || !sponsor) return { ...state, contracts: { ...data, offer: null }, notice: 'A oferta perdeu o sentido.' };
  return { ...state, contracts: { ...data, offer: null, active: { ...offer, deadline: month + PLEDGE_MONTHS } }, notice: `Contrato aceito: declare guerra a ${target.name} em até ${PLEDGE_MONTHS} meses para receber a recompensa de ${sponsor.name}.` };
}

// Chamada quando o jogador declara guerra a alguem (startWar).
export function fulfillContract(state, targetId) {
  const data = view(state);
  const active = data.active;
  if (!active || active.targetId !== targetId) return state;
  const sponsor = findContact(state, active.sponsorId);
  const target = findContact(state, targetId);
  let next = patchContact(state, active.sponsorId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) + SPONSOR_RELATION_BONUS, -100, 100) }));
  next = patchContact(next, targetId, { relation: -100 });
  next = {
    ...next,
    economy: { ...next.economy, cash: (Number(next.economy.cash) || 0) + active.reward },
    geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) - ONU_PENALTY, 0, 100) },
    contracts: { ...data, active: null, fulfilled: data.fulfilled + 1, earned: data.earned + active.reward },
  };
  return { ...next, notice: `${sponsor?.name ?? 'O contratante'} pagou o contrato pelo ataque a ${target?.name ?? targetId}: recompensa recebida e relação +${SPONSOR_RELATION_BONUS}. A ONU caiu ${ONU_PENALTY} pontos e ${target?.name ?? 'o alvo'} jamais perdoará.` };
}

export function processWarContracts(state) {
  if (!isActive(state)) return state;
  const month = monthOf(state);
  let data = view(state);
  let next = state;
  const notes = [];
  if (data.offer && data.offer.deadline <= month) {
    notes.push(`A oferta de ${findContact(next, data.offer.sponsorId)?.name ?? 'um país'} expirou sem resposta.`);
    data = { ...data, offer: null };
  }
  if (data.active) {
    const target = findContact(next, data.active.targetId);
    const sponsor = findContact(next, data.active.sponsorId);
    if (!target || !isLive(target) || target.atWar || !sponsor || !isLive(sponsor)) {
      data = { ...data, active: null };
      notes.push('O contrato de guerra foi cancelado: o alvo ou o contratante saiu do jogo ou a guerra já começou por outros motivos.');
    } else if (data.active.deadline <= month) {
      next = patchContact(next, data.active.sponsorId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) - BROKEN_PLEDGE_PENALTY, -100, 100) }));
      notes.push(`Você não atacou ${target.name} no prazo: ${sponsor.name} se sentiu enganado (relação −${BROKEN_PLEDGE_PENALTY}).`);
      data = { ...data, active: null, failed: data.failed + 1 };
    }
  }
  if (!data.offer && !data.active && month >= OFFER_FIRST_MONTH && month - data.lastOfferMonth >= OFFER_INTERVAL_MONTHS && hash(month, 1307, next) < OFFER_CHANCE) {
    const offer = pickOffer(next, month);
    if (offer) {
      data = { ...data, offer, lastOfferMonth: month };
      notes.push(`${findContact(next, offer.sponsorId).name} oferece uma recompensa para você atacar ${findContact(next, offer.targetId).name}. Responda na aba Diplomacia.`);
    }
  }
  next = { ...next, contracts: data };
  const proxied = processProxies(next);
  next = proxied.state;
  notes.push(...proxied.notes);
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}

// ---------- encomendar ataques: voce paga e um pais amigo ataca por voce ----------
export function getProxyContractors(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => isLive(contact) && !contact.atWar && (Number(contact.militaryPower) || 0) >= 8
    && (isFriendly(state, contact) || (Number(contact.relation) || 0) >= 40));
}

export function getProxyStatus(state, contractorId, targetId) {
  if (!isActive(state)) return { available: false, reason: 'Indisponível.' };
  const contractor = findContact(state, contractorId);
  const target = findContact(state, targetId);
  if (!contractor || !target || contractorId === targetId) return { available: false, reason: 'Escolha um país e um alvo diferentes.' };
  if (!isLive(contractor) || contractor.atWar) return { available: false, reason: 'O país não está em condições de lutar.' };
  if (!isLive(target)) return { available: false, reason: 'O alvo está fora do jogo.' };
  if (isFriendly(state, target) || hasPact(state, targetId)) return { available: false, reason: 'Não dá para encomendar ataque a aliado, fantoche ou parceiro de pacto.' };
  const bloc = getPlayerBloc(state);
  if (bloc && bloc.members.includes(targetId)) return { available: false, reason: 'O alvo está no seu bloco.' };
  if (!isFriendly(state, contractor) && (Number(contractor.relation) || 0) < 40) return { available: false, reason: 'Só aliados, fantoches ou países com relação de 40+ aceitam.' };
  if ((Number(contractor.militaryPower) || 0) < 8) return { available: false, reason: 'Exército pequeno demais.' };
  const mine = getCoalitionOf(state, contractorId);
  if (mine && mine.members.includes(targetId)) return { available: false, reason: 'Fazem parte da mesma coalizão.' };
  const data = view(state);
  if (data.proxies.length >= MAX_PROXY_ORDERS) return { available: false, reason: `Você já tem ${MAX_PROXY_ORDERS} ataques encomendados em andamento.` };
  if (data.proxies.some((item) => item.contractorId === contractorId)) return { available: false, reason: 'Esse país já está cumprindo uma encomenda sua.' };
  const cooldown = data.proxyCooldowns[contractorId];
  if (Number.isFinite(cooldown) && cooldown > monthOf(state)) return { available: false, reason: `Aguarde ${cooldown - monthOf(state)} mês(es) para pedir de novo a esse país.` };
  const cost = getReward(state, target);
  if ((Number(state.economy?.cash) || 0) < cost) return { available: false, reason: 'Caixa insuficiente.', cost };
  const km = distanceKm(contractorId, targetId);
  const ratio = (Number(contractor.militaryPower) || 0) / Math.max(1, Number(target.militaryPower) || 1);
  const chance = clamp(0.25 + ((Number(contractor.relation) || 0) / 200) + (isFriendly(state, contractor) ? 0.1 : 0) + clamp((ratio - 1) * 0.15, -0.2, 0.2) + 0.1 - (km > 6000 ? 0.15 : 0), 0.05, 0.9);
  return { available: true, reason: '', cost, chance, km };
}

export function orderProxyAttack(state, contractorId, targetId) {
  const status = getProxyStatus(state, contractorId, targetId);
  if (!status.available) return { ...state, notice: status.reason };
  const data = view(state);
  const month = monthOf(state);
  const contractor = findContact(state, contractorId);
  const target = findContact(state, targetId);
  if (hash(month, 1409 + [...contractorId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0), state) >= status.chance) {
    return { ...state, contracts: { ...data, proxyRefused: data.proxyRefused + 1, proxyCooldowns: { ...data.proxyCooldowns, [contractorId]: month + PROXY_COOLDOWN_MONTHS } }, notice: `${contractor.name} recusou atacar ${target.name} (chance era ${Math.round(status.chance * 100)}%). Nada foi cobrado.` };
  }
  const delay = clamp(Math.ceil(status.km / 4000) + 1, 2, 4);
  const order = { contractorId, targetId, cost: status.cost, orderedMonth: month, resolveMonth: month + delay };
  return { ...state, economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.cost }, contracts: { ...data, proxies: [...data.proxies, order] }, notice: `${contractor.name} aceitou atacar ${target.name} por ${formatCost(status.cost)}. O resultado sai em ${delay} meses.` };
}

const formatCost = (value) => `R$ ${(value / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;

function processProxies(state) {
  const data = view(state);
  const month = monthOf(state);
  if (!data.proxies.length) return { state, notes: [] };
  let next = state;
  let current = data;
  const notes = [];
  const remaining = [];
  for (const order of data.proxies) {
    if (order.resolveMonth > month) { remaining.push(order); continue; }
    const contractor = findContact(next, order.contractorId);
    const target = findContact(next, order.targetId);
    if (!contractor || !target || !isLive(contractor) || !isLive(target)) {
      notes.push('Um ataque encomendado foi cancelado: o contratado ou o alvo saiu do jogo.');
      continue;
    }
    const km = distanceKm(order.contractorId, order.targetId);
    const attack = (Number(contractor.militaryPower) || 0) * 0.6 * getSupply(km) * (0.8 + (hash(month, 1451 + km, next) * 0.4));
    const defense = Number(target.militaryPower) || 0;
    const won = attack >= defense * 0.9;
    current = { ...current, proxyCooldowns: { ...current.proxyCooldowns, [order.contractorId]: month + PROXY_COOLDOWN_MONTHS } };
    if (won) {
      const damage = Math.max(2, (Number(contractor.militaryPower) || 0) * 0.35);
      next = patchContact(next, order.targetId, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - damage), relation: clamp((Number(item.relation) || 0) - 20, -100, 100) }));
      next = patchContact(next, order.contractorId, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - 3), relation: clamp((Number(item.relation) || 0) + 10, -100, 100) }));
      current = { ...current, proxyWon: current.proxyWon + 1 };
      let line = `${contractor.name} atacou ${target.name} a seu pedido e venceu: o poder militar do alvo caiu ${damage.toFixed(1)} (relação com você +10).`;
      if (hash(month, 1481 + km, next) < PROXY_LEAK_CHANCE) {
        next = patchContact(next, order.targetId, (item) => ({ relation: clamp((Number(item.relation) || 0) - 35, -100, 100) }));
        next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) - 3, 0, 100) } };
        line += ` Mas vazou que você pagou: ${target.name} te culpa (relação −35) e a ONU caiu 3.`;
      } else {
        line += ' A encomenda não vazou.';
      }
      notes.push(line);
    } else {
      next = patchContact(next, order.contractorId, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - 8) }));
      next = patchContact(next, order.targetId, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - 2) }));
      current = { ...current, proxyLost: current.proxyLost + 1 };
      notes.push(`${contractor.name} atacou ${target.name} a seu pedido e fracassou: perdeu poder militar e o dinheiro não volta.`);
    }
  }
  return { state: { ...next, contracts: { ...current, proxies: remaining } }, notes };
}
