// Sede do governo: o presidente pode transferir a capital para um territorio anexado (e voltar para casa).
// Vantagens: reforcos chegam mais rapido (a distancia conta a partir da capital), ofensivas saindo dela tem suprimento
// melhor, a lealdade e o tributo do territorio sobem e a defesa dele ganha bonus. Custos: dinheiro, desgaste em casa
// (quanto mais longe, maior) e o risco de a queda da capital virar uma crise de governo.
import { getCapitalId, getDeploymentKind, getTerritoryLoyalty } from './deployments.js';
import { adjustFactions } from './factions.js';
import { distanceKm, getBaseForce } from './offensives.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const CAPITAL_COST_RATE = 0.03;
export const CAPITAL_COOLDOWN = 12;
export const CAPITAL_MIN_LOYALTY = 45;
export const CAPITAL_MIN_SHARE = 0.1;
export const CAPITAL_LOYALTY_FLOOR = 60;
export const CAPITAL_TRIBUTE_RATE = 0.006;

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

export function getCapitalStatus(state, targetId) {
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  const month = Number(state.monthCounter) || 0;
  const current = getCapitalId(state);
  const home = state.country?.id;
  const gdp = Number(state.economy?.gdp) || 0;
  const cost = Math.round(gdp * CAPITAL_COST_RATE);
  if (targetId === current) return { available: false, reason: 'A sede do governo já está aqui.' };
  const wait = CAPITAL_COOLDOWN - (month - (Number(state.capitalMoveMonth) || -99));
  if (wait > 0) return { available: false, reason: `Nova mudança da sede em ${wait} mês(es).` };
  if (targetId === home) return { available: true, reason: '', cost, km: distanceKm(home, current), toHome: true };
  const contact = findContact(state, targetId);
  if (!contact || !contact.anexado || getDeploymentKind(state, contact) !== 'territory') return { available: false, reason: 'A sede só pode ir para um território anexado.' };
  const loyalty = getTerritoryLoyalty(state, targetId);
  if (loyalty < CAPITAL_MIN_LOYALTY) return { available: false, reason: `Lealdade do território abaixo de ${CAPITAL_MIN_LOYALTY}% (hoje ${Math.round(loyalty)}%).` };
  const share = getBaseForce(state, targetId).share;
  if (share < CAPITAL_MIN_SHARE) return { available: false, reason: `Guarneça o território com pelo menos ${Math.round(CAPITAL_MIN_SHARE * 100)}% do exército (hoje ${Math.round(share * 100)}%).` };
  return { available: true, reason: '', cost, km: distanceKm(home, targetId), toHome: false };
}

export function moveCapital(state, targetId) {
  const status = getCapitalStatus(state, targetId);
  if (!status.available) return { ...state, notice: status.reason };
  const month = Number(state.monthCounter) || 0;
  const home = state.country.id;
  const base = {
    ...state,
    capitalId: status.toHome ? null : targetId,
    capitalMoveMonth: month,
    economy: { ...state.economy, cash: state.economy.cash - status.cost },
  };
  if (status.toHome) {
    return { ...base, regime: { ...base.regime, unrest: clamp((Number(base.regime?.unrest) || 0) - 3, 0, 100) }, notice: 'A sede do governo voltou para casa. O país respirou aliviado.' };
  }
  const territory = findContact(state, targetId);
  const territories = { ...(state.territories ?? {}), [targetId]: { ...(state.territories?.[targetId] ?? {}), loyalty: Math.max(getTerritoryLoyalty(state, targetId), CAPITAL_LOYALTY_FLOOR) } };
  return {
    ...base,
    territories,
    factions: adjustFactions(base.factions, { elite: -3, trabalhadores: -2 }),
    regime: { ...base.regime, unrest: clamp((Number(base.regime?.unrest) || 0) + 6, 0, 100) },
    notice: `O governo mudou sua sede para ${territory.name} (${status.km.toLocaleString('pt-BR')} km de ${findContact(state, home)?.name ?? home}). Em casa, o desgaste cresce todo mês.`,
  };
}

// Fim de mes: se a capital deixou de ser territorio seu, volta para casa; senao, efeitos de governar de longe.
export function processCapital(state) {
  if (!isActiveGame(state) || !state.capitalId) return state;
  const territory = findContact(state, state.capitalId);
  if (!territory || !territory.anexado || getDeploymentKind(state, territory) !== 'territory') {
    return { ...state, capitalId: null, capitalMoveMonth: Number(state.monthCounter) || 0, notice: 'A sede do governo voltou para casa: o território deixou de ser seu.' };
  }
  const km = distanceKm(state.country.id, state.capitalId);
  const alienation = clamp(km / 10000, 0.3, 1.2);
  const loyalty = Math.max(getTerritoryLoyalty(state, state.capitalId), CAPITAL_LOYALTY_FLOOR);
  const monthly = (Number(state.economy?.gdp) || 0) / 12;
  return {
    ...state,
    territories: { ...(state.territories ?? {}), [state.capitalId]: { ...(state.territories?.[state.capitalId] ?? {}), loyalty } },
    economy: { ...state.economy, cash: state.economy.cash + Math.round(monthly * CAPITAL_TRIBUTE_RATE * (loyalty / 100)) },
    regime: { ...state.regime, unrest: clamp((Number(state.regime?.unrest) || 0) + alienation, 0, 100) },
    factions: adjustFactions(state.factions, { trabalhadores: -0.3 }),
  };
}
