// Equipamentos militares: comprar do catalogo (F-16, F-22, submarinos, porta-avioes...) e enviar a aliados ou territorios.
// Regras reais:
//  - sem saida para o mar nao se compra nem se recebe equipamento naval;
//  - ativos estrategicos (submarino nuclear, porta-avioes, bombardeiro furtivo) nao se doam a aliados:
//    so ficam posicionados em territorio seu;
//  - alguns itens exigem tecnologia militar (misseis balisticos, propulsao nuclear).
// Aliado: o equipamento e doado (reforca o poder dele de forma permanente e melhora a relacao).
// Territorio: o equipamento fica posicionado la (continua seu, tem manutencao e pode ser retirado), reforcando a defesa.
import { EQUIPMENT, EQUIPMENT_LIST, isLandlocked, normalizeEquipmentMap, sumFirepower } from '../data/military_equipment.js';
import { getDeploymentKind } from './deployments.js';
import { normalizeMilitary } from './military.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const ALLY_GIFT_FACTOR = 0.5;
export const ALLY_GIFT_CAP = 30;
export const SHIPPING_COST_RATE = 0.02;

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

export function getOwned(state, itemId) {
  return Number(state.military?.equipment?.[itemId]) || 0;
}

export function getAbroad(state, contactId) {
  return state.military?.equipmentAbroad?.[contactId] ?? {};
}

export function getAbroadTotal(state, itemId) {
  return Object.values(state.military?.equipmentAbroad ?? {}).reduce((sum, map) => sum + (Number(map?.[itemId]) || 0), 0);
}

// Poder de fogo dos equipamentos posicionados num territorio (entra na defesa e na ofensiva da base).
export function getEquipmentPowerAt(state, contactId) {
  const readiness = clamp(Number(state.military?.readiness) || 1, 0.5, 1.8);
  return sumFirepower(getAbroad(state, contactId)) * readiness;
}

function techUnlocked(state, tech) {
  if (!tech) return true;
  const unlocked = new Set(state.unlocked_techs ?? []);
  if (tech === 'nuke') return unlocked.has('nuke') || Boolean(state.military?.nuclear?.civilOnline) || state.country?.has_nukes === true;
  return unlocked.has(tech);
}

const TECH_LABELS = Object.freeze({ missiles: 'Mísseis balísticos', nuke: 'Enriquecimento de urânio ou energia nuclear civil' });

export function getBuyStatus(state, itemId) {
  const item = EQUIPMENT[itemId];
  if (!item) return { available: false, reason: 'Equipamento desconhecido.' };
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  if (item.naval && isLandlocked(state.country?.id)) return { available: false, reason: 'Seu país não tem saída para o mar.' };
  if (!techUnlocked(state, item.requires)) return { available: false, reason: `Requer: ${TECH_LABELS[item.requires] ?? item.requires}.` };
  if ((Number(state.economy?.cash) || 0) < item.cost) return { available: false, reason: 'Caixa insuficiente.' };
  if ((Number(state.country?.steel) || 0) < item.steel) return { available: false, reason: 'Aço insuficiente.' };
  return { available: true, reason: '', cost: item.cost, steel: item.steel };
}

export function buyEquipment(state, itemId, quantity = 1) {
  const item = EQUIPMENT[itemId];
  const status = getBuyStatus(state, itemId);
  if (!status.available) return { ...state, notice: status.reason };
  const count = Math.max(1, Math.floor(Number(quantity) || 1));
  const cash = Number(state.economy.cash) || 0;
  const steel = Number(state.country.steel) || 0;
  const affordable = Math.min(count, Math.floor(cash / item.cost), Math.floor(steel / item.steel));
  if (affordable < 1) return { ...state, notice: 'Recursos insuficientes.' };
  const equipment = normalizeEquipmentMap({ ...state.military.equipment, [itemId]: getOwned(state, itemId) + affordable });
  return {
    ...state,
    military: normalizeMilitary({ ...state.military, equipment }),
    economy: { ...state.economy, cash: cash - (item.cost * affordable) },
    country: { ...state.country, steel: steel - (item.steel * affordable) },
    notice: `${affordable}× ${item.name} adquirido(s): +${(item.firepower * affordable).toFixed(1)} de poder de fogo.`,
  };
}

export function getSendStatus(state, itemId, contactId) {
  const item = EQUIPMENT[itemId];
  if (!item) return { available: false, reason: 'Equipamento desconhecido.' };
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  if (getOwned(state, itemId) < 1) return { available: false, reason: 'Você não tem esse equipamento em estoque.' };
  const contact = findContact(state, contactId);
  const kind = getDeploymentKind(state, contact);
  if (!contact || !kind) return { available: false, reason: 'Só aliados e territórios seus podem receber equipamentos.' };
  if (item.naval && isLandlocked(contactId)) return { available: false, reason: `${contact.name} não tem saída para o mar.` };
  if (item.strategic && kind === 'ally') return { available: false, reason: 'Ativo estratégico: não se doa a aliados, só pode ficar em território seu.' };
  if (kind === 'ally' && (Number(contact.equipmentGiftPower) || 0) >= ALLY_GIFT_CAP) return { available: false, reason: `${contact.name} já está bem equipado.` };
  const gdp = Number(state.economy?.gdp) || 0;
  return { available: true, reason: '', kind, shipping: Math.round(item.cost * SHIPPING_COST_RATE), gdp };
}

// Destinos possiveis para a lista de envio (inclui os bloqueados, com o motivo).
export function listDestinations(state, itemId) {
  return (state.geopolitics?.contacts ?? [])
    .map((contact) => ({ contact, kind: getDeploymentKind(state, contact) }))
    .filter((entry) => entry.kind)
    .map(({ contact, kind }) => {
      const status = getSendStatus(state, itemId, contact.id);
      return { id: contact.id, name: contact.name, kind, available: status.available, reason: status.reason };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function sendEquipment(state, itemId, contactId) {
  const status = getSendStatus(state, itemId, contactId);
  if (!status.available) return { ...state, notice: status.reason };
  const item = EQUIPMENT[itemId];
  const contact = findContact(state, contactId);
  const equipment = normalizeEquipmentMap({ ...state.military.equipment, [itemId]: getOwned(state, itemId) - 1 });
  const paid = { ...state.economy, cash: (Number(state.economy.cash) || 0) - status.shipping };
  if (status.kind === 'territory') {
    const abroad = { ...(state.military.equipmentAbroad ?? {}), [contactId]: { ...getAbroad(state, contactId), [itemId]: (getAbroad(state, contactId)[itemId] || 0) + 1 } };
    return {
      ...state,
      economy: paid,
      military: normalizeMilitary({ ...state.military, equipment, equipmentAbroad: abroad }),
      notice: `${item.name} posicionado em ${contact.name}: reforça a defesa e a ofensiva da base (+${item.firepower.toFixed(1)}). Continua sendo seu, com manutenção.`,
    };
  }
  const bonus = Math.min(item.firepower * ALLY_GIFT_FACTOR, Math.max(0, ALLY_GIFT_CAP - (Number(contact.equipmentGiftPower) || 0)));
  const relation = clamp(Math.round(item.cost / 2_000_000_000), 1, 8);
  const next = patchContact(state, contactId, (current) => ({
    militaryPower: clamp((Number(current.militaryPower) || 0) + bonus, 0, 100),
    equipmentGiftPower: (Number(current.equipmentGiftPower) || 0) + bonus,
    relation: clamp((Number(current.relation) || 0) + relation, -100, 100),
  }));
  return {
    ...next,
    economy: paid,
    military: normalizeMilitary({ ...next.military, equipment }),
    notice: `${item.name} doado a ${contact.name}: o poder militar dele subiu ${bonus.toFixed(1)} e a relação melhorou ${relation}.`,
  };
}

export function recallEquipment(state, contactId, itemId) {
  if (!isActiveGame(state)) return { ...state, notice: 'Indisponível.' };
  const abroad = getAbroad(state, contactId);
  const count = Number(abroad[itemId]) || 0;
  if (count < 1) return { ...state, notice: 'Não há esse equipamento lá.' };
  const { [itemId]: removed, ...rest } = abroad;
  const map = { ...(state.military.equipmentAbroad ?? {}) };
  if (Object.keys(rest).length) map[contactId] = rest; else delete map[contactId];
  const equipment = normalizeEquipmentMap({ ...state.military.equipment, [itemId]: getOwned(state, itemId) + count });
  return {
    ...state,
    military: normalizeMilitary({ ...state.military, equipment, equipmentAbroad: map }),
    notice: `${count}× ${EQUIPMENT[itemId]?.name ?? itemId} voltou(aram) de ${findContact(state, contactId)?.name ?? contactId}.`,
  };
}

// Fim de mes: equipamento posicionado em pais que deixou de ser territorio seu volta para casa.
export function processEquipment(state) {
  if (!isActiveGame(state) || !state.military?.equipmentAbroad) return state;
  let next = state;
  const notes = [];
  for (const contactId of Object.keys(state.military.equipmentAbroad)) {
    const contact = findContact(next, contactId);
    if (contact && getDeploymentKind(next, contact) === 'territory') continue;
    const abroad = getAbroad(next, contactId);
    const map = { ...next.military.equipmentAbroad };
    delete map[contactId];
    const equipment = { ...next.military.equipment };
    for (const [id, count] of Object.entries(abroad)) equipment[id] = (Number(equipment[id]) || 0) + Math.floor(count / 2);
    next = { ...next, military: normalizeMilitary({ ...next.military, equipment, equipmentAbroad: map }) };
    notes.push(`O equipamento posicionado em ${contact?.name ?? contactId} foi perdido em parte: só metade voltou para casa.`);
  }
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}

export const EQUIPMENT_BY_BRANCH = Object.freeze(
  EQUIPMENT_LIST.reduce((groups, item) => ({ ...groups, [item.branch]: [...(groups[item.branch] ?? []), item] }), {}),
);
