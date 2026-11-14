// Missoes historicas: o jogador escolhe uma (ve o dossie da historia) e precisa anexar todos os paises do imperio.
// Ao cumprir, recebe a recompensa e um card de epilogo com os numeros da sua campanha.
import { MISSIONS } from '../data/historical_missions.js';
import { adjustFactions } from './factions.js';
import { createGeopolitics } from './geopolitics.js';


export function createMissions() {
  return { active: null, completed: {}, pendingEpilogue: null };
}

export function normalizeMissions(value) {
  const base = createMissions();
  if (!value || typeof value !== 'object') return base;
  const int = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Math.floor(Number(n)) : fallback);
  const active = value.active && MISSIONS[value.active.id]
    ? { id: value.active.id, startMonth: int(value.active.startMonth), warsBaseline: Math.max(0, int(value.active.warsBaseline)) }
    : null;
  const completed = {};
  for (const [id, entry] of Object.entries(value.completed ?? {})) {
    if (!MISSIONS[id] || !entry) continue;
    completed[id] = { startMonth: int(entry.startMonth), endMonth: int(entry.endMonth), months: Math.max(0, int(entry.months)), wars: Math.max(0, int(entry.wars)), population: Math.max(0, Number(entry.population) || 0), area: Math.max(0, Number(entry.area) || 0), targets: Math.max(0, int(entry.targets)) };
  }
  return { active, completed, pendingEpilogue: MISSIONS[value.pendingEpilogue] && completed[value.pendingEpilogue] ? value.pendingEpilogue : null };
}

const view = (state) => normalizeMissions(state.missions);
const monthOf = (state) => Number(state.monthCounter) || 0;
const contactOf = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

// O pais do jogador, se estiver na lista, conta como ja reunido.
export function getTargets(state, missionId) {
  return (MISSIONS[missionId]?.targets ?? []).filter((id) => id !== state.country?.id);
}

export function getTargetStatus(state, targetId) {
  const contact = contactOf(state, targetId);
  if (!contact) return 'lost';
  if (contact.anexado || contact.annexed) return 'mine';
  if (contact.annexedBy) return 'rival';
  if (contact.wasteland) return 'lost';
  if (contact.destruido) return 'lost';
  if (contact.atWar) return 'war';
  if (contact.puppet && contact.is_puppet_of === 'jogador') return 'puppet';
  return 'free';
}

export function getProgress(state, missionId) {
  const items = getTargets(state, missionId).map((id) => ({ id, name: contactOf(state, id)?.name ?? id, status: getTargetStatus(state, id) }));
  const done = items.filter((item) => item.status === 'mine').length;
  return { items, done, total: items.length, lost: items.filter((item) => item.status === 'lost').length };
}

export function getMissionStatus(state, missionId) {
  const data = view(state);
  if (!MISSIONS[missionId]) return { available: false, reason: 'Missão desconhecida.' };
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  if (data.completed[missionId]) return { available: false, reason: 'Missão já cumprida.', done: true };
  if (data.active?.id === missionId) return { available: false, reason: 'Missão em andamento.', running: true };
  if (data.active) return { available: false, reason: 'Termine ou abandone a missão atual antes de começar outra.' };
  return { available: true, reason: '' };
}

export function startMission(state, missionId) {
  const status = getMissionStatus(state, missionId);
  if (!status.available) return { ...state, notice: status.reason };
  const wars = Number(state.reputation?.stats?.warsDeclared) || 0;
  return { ...state, missions: { ...view(state), active: { id: missionId, startMonth: monthOf(state), warsBaseline: wars } }, notice: `Missão aceita: ${MISSIONS[missionId].title}. ${MISSIONS[missionId].objective}` };
}

export function abandonMission(state) {
  const data = view(state);
  if (!data.active) return { ...state, notice: 'Nenhuma missão em andamento.' };
  return { ...state, missions: { ...data, active: null }, notice: `Você abandonou a missão "${MISSIONS[data.active.id].title}". Pode retomá-la quando quiser.` };
}

export function dismissEpilogue(state) {
  const data = view(state);
  return data.pendingEpilogue ? { ...state, missions: { ...data, pendingEpilogue: null } } : state;
}

// Chamada depois de cada anexacao e no fim de cada mes.
export function checkMissions(state) {
  if (!isActiveGame(state)) return state;
  const data = view(state);
  if (!data.active) return state;
  const mission = MISSIONS[data.active.id];
  const progress = getProgress(state, mission.id);
  if (!progress.total || progress.done < progress.total) return state;
  const fresh = createGeopolitics(state.country.id).contacts;
  const gathered = progress.items.map((item) => fresh.find((contact) => contact.id === item.id)).filter(Boolean);
  const month = monthOf(state);
  const wars = Math.max(0, (Number(state.reputation?.stats?.warsDeclared) || 0) - data.active.warsBaseline);
  const entry = {
    startMonth: data.active.startMonth, endMonth: month, months: Math.max(0, month - data.active.startMonth), wars,
    population: gathered.reduce((sum, contact) => sum + (Number(contact.population) || 0), 0),
    area: gathered.reduce((sum, contact) => sum + (Number(contact.area_km2) || 0), 0),
    targets: progress.total,
  };
  const gdp = Number(state.economy?.gdp) || 0;
  const rewarded = {
    ...state,
    economy: { ...state.economy, cash: (Number(state.economy.cash) || 0) + (gdp * mission.reward.cashRate) },
    factions: adjustFactions(state.factions, mission.reward.factions),
    missions: { active: null, completed: { ...data.completed, [mission.id]: entry }, pendingEpilogue: mission.id },
    notice: `Missão cumprida: ${mission.title}! Recompensa: ${mission.reward.label}.`,
  };
  return rewarded;
}

export const processMissions = checkMissions;

export function describeMissionTime(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ano${years > 1 ? 's' : ''}`);
  if (rest || !years) parts.push(`${rest} mês${rest === 1 ? '' : 'es'}`);
  return parts.join(' e ');
}

export function missionCompletedCount(state) {
  return Object.keys(view(state).completed).length;
}

