// Ofensivas a partir de uma base avancada: um territorio seu (pais anexado ou fantoche) guarnecido por tropas
// vira ponto de partida para atacar outros paises. A ofensiva usa as tropas que estiverem na base, e a distancia
// entre a base e o alvo pesa no suprimento. Reforcos do pais principal viajam em comboios que demoram conforme
// a distancia entre a capital e a base.
import { COUNTRY_COORDS } from '../data/country_coords.js';
import { getDeploymentKind, getDeployed, troopsPower } from './deployments.js';
import { adjustFactions } from './factions.js';
import { getPoderTotal, normalizeMilitary } from './military.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const MIN_ATTACK_SHARE = 0.15;
export const REINFORCE_RATE = 0.2;
export const MAX_CONVOYS = 4;
export const KM_PER_MONTH = 4000;
export const MAX_TRAVEL_MONTHS = 6;

export function createOffensives() {
  return { offensives: {}, convoys: [] };
}

export function normalizeOffensives(source = {}) {
  const offensives = {};
  const raw = source.offensives && typeof source.offensives === 'object' && !Array.isArray(source.offensives) ? source.offensives : {};
  for (const [targetId, item] of Object.entries(raw)) {
    if (typeof item?.baseId !== 'string') continue;
    offensives[targetId] = { baseId: item.baseId, startMonth: count(item.startMonth), rounds: count(item.rounds), wins: count(item.wins), losses: count(item.losses) };
  }
  const convoys = (Array.isArray(source.convoys) ? source.convoys : [])
    .filter((item) => typeof item?.baseId === 'string' && (count(item.soldiers) > 0 || count(item.armor) > 0))
    .slice(0, 12)
    .map((item) => ({ baseId: item.baseId, soldiers: count(item.soldiers), armor: count(item.armor), sent: count(item.sent), arrives: count(item.arrives) }));
  return { offensives, convoys };
}

function view(state) {
  return normalizeOffensives({ offensives: state.offensives, convoys: state.convoys });
}

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

// Distancia em km entre dois paises (haversine sobre o ponto central de cada um).
export function distanceKm(a, b) {
  const first = COUNTRY_COORDS[a];
  const second = COUNTRY_COORDS[b];
  if (!first || !second) return 6000;
  const rad = Math.PI / 180;
  const dLat = (second[0] - first[0]) * rad;
  const dLon = (second[1] - first[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(first[0] * rad) * Math.cos(second[0] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function travelMonths(km) {
  return clamp(Math.ceil(km / KM_PER_MONTH), 1, MAX_TRAVEL_MONTHS);
}

// Suprimento: alvos vizinhos da base sao mais faceis; alvos muito distantes enfraquecem a ofensiva.
export function getSupply(km) {
  return clamp(1.3 - (km / 9000), 0.5, 1.25);
}

// A forca da base vale a fracao do exercito que esta la vezes o poder militar total do pais (com marinha, aviacao e equipamento).
export function getBaseForce(state, baseId) {
  const home = homeForce(state);
  const away = getDeployedTotal(state);
  const transit = convoyTotal(state);
  const all = { soldiers: home.soldiers + away.soldiers + transit.soldiers, armor: home.armor + away.armor + transit.armor };
  const totalArmy = troopsPower(all) || 1;
  const share = clamp(troopsPower(getDeployed(state, baseId)) / totalArmy, 0, 1);
  const army = state.military?.exercito ?? {};
  const fullPower = getPoderTotal({ ...state.military, exercito: { ...army, soldados: all.soldiers, blindados: all.armor } });
  return { share, power: fullPower * share };
}

function homeForce(state) {
  const army = state.military?.exercito ?? {};
  return { soldiers: count(army.soldados ?? state.military?.soldiers), armor: count(army.blindados) };
}

function convoyTotal(state) {
  return view(state).convoys.reduce((sum, item) => ({ soldiers: sum.soldiers + item.soldiers, armor: sum.armor + item.armor }), { soldiers: 0, armor: 0 });
}

function alliedSupport(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.alliance && !contact.atWar).reduce((sum, contact) => sum + ((Number(contact.militaryPower) || 0) * 0.08), 0);
}

export function getBaseStatus(state, baseId) {
  const base = findContact(state, baseId);
  if (!base || getDeploymentKind(state, base) !== 'territory') return { ok: false, reason: 'Só um território seu pode ser base de ofensiva.' };
  const force = getDeployed(state, baseId);
  return { ok: true, force, ...getBaseForce(state, baseId), km: 0 };
}

export function getAttackStatus(state, baseId, targetId) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const base = getBaseStatus(state, baseId);
  if (!base.ok) return { available: false, reason: base.reason };
  const target = findContact(state, targetId);
  if (!target || target.destruido || target.anexado || target.wasteland) return { available: false, reason: 'Alvo inválido.' };
  if (targetId === baseId || targetId === state.country?.id) return { available: false, reason: 'Escolha outro país como alvo.' };
  if (getDeploymentKind(state, target)) return { available: false, reason: 'Aliados e territórios seus não podem ser atacados.' };
  if (view(state).offensives[targetId]) return { available: false, reason: `Já há uma ofensiva contra ${target.name}.` };
  if (base.share < MIN_ATTACK_SHARE) return { available: false, reason: `A base precisa de pelo menos ${Math.round(MIN_ATTACK_SHARE * 100)}% do exército para atacar (hoje tem ${Math.round(base.share * 100)}%).` };
  const km = distanceKm(baseId, targetId);
  const supply = getSupply(km);
  const score = (base.power * supply) + alliedSupport(state);
  const enemy = Math.max(1, Number(target.militaryPower) || 1);
  return { available: true, reason: '', km, supply, score, enemy, ratio: score / enemy, power: base.power };
}

export function describeOdds(ratio) {
  if (ratio >= 1.3) return 'favoráveis';
  if (ratio >= 0.85) return 'equilibradas';
  if (ratio >= 0.5) return 'difíceis';
  return 'quase impossíveis';
}

// O jogo-base cuida de declarar guerra (e do custo diplomatico); aqui so registramos a frente de batalha.
export function beginOffensive(state, baseId, targetId) {
  const status = getAttackStatus(state, baseId, targetId);
  if (!status.available) return { ...state, notice: status.reason };
  const month = Number(state.monthCounter) || 0;
  const data = view(state);
  const base = findContact(state, baseId);
  const next = patchContact(state, targetId, (contact) => ({
    atWar: true,
    atWarAgainst: contact.atWar ? contact.atWarAgainst : state.country.id,
    warInitiator: contact.atWar ? contact.warInitiator : state.country.id,
    relation: -100,
    frontBaseId: baseId,
  }));
  return {
    ...next,
    offensives: { ...data.offensives, [targetId]: { baseId, startMonth: month, rounds: 0, wins: 0, losses: 0 } },
    convoys: data.convoys,
    notice: `Ofensiva lançada a partir de ${base.name} contra ${findContact(state, targetId).name}: ${status.km.toLocaleString('pt-BR')} km de distância, condições ${describeOdds(status.ratio)}.`,
  };
}

export function stopOffensive(state, targetId) {
  const data = view(state);
  if (!data.offensives[targetId]) return { ...state, notice: 'Não há ofensiva em curso contra esse país.' };
  const { [targetId]: removed, ...rest } = data.offensives;
  const next = patchContact(state, targetId, { frontBaseId: null });
  return { ...next, offensives: rest, convoys: data.convoys, notice: `Ofensiva contra ${findContact(state, targetId)?.name ?? targetId} suspensa. A guerra continua com as forças nacionais.` };
}

export function getReinforcementStatus(state, baseId) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const base = getBaseStatus(state, baseId);
  if (!base.ok) return { available: false, reason: base.reason };
  const data = view(state);
  if (data.convoys.length >= MAX_CONVOYS) return { available: false, reason: `No máximo ${MAX_CONVOYS} comboios ao mesmo tempo.` };
  const home = homeForce(state);
  const away = getDeployedTotal(state);
  const transit = convoyTotal(state);
  const contingent = { soldiers: Math.floor((home.soldiers * REINFORCE_RATE) / 100) * 100, armor: Math.floor(home.armor * REINFORCE_RATE) };
  if (contingent.soldiers < 100) return { available: false, reason: 'Exército de casa pequeno demais para enviar reforços.' };
  const total = home.soldiers + away.soldiers + transit.soldiers;
  if (away.soldiers + transit.soldiers + contingent.soldiers > total * 0.5) return { available: false, reason: 'No máximo metade do exército pode ficar fora de casa.' };
  const km = distanceKm(state.country.id, baseId);
  const months = travelMonths(km);
  const gdp = Number(state.economy?.gdp) || 0;
  return { available: true, reason: '', contingent, km, months, cost: Math.round((gdp / 12) * 0.004 * months) };
}

function getDeployedTotal(state) {
  return Object.values(state.deployments ?? {}).reduce((sum, force) => ({ soldiers: sum.soldiers + count(force?.soldiers), armor: sum.armor + count(force?.armor) }), { soldiers: 0, armor: 0 });
}

export function requestReinforcements(state, baseId) {
  const status = getReinforcementStatus(state, baseId);
  if (!status.available) return { ...state, notice: status.reason };
  const month = Number(state.monthCounter) || 0;
  const data = view(state);
  const army = state.military.exercito;
  const base = findContact(state, baseId);
  const convoy = { baseId, soldiers: status.contingent.soldiers, armor: status.contingent.armor, sent: month, arrives: month + status.months };
  return {
    ...state,
    military: normalizeMilitary({ ...state.military, exercito: { ...army, soldados: count(army.soldados) - convoy.soldiers, blindados: count(army.blindados) - convoy.armor } }),
    economy: { ...state.economy, cash: state.economy.cash - status.cost },
    offensives: data.offensives,
    convoys: [...data.convoys, convoy],
    notice: `Reforços a caminho de ${base.name}: ${convoy.soldiers.toLocaleString('pt-BR')} soldados e ${convoy.armor} blindados chegam em ${status.months} mês(es) (${status.km.toLocaleString('pt-BR')} km).`,
  };
}

// Fim de mes: comboios que chegam, rodada de combate de cada ofensiva e limpeza de frentes antigas.
export function processOffensives(state) {
  if (!isActiveGame(state)) return state;
  const month = Number(state.monthCounter) || 0;
  const data = view(state);
  const notes = [];
  let next = { ...state, offensives: data.offensives, convoys: data.convoys };

  // 1) Comboios.
  const waiting = [];
  for (const convoy of data.convoys) {
    if (convoy.arrives > month) { waiting.push(convoy); continue; }
    const base = findContact(next, convoy.baseId);
    const army = next.military.exercito;
    if (base && getDeploymentKind(next, base) === 'territory') {
      const current = getDeployed(next, convoy.baseId);
      next = {
        ...next,
        deployments: { ...next.deployments, [convoy.baseId]: { soldiers: current.soldiers + convoy.soldiers, armor: current.armor + convoy.armor, since: current.since || month } },
      };
      notes.push(`Os reforços chegaram a ${base.name}: ${convoy.soldiers.toLocaleString('pt-BR')} soldados e ${convoy.armor} blindados.`);
    } else {
      next = { ...next, military: normalizeMilitary({ ...next.military, exercito: { ...army, soldados: count(army.soldados) + convoy.soldiers, blindados: count(army.blindados) + convoy.armor } }) };
      notes.push('Um comboio de reforços voltou para casa: a base não é mais um território seu.');
    }
  }
  next = { ...next, convoys: waiting };

  // 2) Rodadas de combate.
  const offensives = { ...data.offensives };
  const gdp = Number(next.economy?.gdp) || 0;
  let cash = Number(next.economy.cash) || 0;
  let factions = next.factions;
  let peaceTreaty = next.geopolitics.peaceTreaty ?? null;
  for (const [targetId, op] of Object.entries(data.offensives)) {
    const target = findContact(next, targetId);
    const base = findContact(next, op.baseId);
    const force = getDeployed(next, op.baseId);
    const baseForce = getBaseForce(next, op.baseId);
    const power = baseForce.power;
    const finish = (message) => { delete offensives[targetId]; notes.push(message); next = patchContact(next, targetId, { frontBaseId: null }); };
    if (!target || target.destruido || target.anexado || getDeploymentKind(next, target)) { finish('A ofensiva perdeu o alvo e foi encerrada.'); continue; }
    if (!base || getDeploymentKind(next, base) !== 'territory') { finish(`A ofensiva contra ${target.name} acabou: a base não é mais um território seu.`); continue; }
    if (baseForce.share < 0.03) { finish(`A ofensiva contra ${target.name} parou: não restam tropas na base.`); continue; }
    if (!target.atWar) { finish(`A guerra contra ${target.name} acabou e a ofensiva foi encerrada.`); continue; }
    const km = distanceKm(op.baseId, targetId);
    const noise = (hash(month, 389 + targetId.length, next) - 0.5) * (4 + (power * 0.2));
    const score = (power * getSupply(km)) + alliedSupport(next) + noise;
    const enemyPower = Number(target.militaryPower) || 0;
    const won = score >= enemyPower;
    cash -= Math.round((gdp / 12) * 0.004);
    const lossRate = won ? 0.03 : 0.08;
    const lostSoldiers = Math.floor(force.soldiers * lossRate);
    const lostArmor = !won && force.armor > 0 && hash(month, 457, next) < 0.4 ? 1 : 0;
    const remaining = { ...force, soldiers: force.soldiers - lostSoldiers, armor: force.armor - lostArmor };
    next = { ...next, deployments: { ...next.deployments, [op.baseId]: remaining } };
    const stats = { ...op, rounds: op.rounds + 1, wins: op.wins + (won ? 1 : 0), losses: op.losses + (won ? 0 : 1) };
    if (!won) {
      const territories = next.territories ?? {};
      const loyalty = territories[op.baseId]?.loyalty ?? 30;
      next = { ...next, territories: { ...territories, [op.baseId]: { loyalty: clamp(loyalty - 5, 0, 100) } } };
      next = patchContact(next, targetId, { relation: -100 });
      factions = adjustFactions(factions, { militares: -0.8 });
      notes.push(`Revés em ${target.name}: ${lostSoldiers.toLocaleString('pt-BR')} soldados perdidos e a base ${base.name} sofreu um contra-ataque.`);
      offensives[targetId] = stats;
      continue;
    }
    const damage = Math.max(2, Math.round((score / Math.max(1, enemyPower)) * 4));
    const militaryPower = Math.max(0, enemyPower - damage);
    factions = adjustFactions(factions, { militares: 0.4 });
    if (militaryPower === 0) {
      next = patchContact(next, targetId, { militaryPower: 0, atWar: false, relation: -85, frontBaseId: null });
      if (!peaceTreaty) peaceTreaty = { targetId, status: 'pending' };
      delete offensives[targetId];
      notes.push(`${target.name} foi derrotado pela ofensiva a partir de ${base.name}; tratado de paz pendente.`);
      continue;
    }
    next = patchContact(next, targetId, { militaryPower, relation: -85 });
    offensives[targetId] = stats;
    notes.push(`Avanço contra ${target.name}: poder inimigo caiu para ${militaryPower}.`);
  }
  next = { ...next, offensives, factions, economy: { ...next.economy, cash }, geopolitics: { ...next.geopolitics, peaceTreaty: next.geopolitics.peaceTreaty ?? peaceTreaty } };
  if (peaceTreaty && !state.geopolitics.peaceTreaty) next = { ...next, geopolitics: { ...next.geopolitics, peaceTreaty } };

  // 3) Frentes antigas sem ofensiva ativa deixam de bloquear a guerra normal.
  const stale = next.geopolitics.contacts.filter((contact) => contact.frontBaseId && !offensives[contact.id]);
  for (const contact of stale) next = patchContact(next, contact.id, { frontBaseId: null });
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}
