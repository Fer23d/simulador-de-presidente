// Tropas no exterior: enviar forcas para territorios seus (paises anexados ou fantoches) e para aliados,
// retirar essas forcas e pedir tropas emprestadas a um aliado.
//  - Territorio: a guarnicao sobe a lealdade local; sem ela a lealdade cai, e territorios inquietos geram guerrilha.
//  - Aliado: a guarnicao reforca o poder militar do aliado (que tambem soma ao seu nas guerras) e melhora a relacao.
//  - Pedido de tropas: o aliado empresta uma forca por 6 meses, que soma ao seu poder militar.
// As tropas enviadas saem do exercito de casa, custam manutencao mensal e sofrem baixas em frentes de guerra.
import { adjustFactions } from './factions.js';
import { normalizeMilitary } from './military.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const CONTINGENT_RATE = 0.1;
export const MAX_DEPLOYED_SHARE = 0.5;
export const UPKEEP_RATE = 0.001;
export const TRIBUTE_RATE = 0.006;
export const LOAN_MONTHS = 6;
export const LOAN_COOLDOWN = 6;
export const LOAN_MIN_RELATION = 55;
export const TERRITORY_START_LOYALTY = 30;
export const REINFORCEMENT_CAP = 20;

export function createDeployments() {
  return { deployments: {}, territories: {}, alliedLoans: {} };
}

const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function normalizeDeployments(source = {}) {
  const deployments = {};
  for (const [id, item] of Object.entries(isRecord(source.deployments) ? source.deployments : {})) {
    const soldiers = count(item?.soldiers);
    const armor = count(item?.armor);
    if (soldiers > 0 || armor > 0) deployments[id] = { soldiers, armor, since: count(item?.since) };
  }
  const territories = {};
  for (const [id, item] of Object.entries(isRecord(source.territories) ? source.territories : {})) {
    territories[id] = { loyalty: clamp(Number(item?.loyalty) || 0, 0, 100) };
  }
  const alliedLoans = {};
  for (const [id, item] of Object.entries(isRecord(source.alliedLoans) ? source.alliedLoans : {})) {
    alliedLoans[id] = {
      power: Math.max(0, Number(item?.power) || 0),
      restore: Math.max(0, Number(item?.restore) || 0),
      until: Math.floor(Number(item?.until) || -1),
      lastEnd: Number.isFinite(Number(item?.lastEnd)) ? Math.floor(Number(item.lastEnd)) : -99,
    };
  }
  return { deployments, territories, alliedLoans };
}

function view(state) {
  return normalizeDeployments({ deployments: state.deployments, territories: state.territories, alliedLoans: state.alliedLoans });
}

function hash(month, salt, state) {
  const extra = [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

export function troopsPower(force) {
  return ((Number(force?.soldiers) || 0) / 8_000) + ((Number(force?.armor) || 0) * 1.6);
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

export function getDeploymentKind(state, contact) {
  if (!contact || contact.wasteland) return null;
  if (contact.anexado || contact.annexed || (contact.puppet && contact.is_puppet_of === 'jogador')) return 'territory';
  if (contact.destruido) return null;
  const allied = contact.alliance || (state.player_alliance ?? []).includes(contact.id);
  return allied ? 'ally' : null;
}

export function getDeployed(state, id) {
  return view(state).deployments[id] ?? { soldiers: 0, armor: 0, since: 0 };
}

export function getTerritoryLoyalty(state, id) {
  return view(state).territories[id]?.loyalty ?? TERRITORY_START_LOYALTY;
}

function homeForce(state) {
  const army = state.military?.exercito ?? {};
  return { soldiers: count(army.soldados ?? state.military?.soldiers), armor: count(army.blindados) };
}

function totalDeployed(state) {
  return Object.values(view(state).deployments).reduce((sum, force) => ({ soldiers: sum.soldiers + force.soldiers, armor: sum.armor + force.armor }), { soldiers: 0, armor: 0 });
}

export function getContingent(state) {
  const home = homeForce(state);
  return { soldiers: Math.floor((home.soldiers * CONTINGENT_RATE) / 100) * 100, armor: Math.floor(home.armor * CONTINGENT_RATE) };
}

export function getDeployStatus(state, id) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const contact = findContact(state, id);
  const kind = getDeploymentKind(state, contact);
  if (!kind) return { available: false, reason: 'Só é possível enviar tropas a territórios seus e a aliados.' };
  const contingent = getContingent(state);
  if (contingent.soldiers < 100) return { available: false, reason: 'Exército pequeno demais para enviar um contingente.' };
  const away = totalDeployed(state);
  const home = homeForce(state);
  if (away.soldiers + contingent.soldiers > (home.soldiers + away.soldiers) * MAX_DEPLOYED_SHARE) return { available: false, reason: 'No máximo metade do exército pode ficar no exterior.' };
  const gdp = Number(state.economy?.gdp) || 0;
  return { available: true, reason: '', kind, contingent, cost: Math.round((gdp / 12) * 0.003) };
}

export function sendTroops(state, id) {
  const status = getDeployStatus(state, id);
  if (!status.available) return { ...state, notice: status.reason };
  const contact = findContact(state, id);
  const data = view(state);
  const current = data.deployments[id] ?? { soldiers: 0, armor: 0, since: Number(state.monthCounter) || 0 };
  const { contingent } = status;
  const army = state.military.exercito;
  const military = normalizeMilitary({
    ...state.military,
    exercito: { ...army, soldados: count(army.soldados) - contingent.soldiers, blindados: count(army.blindados) - contingent.armor },
  });
  const sent = { soldiers: current.soldiers + contingent.soldiers, armor: current.armor + contingent.armor, since: current.since };
  const where = status.kind === 'territory' ? 'guarnecer o território' : 'reforçar o aliado';
  return {
    ...state,
    military,
    economy: { ...state.economy, cash: state.economy.cash - status.cost },
    factions: adjustFactions(state.factions, { militares: 1 }),
    deployments: { ...data.deployments, [id]: sent },
    territories: data.territories,
    alliedLoans: data.alliedLoans,
    notice: `${contingent.soldiers.toLocaleString('pt-BR')} soldados e ${contingent.armor} blindados partiram para ${where} ${contact.name}. Eles custam manutenção todo mês.`,
  };
}

export function recallTroops(state, id) {
  if (!isActiveGame(state)) return { ...state, notice: 'Indisponível.' };
  const data = view(state);
  const force = data.deployments[id];
  if (!force) return { ...state, notice: 'Não há tropas suas nesse país.' };
  const contact = findContact(state, id);
  const { [id]: removed, ...rest } = data.deployments;
  const army = state.military.exercito;
  let next = {
    ...state,
    military: normalizeMilitary({ ...state.military, exercito: { ...army, soldados: count(army.soldados) + removed.soldiers, blindados: count(army.blindados) + removed.armor } }),
    deployments: rest,
    territories: data.territories,
    alliedLoans: data.alliedLoans,
  };
  if (contact && getDeploymentKind(state, contact) === 'ally') next = patchContact(next, id, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - (Number(item.reinforcement) || 0)), reinforcement: 0 }));
  return { ...next, notice: `As tropas voltaram de ${contact?.name ?? id}: ${removed.soldiers.toLocaleString('pt-BR')} soldados e ${removed.armor} blindados.` };
}

export function getRequestStatus(state, id) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const contact = findContact(state, id);
  if (!contact || getDeploymentKind(state, contact) !== 'ally') return { available: false, reason: 'Só aliados emprestam tropas.' };
  const month = Number(state.monthCounter) || 0;
  const loan = view(state).alliedLoans[id];
  if (loan && loan.power > 0 && loan.until > month) return { available: false, reason: `As tropas de ${contact.name} já estão com você (mais ${loan.until - month} mês(es)).` };
  if (loan && month - loan.lastEnd < LOAN_COOLDOWN) return { available: false, reason: `Novo pedido em ${LOAN_COOLDOWN - (month - loan.lastEnd)} mês(es).` };
  if (contact.atWar) return { available: false, reason: `${contact.name} está em guerra e não pode ceder tropas.` };
  if ((Number(contact.relation) || 0) < LOAN_MIN_RELATION) return { available: false, reason: `Relação abaixo de ${LOAN_MIN_RELATION}.` };
  if (getDeployed(state, id).soldiers > 0) return { available: false, reason: 'Você mantém tropas lá; retire-as antes de pedir as deles.' };
  const power = clamp((Number(contact.militaryPower) || 0) * 0.3, 4, 30);
  const atWar = state.geopolitics.contacts.some((item) => item.atWar && !item.destruido);
  const chance = clamp(((Number(contact.relation) || 0) / 100) * 0.8 + (atWar ? 0.1 : 0) + 0.05, 0.1, 0.95);
  return { available: true, reason: '', power, chance };
}

export function requestAlliedTroops(state, id) {
  const status = getRequestStatus(state, id);
  if (!status.available) return { ...state, notice: status.reason };
  const contact = findContact(state, id);
  const month = Number(state.monthCounter) || 0;
  const data = view(state);
  const granted = hash(month, 641 + id.length, state) < status.chance;
  if (!granted) {
    const refused = patchContact(state, id, (item) => ({ relation: clamp((Number(item.relation) || 0) - 3, -100, 100) }));
    return { ...refused, deployments: data.deployments, territories: data.territories, alliedLoans: { ...data.alliedLoans, [id]: { power: 0, restore: 0, until: -1, lastEnd: month - LOAN_COOLDOWN + 2 } }, notice: `${contact.name} recusou o pedido de tropas. A relação esfriou um pouco.` };
  }
  const restore = Math.round(status.power * 0.4 * 10) / 10;
  let next = patchContact(state, id, (item) => ({ relation: clamp((Number(item.relation) || 0) - 6, -100, 100), militaryPower: Math.max(1, (Number(item.militaryPower) || 0) - restore) }));
  next = { ...next, deployments: data.deployments, territories: data.territories, alliedLoans: { ...data.alliedLoans, [id]: { power: status.power, restore, until: month + LOAN_MONTHS, lastEnd: -99 } } };
  return { ...withAlliedForces(next), notice: `${contact.name} enviou tropas: +${status.power.toFixed(1)} de poder militar por ${LOAN_MONTHS} meses. O favor custou 6 pontos de relação.` };
}

export function getAlliedForcesPower(state) {
  const month = Number(state.monthCounter) || 0;
  return Object.values(view(state).alliedLoans).filter((loan) => loan.power > 0 && loan.until > month).reduce((sum, loan) => sum + loan.power, 0);
}

function withAlliedForces(state) {
  const power = getAlliedForcesPower(state);
  return { ...state, military: normalizeMilitary({ ...state.military, alliedForces: { power } }) };
}

// Fim de mes: manutencao, baixas, reforco dos aliados, lealdade dos territorios e fim dos emprestimos.
export function processDeployments(state) {
  if (!isActiveGame(state)) return state;
  const month = Number(state.monthCounter) || 0;
  const data = view(state);
  const gdp = Number(state.economy?.gdp) || 0;
  const monthly = gdp / 12;
  let next = { ...state, ...data };
  let cash = Number(state.economy.cash) || 0;
  let unrest = 0;
  const notes = [];
  const returned = { soldiers: 0, armor: 0 };
  const deployments = {};

  for (const [id, force] of Object.entries(data.deployments)) {
    const contact = findContact(next, id);
    const kind = getDeploymentKind(next, contact);
    if (!contact || !kind) {
      returned.soldiers += force.soldiers;
      returned.armor += force.armor;
      notes.push(`As tropas em ${contact?.name ?? id} voltaram para casa porque a parceria acabou.`);
      continue;
    }
    cash -= Math.round(monthly * UPKEEP_RATE * troopsPower(force));
    const loyalty = data.territories[id]?.loyalty ?? TERRITORY_START_LOYALTY;
    const rate = (kind === 'ally' && contact.atWar) ? 0.02 : (kind === 'territory' && loyalty < 35 ? 0.015 : 0);
    const lostSoldiers = Math.floor(force.soldiers * rate);
    const lostArmor = rate > 0 && force.armor > 0 && hash(month, 733 + id.length, next) < 0.3 ? 1 : 0;
    const remaining = { ...force, soldiers: force.soldiers - lostSoldiers, armor: force.armor - lostArmor };
    if (lostSoldiers > 0) notes.push(`Baixas em ${contact.name}: ${lostSoldiers.toLocaleString('pt-BR')} soldados.`);
    if (remaining.soldiers > 0 || remaining.armor > 0) deployments[id] = remaining;
    if (kind === 'ally') {
      const bonus = Math.min(REINFORCEMENT_CAP, troopsPower(remaining) * 3);
      const delta = bonus - (Number(contact.reinforcement) || 0);
      next = patchContact(next, id, (item) => ({ militaryPower: Math.max(1, (Number(item.militaryPower) || 0) + delta), reinforcement: bonus, relation: clamp((Number(item.relation) || 0) + 1, -100, 100) }));
    }
  }

  // Lealdade e guerrilha dos territorios anexados (ou fantoches).
  const territories = {};
  for (const contact of next.geopolitics.contacts) {
    if (getDeploymentKind(next, contact) !== 'territory') continue;
    const current = data.territories[contact.id]?.loyalty ?? TERRITORY_START_LOYALTY;
    const garrison = troopsPower(deployments[contact.id] ?? { soldiers: 0, armor: 0 });
    const target = clamp(25 + garrison * 8, 25, 85);
    const loyalty = clamp(current + ((target - current) * 0.12), 0, 100);
    territories[contact.id] = { loyalty };
    if (contact.anexado) cash += Math.round(monthly * TRIBUTE_RATE * (loyalty / 100));
    if (loyalty < 35 && hash(month, 811 + contact.id.length, next) < 0.6) {
      cash -= Math.round(monthly * 0.002 * ((35 - loyalty) / 35));
      unrest += 1.5;
      if (hash(month, 907, next) < 0.35) notes.push(`Guerrilha em ${contact.name}: a ocupação sem guarnição custa caro.`);
    }
  }

  next = { ...next, deployments, territories, economy: { ...next.economy, cash }, regime: unrest ? { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) + unrest, 0, 100) } : next.regime };
  if (returned.soldiers || returned.armor) {
    const army = next.military.exercito;
    next = { ...next, military: normalizeMilitary({ ...next.military, exercito: { ...army, soldados: count(army.soldados) + returned.soldiers, blindados: count(army.blindados) + returned.armor } }) };
  }

  // Emprestimos de tropas aliadas que acabaram.
  const alliedLoans = { ...data.alliedLoans };
  for (const [id, loan] of Object.entries(alliedLoans)) {
    if (loan.power > 0 && loan.until <= month) {
      const contact = findContact(next, id);
      if (contact) next = patchContact(next, id, (item) => ({ militaryPower: (Number(item.militaryPower) || 0) + loan.restore, relation: clamp((Number(item.relation) || 0) + 4, -100, 100) }));
      alliedLoans[id] = { power: 0, restore: 0, until: -1, lastEnd: month };
      notes.push(`As tropas de ${contact?.name ?? id} voltaram para casa. A relação melhorou.`);
    }
  }
  next = withAlliedForces({ ...next, alliedLoans });
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}
