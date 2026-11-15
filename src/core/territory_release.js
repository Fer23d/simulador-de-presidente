// Abrir mao de um territorio anexado: doar a um aliado (ele fica com a terra) ou soltar como fantoche (volta a existir
// como pais independente, mas subordinado a voce). Ambos reduzem seu pais e rendem pontos na ONU.
import { createGeopolitics } from './geopolitics.js';
import { getCapitalId, getDeployed } from './deployments.js';
import { adjustFactions } from './factions.js';
import { normalizeMilitary } from './military.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const PUPPET_ONU_BONUS = 8;
export const DONATION_ONU_BONUS = 3;
export const DONATION_RELATION_BONUS = 30;
export const PUPPET_RELATION = 60;

const find = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });
const fresh = (state, id) => createGeopolitics(state.country.id).contacts.find((contact) => contact.id === id) ?? {};

export function getReleaseStatus(state, territoryId) {
  const territory = find(state, territoryId);
  if (!territory || !territory.anexado) return { available: false, reason: 'Só vale para territórios que você anexou.' };
  if (getCapitalId(state) === territoryId) return { available: false, reason: 'Devolva a sede do governo para casa antes.' };
  return { available: true, reason: '' };
}

export function getDonationTargets(state, territoryId) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.alliance && !contact.destruido && !contact.anexado && !contact.annexedBy && !contact.atWar && contact.id !== territoryId && contact.id !== state.country.id);
}

// Tira o territorio das maos do jogador: remove tropas, registro de territorio e a parte dele na populacao/area/PIB.
function detach(state, territoryId) {
  const base = fresh(state, territoryId);
  const { [territoryId]: removedTerritory, ...territories } = state.territories ?? {};
  const { [territoryId]: removedForce, ...deployments } = state.deployments ?? {};
  const survivors = getDeployed(state, territoryId);
  const army = state.military.exercito;
  const loss = (key, source) => Math.max(1, (Number(state.country?.[key]) || 0) - (Number(source) || 0));
  return {
    ...state,
    deployments,
    territories,
    country: {
      ...state.country,
      area_km2: loss('area_km2', base.area_km2),
      populacao: loss('populacao', base.population),
      populacao_base: loss('populacao_base', base.population),
      pib_base: loss('pib_base', base.pib_base),
    },
    geopolitics: { ...state.geopolitics, annexedCountryIds: (state.geopolitics.annexedCountryIds ?? []).filter((id) => id !== territoryId) },
    military: normalizeMilitary({ ...state.military, exercito: { ...army, soldados: count(army.soldados) + count(survivors.soldiers), blindados: count(army.blindados) + count(survivors.armor) } }),
  };
}

const changeOnu = (state, amount) => ({ ...state, geopolitics: { ...state.geopolitics, onuScore: clamp((Number(state.geopolitics.onuScore) || 0) + amount, 0, 100) } });

export function releaseAsPuppet(state, territoryId) {
  const status = getReleaseStatus(state, territoryId);
  if (!status.available) return { ...state, notice: status.reason };
  const territory = find(state, territoryId);
  const base = fresh(state, territoryId);
  let next = detach(state, territoryId);
  next = patchContact(next, territoryId, {
    anexado: false, annexed: false, destruido: false, atWar: false, annexedBy: null, donated: false,
    puppet: true, is_puppet_of: 'jogador', alliance: false, relation: PUPPET_RELATION,
    pib_base: base.pib_base ?? 0, population: base.population ?? 0, populacao_base: base.population ?? 0, area_km2: base.area_km2 ?? 0,
    cash: base.cash ?? 0, uranium: base.uranium ?? 0, steel: base.steel ?? 0, rare_earths: base.rare_earths ?? 0,
    ...(base.military ? { military: base.military } : {}),
    militaryPower: Math.max(5, Math.round((Number(base.militaryPower) || 10) * 0.4)),
  });
  next = changeOnu(next, PUPPET_ONU_BONUS);
  next = { ...next, factions: adjustFactions(next.factions, { militares: -2, elite: -1, trabalhadores: 1 }) };
  return { ...next, notice: `${territory.name} deixou de ser território seu e virou fantoche: independente no papel, subordinado a você. A ONU aprovou (+${PUPPET_ONU_BONUS}).` };
}

export function donateTerritory(state, territoryId, allyId) {
  const status = getReleaseStatus(state, territoryId);
  if (!status.available) return { ...state, notice: status.reason };
  const ally = getDonationTargets(state, territoryId).find((contact) => contact.id === allyId);
  if (!ally) return { ...state, notice: 'Só é possível doar a um aliado que não esteja em guerra.' };
  const territory = find(state, territoryId);
  const base = fresh(state, territoryId);
  let next = detach(state, territoryId);
  next = patchContact(next, territoryId, { annexedBy: allyId, donated: true, anexado: false, annexed: false, destruido: true, atWar: false, militaryPower: 0 });
  next = patchContact(next, allyId, (contact) => ({
    relation: clamp((Number(contact.relation) || 0) + DONATION_RELATION_BONUS, -100, 100),
    pib_base: (Number(contact.pib_base) || 0) + (Number(base.pib_base) || 0),
    population: (Number(contact.population) || 0) + (Number(base.population) || 0),
    area_km2: (Number(contact.area_km2) || 0) + (Number(base.area_km2) || 0),
    militaryPower: (Number(contact.militaryPower) || 0) + Math.round((Number(base.militaryPower) || 10) * 0.3),
  }));
  next = changeOnu(next, DONATION_ONU_BONUS);
  next = { ...next, factions: adjustFactions(next.factions, { militares: -3, elite: -1 }) };
  return { ...next, notice: `${territory.name} foi doado a ${ally.name}. A relação subiu ${DONATION_RELATION_BONUS} pontos e a ONU viu com bons olhos (+${DONATION_ONU_BONUS}), mas os militares não gostaram.` };
}
