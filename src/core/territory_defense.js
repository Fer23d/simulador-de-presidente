// Ataques a territorios anexados: paises hostis podem atacar um pais que voce anexou. O resultado depende da forca
// da guarnicao la (fracao do exercito vezes o poder militar total), da lealdade local e de a sede do governo estar ali.
// Derrota total faz o territorio se libertar; derrota parcial so cobra baixas e lealdade.
import { createGeopolitics } from './geopolitics.js';
import { getDeployed, getDeploymentKind, getCapitalId, getTerritoryLoyalty } from './deployments.js';
import { adjustFactions } from './factions.js';
import { distanceKm, getBaseForce, getSupply } from './offensives.js';
import { normalizeMilitary } from './military.js';
import { bumpReputationStat, getTitleModifier } from './identity.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const ATTACK_GRACE_MONTHS = 6;
export const ATTACK_COOLDOWN_MONTHS = 4;
export const MAX_ATTACK_CHANCE = 0.07;
export const CAPITAL_DEFENSE_BONUS = 6;
// O atacante manda so parte do exercito; o defensor luta em posicao fortificada; so uma vantagem grande derruba a base.
export const EXPEDITION_SHARE = 0.6;
export const DEFENDER_ADVANTAGE = 1.25;
export const TOTAL_DEFEAT_RATIO = 1.8;

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function isFriendly(state, contact) {
  return Boolean(contact.alliance) || (state.player_alliance ?? []).includes(contact.id) || (Boolean(contact.puppet) && contact.is_puppet_of === 'jogador');
}

// Paises que poderiam atacar o territorio, com o peso de cada um (hostilidade, proximidade, poder).
export function getAttackers(state, territoryId) {
  const attackers = [];
  for (const contact of state.geopolitics?.contacts ?? []) {
    if (contact.id === territoryId || contact.destruido || contact.anexado || contact.wasteland || isFriendly(state, contact)) continue;
    const relation = Number(contact.relation) || 0;
    const power = Number(contact.militaryPower) || 0;
    if (relation >= 20 || power < 5) continue;
    const km = distanceKm(contact.id, territoryId);
    const hostility = (relation < -30 ? 1.5 : 1) * (contact.atWar ? 2 : 1);
    const proximity = km < 4000 ? 1.5 : km > 9000 ? 0.4 : 1;
    const strength = power * EXPEDITION_SHARE * getSupply(km);
    attackers.push({ id: contact.id, name: contact.name, km, strength, weight: hostility * proximity * clamp(power / 25, 0.4, 1.6) });
  }
  return attackers;
}

export function getDefenseScore(state, territoryId) {
  const force = getBaseForce(state, territoryId);
  const loyaltyBonus = (getTerritoryLoyalty(state, territoryId) / 100) * 4;
  const capitalBonus = getCapitalId(state) === territoryId ? CAPITAL_DEFENSE_BONUS : 0;
  return { score: (force.power + loyaltyBonus) * DEFENDER_ADVANTAGE + capitalBonus, share: force.share };
}

export function getAttackChance(state, territoryId) {
  const attackers = getAttackers(state, territoryId);
  const base = attackers.reduce((sum, item) => sum + item.weight, 0) * 0.005;
  const tension = (Number(state.global_defcon) || 5) <= 2 ? 1.4 : 1;
  return clamp(base * tension * getTitleModifier(state, 'territoryAttack'), 0, MAX_ATTACK_CHANCE);
}

export function describeThreat(chance) {
  if (chance <= 0) return 'nenhum';
  if (chance < 0.03) return 'baixo';
  if (chance < 0.08) return 'médio';
  return 'alto';
}

function liberate(state, territoryId, attackerName, notes) {
  const territory = findContact(state, territoryId);
  const fresh = createGeopolitics(state.country.id).contacts.find((contact) => contact.id === territoryId) ?? {};
  const survivors = getDeployed(state, territoryId);
  const { [territoryId]: removedForce, ...deployments } = state.deployments ?? {};
  const { [territoryId]: removedTerritory, ...territories } = state.territories ?? {};
  const army = state.military.exercito;
  const wasCapital = getCapitalId(state) === territoryId;
  let next = patchContact(state, territoryId, {
    anexado: false,
    annexed: false,
    destruido: false,
    atWar: false,
    relation: -80,
    pib_base: fresh.pib_base ?? 0,
    population: fresh.population ?? 0,
    area_km2: fresh.area_km2 ?? 0,
    cash: fresh.cash ?? 0,
    uranium: fresh.uranium ?? 0,
    steel: fresh.steel ?? 0,
    rare_earths: fresh.rare_earths ?? 0,
    ...(fresh.military ? { military: fresh.military } : {}),
    militaryPower: Math.max(5, Math.round((Number(fresh.militaryPower) || 10) * 0.4)),
  });
  next = {
    ...next,
    deployments,
    territories,
    geopolitics: { ...next.geopolitics, annexedCountryIds: (next.geopolitics.annexedCountryIds ?? []).filter((id) => id !== territoryId) },
    military: normalizeMilitary({ ...next.military, exercito: { ...army, soldados: count(army.soldados) + Math.floor(survivors.soldiers * 0.5), blindados: count(army.blindados) + Math.floor(survivors.armor * 0.5) } }),
    factions: adjustFactions(next.factions, { militares: -3, trabalhadores: -2 }),
    regime: { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) + (wasCapital ? 20 : 4), 0, 100) },
  };
  if (wasCapital) {
    next = {
      ...next,
      capitalId: null,
      capitalMoveMonth: Number(state.monthCounter) || 0,
      economy: { ...next.economy, cash: next.economy.cash - Math.round((Number(next.economy.gdp) || 0) * 0.03) },
      factions: adjustFactions(next.factions, { militares: -5, trabalhadores: -4, elite: -3 }),
    };
    notes.push(`A sede do governo caiu: ${territory.name} foi tomado por ${attackerName}. O governo voltou às pressas para casa.`);
  } else {
    notes.push(`${territory.name} foi perdido para ${attackerName} e voltou a ser independente.`);
  }
  return bumpReputationStat(next, 'territoriesLost');
}

// Fim de mes: possivel ataque a cada territorio anexado.
export function processTerritoryThreats(state) {
  if (!isActiveGame(state)) return state;
  const month = Number(state.monthCounter) || 0;
  if (month < ATTACK_GRACE_MONTHS) return state;
  let next = state;
  const notes = [];
  const attacked = [];
  const ids = (state.geopolitics.contacts ?? []).filter((contact) => contact.anexado).map((contact) => contact.id);
  ids.forEach((territoryId, order) => {
    const territory = findContact(next, territoryId);
    if (!territory?.anexado || getDeploymentKind(next, territory) !== 'territory') return;
    const lastAttack = Number(next.territories?.[territoryId]?.lastAttack);
    if (Number.isFinite(lastAttack) && month - lastAttack < ATTACK_COOLDOWN_MONTHS) return;
    const chance = getAttackChance(next, territoryId);
    if (chance <= 0 || hash(month, 211 + (order * 31), next) >= chance) return;
    const attackers = getAttackers(next, territoryId);
    const total = attackers.reduce((sum, item) => sum + item.weight, 0);
    let roll = hash(month, 377 + (order * 17), next) * total;
    const attacker = attackers.find((item) => { roll -= item.weight; return roll <= 0; }) ?? attackers[attackers.length - 1];
    if (!attacker) return;
    const defense = getDefenseScore(next, territoryId);
    const noise = 0.85 + (hash(month, 521 + order, next) * 0.3);
    const attack = attacker.strength * noise;
    const force = getDeployed(next, territoryId);
    const won = defense.score >= attack;
    const loyalty = getTerritoryLoyalty(next, territoryId);
    const lossRate = won ? 0.04 : 0.15;
    const survivors = { ...force, soldiers: force.soldiers - Math.floor(force.soldiers * lossRate), armor: force.armor - (!won && force.armor > 0 && hash(month, 613 + order, next) < 0.5 ? 1 : 0) };
    const deployments = { ...next.deployments };
    if (survivors.soldiers > 0 || survivors.armor > 0) deployments[territoryId] = survivors; else delete deployments[territoryId];
    const territories = { ...next.territories, [territoryId]: { loyalty: clamp(loyalty + (won ? 4 : -15), 0, 100), lastAttack: month } };
    next = { ...next, deployments, territories, defconPeacefulMonths: 0 };
    attacked.push(territoryId);
    if (won) {
      const damage = Math.max(2, Math.round((defense.score / Math.max(1, attack)) * 3));
      next = patchContact(next, attacker.id, (item) => ({ militaryPower: Math.max(0, (Number(item.militaryPower) || 0) - damage), relation: -90 }));
      next = { ...next, factions: adjustFactions(next.factions, { militares: 0.6 }) };
      notes.push(`${attacker.name} atacou ${territory.name} e foi repelido pela guarnição (defesa ${defense.score.toFixed(1)} contra ${attack.toFixed(1)}).`);
      return;
    }
    const fullDefeat = attack / Math.max(0.1, defense.score) >= TOTAL_DEFEAT_RATIO || survivors.soldiers <= 0 || territories[territoryId].loyalty <= 10;
    next = patchContact(next, attacker.id, { relation: -90 });
    if (fullDefeat) {
      next = liberate(next, territoryId, attacker.name, notes);
    } else {
      next = { ...next, factions: adjustFactions(next.factions, { militares: -1 }) };
      notes.push(`${attacker.name} atacou ${territory.name}: a guarnição sofreu baixas (defesa ${defense.score.toFixed(1)} contra ${attack.toFixed(1)}), mas a base resistiu.`);
    }
  });
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}
