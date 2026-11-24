// Modo competitivo local: uma partida passa o controle entre 2 e 6 jogadores
// no mesmo aparelho. O estado continua imutavel: cada acao devolve um novo
// objeto e o mapa existente continua sendo a fonte visual dos territorios.
import { WAR_COUNTRY_IDS } from '../data/war_countries.js';

export const MAX_MISSION_PLAYERS = 6;
export const MIN_MISSION_PLAYERS = 2;

export const COMPETITIVE_COLORS = Object.freeze([
  '#39ff14',
  '#35a7ff',
  '#ff4d6d',
  '#ffd166',
  '#c77dff',
  '#ff8c42',
]);

const REGION_IDS = Object.freeze({
  americas: new Set('arg bol bra can chl col cri cub dma dom ecu slv grd gtm guy hnd hti jam mex nic pan pry per lca vct sur tto ury usa ven atg bhs brb blz kna'.split(' ')),
  europe: new Set('alb and aut bel bih blr bgr hrv cyp cze dnk est fin fra deu grc hun isl irl ita lva lie ltu lux mlt mda mco mne nld mkd nor pol prt rou rus smr srb svk svn esp swe che tur ukr gbr vat xkx'.split(' ')),
  asia: new Set('afg arm aze bhr bgd btn brn khm chn geo ind idn irn irq isr jpn jor kaz kwt kgz lao lbn mys mdv mng mmr npl omn pak phl prk kor twn pse qat sau sgp lka syr tjk tha tls tkm are uzb vnm yem'.split(' ')),
  africa: new Set('dza ago ben bwa bfa bdi cpv cmr caf tcd com cog cod civ dji egy gnq eri swz eth gab gmb gha gin gnb ken lso lbr lby mdg mwi mli mrt mus mar moz nam ner nga rwa stp sen syc sle som zaf ssd sdn tgo tun uga tza zmb zwe esh'.split(' ')),
  oceania: new Set('aus fji kir mhl fsm nru nzl plw png wsm slb ton tuv vut cok niu'.split(' ')),
});

const REGION_LABELS = Object.freeze({
  americas: 'Américas',
  europe: 'Europa',
  asia: 'Ásia',
  africa: 'África',
  oceania: 'Oceania',
  other: 'Outros territórios',
});

const MISSION_CATALOG = Object.freeze([
  {
    id: 'dominate-region',
    title: 'Dominar uma região',
    description: 'Controle pelo menos 70% dos territórios de uma região do mapa.',
    kind: 'region',
  },
  {
    id: 'regional-bridge',
    title: 'Ponte entre continentes',
    description: 'Controle 60% de uma região e pelo menos 3 territórios fora dela.',
    kind: 'bridge',
  },
  {
    id: 'territorial-expansion',
    title: 'Expansão total',
    description: 'Controle 35% de todos os países jogáveis.',
    kind: 'territories',
  },
  {
    id: 'break-a-rival',
    title: 'Quebrar um rival',
    description: 'Elimine o império de um jogador adversário.',
    kind: 'eliminate',
  },
  {
    id: 'global-presence',
    title: 'Presença global',
    description: 'Controle ao menos 2 territórios em quatro regiões diferentes.',
    kind: 'global',
  },
  {
    id: 'strategic-majority',
    title: 'Maioria estratégica',
    description: 'Controle ao menos 45 territórios e mantenha seu território natal.',
    kind: 'majority',
  },
]);

const EMPTY_MODE = Object.freeze({
  active: false,
  players: [],
  currentPlayerId: null,
  turnNumber: 0,
  actionUsed: false,
  handoffRequired: false,
  winnerId: null,
  finished: false,
  lastBattle: null,
  eliminatedBy: {},
  playStyle: 'local',
  difficulty: 'medium',
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function randomIndex(random, length) {
  if (!length) return 0;
  return Math.min(length - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * length));
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(random, index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function allCountries(state) {
  const contacts = state?.geopolitics?.contacts ?? state?.world ?? [];
  const countries = [state?.country, ...contacts].filter((country) => country?.id);
  // Saves anteriores não tinham a seleção gravada: mantenha seu tabuleiro
  // inteiro, evitando apagar conquistas ou eliminar alguém durante o load.
  if (state?.missionMode?.active && !Array.isArray(state.missionMode.territoryIds)) return countries;
  const allowed = new Set(state?.missionMode?.active ? state.missionMode.territoryIds : WAR_COUNTRY_IDS);
  return countries.filter((country) => allowed.has(country.id));
}

export function getCountryRegion(countryOrId) {
  const id = typeof countryOrId === 'string' ? countryOrId : countryOrId?.id;
  if (!id) return 'other';
  return Object.entries(REGION_IDS).find(([, ids]) => ids.has(id))?.[0] ?? 'other';
}

export function getRegionLabel(regionId) {
  return REGION_LABELS[regionId] ?? REGION_LABELS.other;
}

export function getCompetitivePlayer(mode, playerId) {
  return mode?.players?.find((player) => player.id === playerId) ?? null;
}

export function getCurrentMissionPlayer(state) {
  const mode = state?.missionMode;
  return getCompetitivePlayer(mode, mode?.currentPlayerId);
}

export function getCountryOwner(state, countryId) {
  if (!state?.missionMode?.active) return null;
  if (Array.isArray(state.missionMode.territoryIds) && !state.missionMode.territoryIds.includes(countryId)) return null;
  if (state.country?.id === countryId) return state.country.ownerId ?? 'player-1';
  return (state.geopolitics?.contacts ?? []).find((country) => country.id === countryId)?.ownerId ?? null;
}

export function getCompetitivePlayerColor(mode, playerId) {
  const player = getCompetitivePlayer(mode, playerId);
  return player?.color ?? '#8b8b8b';
}

export function territoryCounts(state) {
  const counts = Object.fromEntries((state.missionMode?.players ?? []).map((player) => [player.id, 0]));
  for (const country of allCountries(state)) {
    const owner = country.id === state.country?.id ? state.country.ownerId : country.ownerId;
    if (owner && counts[owner] !== undefined) counts[owner] += 1;
  }
  return counts;
}

function territoriesOf(state, playerId) {
  return allCountries(state).filter((country) => {
    const owner = country.id === state.country?.id ? state.country.ownerId : country.ownerId;
    return owner === playerId;
  });
}

function missionForPlayer(mode, playerId) {
  return getCompetitivePlayer(mode, playerId)?.mission ?? null;
}

function regionStats(state, playerId, regionId) {
  const countries = allCountries(state).filter((country) => getCountryRegion(country) === regionId);
  const owned = countries.filter((country) => getCountryOwner(state, country.id) === playerId).length;
  return { owned, total: countries.length };
}

export function getMissionProgress(state, playerId = state?.missionMode?.currentPlayerId) {
  const mission = missionForPlayer(state?.missionMode, playerId);
  if (!mission) return { done: false, value: 0, target: 0, label: 'Nenhuma missão atribuída.' };
  const owned = territoriesOf(state, playerId);
  const counts = territoryCounts(state);
  if (mission.kind === 'region') {
    const stats = regionStats(state, playerId, mission.regionId);
    const target = Math.ceil(stats.total * (mission.share ?? 0.7));
    const enoughTerritories = owned.length >= (mission.minimumTerritories ?? 0);
    return { done: stats.total > 0 && stats.owned >= target && enoughTerritories, value: stats.owned, target, label: `${getRegionLabel(mission.regionId)}: ${stats.owned}/${target}${mission.minimumTerritories ? ` · total: ${owned.length}/${mission.minimumTerritories}` : ''}` };
  }
  if (mission.kind === 'bridge') {
    const stats = regionStats(state, playerId, mission.regionId);
    const outside = owned.filter((country) => getCountryRegion(country) !== mission.regionId).length;
    return { done: stats.total > 0 && stats.owned / stats.total >= 0.6 && outside >= 3, value: stats.owned, target: Math.ceil(stats.total * 0.6), label: `${getRegionLabel(mission.regionId)}: ${stats.owned}/${stats.total} · ponte: ${outside}/3` };
  }
  if (mission.kind === 'territories') {
    const target = mission.target ?? Math.ceil(allCountries(state).length * 0.35);
    return { done: owned.length >= target, value: owned.length, target, label: `${owned.length}/${target} territórios` };
  }
  if (mission.kind === 'eliminate') {
    const target = getCompetitivePlayer(state.missionMode, mission.targetPlayerId);
    const alive = (counts[mission.targetPlayerId] ?? 0) > 0;
    const eliminatedBy = state.missionMode.eliminatedBy?.[mission.targetPlayerId];
    if (!alive && eliminatedBy && eliminatedBy !== playerId) {
      const fallback = mission.fallbackTarget ?? Math.ceil(allCountries(state).length * .6);
      return { done: owned.length >= fallback, value: owned.length, target: fallback, label: `Rival eliminado por outro jogador. Objetivo alternativo: ${owned.length}/${fallback} territórios.` };
    }
    return { done: !alive, value: alive ? counts[mission.targetPlayerId] : 0, target: 0, label: `${target?.name ?? 'Rival'}: ${alive ? `${counts[mission.targetPlayerId]} territórios restantes` : 'eliminado'}` };
  }
  if (mission.kind === 'global') {
    const regions = Object.keys(REGION_IDS).filter((regionId) => territoriesOf(state, playerId).filter((country) => getCountryRegion(country) === regionId).length >= 2);
    return { done: regions.length >= 4, value: regions.length, target: 4, label: `${regions.length}/4 regiões com presença` };
  }
  const homeHeld = getCountryOwner(state, getCompetitivePlayer(state.missionMode, playerId)?.homeCountryId) === playerId;
  const target = 45;
  return { done: owned.length >= target && homeHeld, value: owned.length, target, label: `${owned.length}/${target} territórios${homeHeld ? '' : ' · território natal perdido'}` };
}

export function checkCompetitiveVictory(state, playerId = state?.missionMode?.currentPlayerId) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || !playerId) return state;
  const progress = getMissionProgress(state, playerId);
  if (!progress.done) return state;
  const player = getCompetitivePlayer(mode, playerId);
  return {
    ...state,
    missionMode: { ...mode, finished: true, winnerId: playerId, handoffRequired: false },
    notice: `MISSÃO CUMPRIDA: ${player?.name ?? 'Jogador'} venceu a partida competitiva.`,
  };
}

function missionCandidates(state, playerId) {
  const candidates = Object.keys(REGION_IDS).filter((regionId) => regionStats(state, playerId, regionId).total >= 4);
  return candidates.length ? candidates : ['americas', 'europe', 'asia'];
}

function assignMission(state, playerId, usedIds, random) {
  const initial = territoriesOf(state, playerId).length;
  const target = Math.min(allCountries(state).length, initial + Math.max(10, Math.ceil(allCountries(state).length * .12)));
  const deck = missionCandidates(state, playerId).filter((id) => {
    const stats = regionStats(state, playerId, id);
    return stats.owned < stats.total;
  }).map((regionId) => ({ id: `dominate-${regionId}`, kind: 'region', regionId, share: 1,
    minimumTerritories: target, title: `Dominar ${getRegionLabel(regionId)}`,
    description: `Conquiste todos os países de ${getRegionLabel(regionId)} presentes no tabuleiro e mantenha pelo menos ${target} territórios no total.` }));
  for (const rival of state.missionMode.players.filter((player) => player.id !== playerId)) {
    deck.push({ id: `eliminate-${rival.id}`, kind: 'eliminate', targetPlayerId: rival.id,
      fallbackTarget: target, title: `Eliminar ${rival.name}`,
      description: `Tome o último território de ${rival.name}. Se outro jogador o eliminar, conquiste ${target} territórios no total.` });
  }
  deck.push({ id: 'territorial-expansion', kind: 'territories', target,
    title: `Conquistar ${target} territórios`, description: `Controle ${target} países ao mesmo tempo, em qualquer região do mundo.` });
  const available = deck.filter((mission) => !usedIds.has(mission.id));
  const candidates = available.length ? available : deck;
  return candidates[randomIndex(random, candidates.length)];
}

export function createMissionMode() {
  return { ...EMPTY_MODE, players: [], territoryIds: [...WAR_COUNTRY_IDS] };
}

export function normalizeMissionMode(value) {
  if (!value?.active || !Array.isArray(value.players)) return createMissionMode();
  const players = value.players.filter((player) => player?.id && player?.mission).slice(0, MAX_MISSION_PLAYERS).map((player, index) => ({
    id: String(player.id),
    name: String(player.name || `Jogador ${index + 1}`).slice(0, 32),
    color: player.color || COMPETITIVE_COLORS[index % COMPETITIVE_COLORS.length],
    homeCountryId: typeof player.homeCountryId === 'string' ? player.homeCountryId : null,
    mission: { ...player.mission },
    isBot: Boolean(player.isBot),
  }));
  if (players.length < MIN_MISSION_PLAYERS) return createMissionMode();
  return {
    active: true,
    playStyle: ['bots', 'online'].includes(value.playStyle) ? value.playStyle : 'local',
    difficulty: ['easy', 'hard'].includes(value.difficulty) ? value.difficulty : 'medium',
    territoryIds: Array.isArray(value.territoryIds)
      ? [...new Set(value.territoryIds.filter((id) => typeof id === 'string' && /^[a-z]{3}$/.test(id)))]
      : null,
    players,
    currentPlayerId: players.some((player) => player.id === value.currentPlayerId) ? value.currentPlayerId : players[0].id,
    turnNumber: Math.max(1, Math.floor(Number(value.turnNumber) || 1)),
    actionUsed: Boolean(value.actionUsed),
    handoffRequired: Boolean(value.handoffRequired),
    winnerId: players.some((player) => player.id === value.winnerId) ? value.winnerId : null,
    finished: Boolean(value.finished),
    lastBattle: value.lastBattle && typeof value.lastBattle === 'object' ? { ...value.lastBattle } : null,
    eliminatedBy: value.eliminatedBy && typeof value.eliminatedBy === 'object' ? { ...value.eliminatedBy } : {},
  };
}

export function startMissionMatch(state, playerCount = 2, playerNames = [], random = Math.random, options = {}) {
  if (state?.missionMode?.active) return state;
  const count = clamp(Math.floor(Number(playerCount) || 0), MIN_MISSION_PLAYERS, MAX_MISSION_PLAYERS);
  if (state?.is_wasteland || state?.city) return { ...state, notice: 'O modo de missões usa o mapa geopolítico antes do Wasteland.' };
  const ids = Array.from({ length: count }, (_, index) => `player-${index + 1}`);
  const names = ids.map((id, index) => String(playerNames[index] || `Jogador ${index + 1}`).trim().slice(0, 32) || id);
  const countries = allCountries(state);
  const home = countries.find((country) => country.id === state.country.id)
    ?? countries.find((country) => country.id === 'bra') ?? countries[0];
  const shuffledCountries = shuffled(countries.filter((country) => country.id !== home.id), random);
  const firstHomes = [home, ...shuffledCountries.slice(0, count - 1)];
  const ownerByCountry = new Map(firstHomes.map((country, index) => [country.id, ids[index]]));
  shuffledCountries.slice(count - 1).forEach((country, index) => ownerByCountry.set(country.id, ids[index % count]));
  const playStyle = ['bots', 'online'].includes(options.playStyle) ? options.playStyle : 'local';
  const difficulty = ['easy', 'hard'].includes(options.difficulty) ? options.difficulty : 'medium';
  const playersBase = ids.map((id, index) => ({ id, name: names[index], color: COMPETITIVE_COLORS[index], homeCountryId: firstHomes[index].id, mission: null, isBot: playStyle === 'bots' && index > 0 }));
  const modeBase = { ...createMissionMode(), playStyle, difficulty, territoryIds: countries.map((country) => country.id), active: true, players: playersBase, currentPlayerId: ids[0], turnNumber: 1, handoffRequired: playStyle === 'local' };
  const prepared = {
    ...state,
    country: { ...state.country, ownerId: ownerByCountry.get(state.country.id) ?? null },
    geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((country) => ({ ...country, ownerId: ownerByCountry.get(country.id) ?? null })) },
    missionMode: { ...modeBase, players: playersBase },
  };
  const usedIds = new Set();
  const players = playersBase.map((player) => {
    const mission = assignMission(prepared, player.id, usedIds, random);
    usedIds.add(mission.id);
    return { ...player, mission };
  });
  return {
    ...prepared,
    world: prepared.geopolitics.contacts,
    missionMode: { ...modeBase, players },
    notice: `Partida iniciada: ${count} jogadores. ${players[0].name}, leia sua missão secreta.`,
  };
}

export function canAttackTerritory(state, targetId) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired || mode.actionUsed) return { ok: false, reason: 'O jogador já agiu neste turno ou a partida está pausada.' };
  const target = allCountries(state).find((country) => country.id === targetId);
  if (!target) return { ok: false, reason: 'Território não encontrado no mapa.' };
  const owner = getCountryOwner(state, targetId);
  if (!owner || owner === mode.currentPlayerId) return { ok: false, reason: 'Esse território já está sob seu controle.' };
  if (!territoriesOf(state, mode.currentPlayerId).length) return { ok: false, reason: 'Este jogador foi eliminado.' };
  return { ok: true, reason: 'Ataque autorizado.' };
}

export function conquerTerritory(state, targetId, random = Math.random) {
  const status = canAttackTerritory(state, targetId);
  if (!status.ok) return { ...state, notice: status.reason };
  const mode = state.missionMode;
  const attackerId = mode.currentPlayerId;
  const target = allCountries(state).find((country) => country.id === targetId);
  // Um dado por ofensiva, com as mesmas chances para todos os territórios.
  // A ordem invertida mantém random=0 como sucesso nos testes determinísticos.
  const roll = 6 - randomIndex(random, 6);
  const won = roll >= 4;
  const lastBattle = { targetId, attackerId, roll, won };
  const targetName = target.name ?? target.nome;
  if (!won) {
    return { ...state, missionMode: { ...mode, actionUsed: true, lastBattle }, notice: `Dado ${roll}: ataque repelido em ${targetName}. Encerre seu turno.` };
  }
  const previousOwner = getCountryOwner(state, targetId);
  const contacts = state.geopolitics.contacts.map((country) => country.id === targetId ? { ...country, ownerId: attackerId } : country);
  let next = { ...state, country: state.country.id === targetId ? { ...state.country, ownerId: attackerId } : state.country,
    geopolitics: { ...state.geopolitics, contacts }, world: contacts, missionMode: { ...mode, actionUsed: true, lastBattle },
    notice: `Dado ${roll}: ${targetName} conquistado por ${getCompetitivePlayer(mode, attackerId)?.name ?? attackerId}.` };
  if (!territoryCounts(next)[previousOwner]) next = { ...next, missionMode: { ...next.missionMode,
    eliminatedBy: { ...mode.eliminatedBy, [previousOwner]: attackerId } } };
  return checkCompetitiveVictory(next, attackerId);
}

export function revealMissionTurn(state) {
  if (!state?.missionMode?.active || !state.missionMode.handoffRequired) return state;
  return { ...state, missionMode: { ...state.missionMode, handoffRequired: false }, notice: `${getCompetitivePlayer(state.missionMode, state.missionMode.currentPlayerId)?.name ?? 'Jogador'}, seu turno começou.` };
}

export function advanceMissionTurn(state) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired) return state;
  const counts = territoryCounts(state);
  const playerIds = mode.players.map((player) => player.id);
  const currentIndex = Math.max(0, playerIds.indexOf(mode.currentPlayerId));
  let nextIndex = (currentIndex + 1) % playerIds.length;
  while (!counts[playerIds[nextIndex]] && nextIndex !== currentIndex) nextIndex = (nextIndex + 1) % playerIds.length;
  const nextPlayerId = playerIds[nextIndex];
  const nextTurn = nextIndex <= currentIndex ? mode.turnNumber + 1 : mode.turnNumber;
  return {
    ...state,
    missionMode: { ...mode, currentPlayerId: nextPlayerId, turnNumber: nextTurn, actionUsed: false, handoffRequired: !mode.playStyle || mode.playStyle === 'local' },
    notice: `Turno de ${getCompetitivePlayer(mode, nextPlayerId)?.name ?? nextPlayerId}.`,
  };
}

export function exitMissionMatch(state) {
  const contacts = state.geopolitics.contacts.map(({ ownerId, ...country }) => country);
  const { ownerId, ...country } = state.country;
  return { ...state, country, geopolitics: { ...state.geopolitics, contacts }, world: contacts, missionMode: createMissionMode(), notice: 'Configure uma nova partida de War.' };
}

export function listMissionCatalog() {
  return MISSION_CATALOG.map((mission) => ({ ...mission }));
}
