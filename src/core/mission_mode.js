// Modo competitivo local: uma partida passa o controle entre 2 e 6 jogadores
// no mesmo aparelho. O estado continua imutavel: cada acao devolve um novo
// objeto e o mapa existente continua sendo a fonte visual dos territorios.
import { WAR_COUNTRY_IDS } from '../data/war_countries.js';
import { WAR_ADJACENCY } from '../data/war_adjacency.js';
import { clampDice } from './war_odds.js';

export const MAX_MISSION_PLAYERS = 6;
export const MIN_MISSION_PLAYERS = 2;
export const reinforcementsPerTurn = (playerCount) => Math.max(3, 8 - Math.max(MIN_MISSION_PLAYERS, Math.min(MAX_MISSION_PLAYERS, Number(playerCount) || MIN_MISSION_PLAYERS)));

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
  activeBattle: null,
  eliminatedBy: {},
  playStyle: 'local',
  difficulty: 'medium',
  turnLimitSeconds: 60,
  troopsPerTurn: 3,
  troopsByCountry: {},
  fortifiedCountries: {},
  initialTroopsPerPlayer: 5,
  mobilizedThisTurn: 0,
  turnDeadline: null,
  history: [],
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
  const rawBattle = value.activeBattle && typeof value.activeBattle === 'object' ? value.activeBattle : null;
  const activeBattle = rawBattle
    && /^[a-z]{3}$/.test(rawBattle.sourceId ?? '')
    && /^[a-z]{3}$/.test(rawBattle.targetId ?? '')
    && players.some((player) => player.id === rawBattle.attackerId)
    && Number.isInteger(rawBattle.attackingRemaining) && rawBattle.attackingRemaining > 0
    && Number.isInteger(rawBattle.defendersRemaining) && rawBattle.defendersRemaining > 0
    ? { sourceId: rawBattle.sourceId, targetId: rawBattle.targetId, attackerId: rawBattle.attackerId,
      attackingRemaining: rawBattle.attackingRemaining, defendersRemaining: rawBattle.defendersRemaining,
      round: Math.max(0, Math.floor(Number(rawBattle.round) || 0)),
      diceCount: [1, 2, 3].includes(Number(rawBattle.diceCount)) ? Number(rawBattle.diceCount) : null }
    : null;
  return {
    active: true,
    playStyle: ['bots', 'online'].includes(value.playStyle) ? value.playStyle : 'local',
    difficulty: ['easy', 'hard'].includes(value.difficulty) ? value.difficulty : 'medium',
    turnLimitSeconds: 60,
    troopsPerTurn: reinforcementsPerTurn(players.length),
    troopsByCountry: value.troopsByCountry && typeof value.troopsByCountry === 'object' ? { ...value.troopsByCountry } : {},
    fortifiedCountries: value.fortifiedCountries && typeof value.fortifiedCountries === 'object' ? { ...value.fortifiedCountries } : {},
    initialTroopsPerPlayer: 5,
    mobilizedThisTurn: Math.max(0, Math.min(reinforcementsPerTurn(players.length), Math.floor(Number(value.mobilizedThisTurn) || 0))),
    turnDeadline: Number.isFinite(Number(value.turnDeadline)) ? Number(value.turnDeadline) : null,
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
    activeBattle,
    eliminatedBy: value.eliminatedBy && typeof value.eliminatedBy === 'object' ? { ...value.eliminatedBy } : {},
    history: seedHistory(normalizeHistory(value.history), value),
  };
}

function startMissionMatchCore(state, playerCount = 2, playerNames = [], random = Math.random, options = {}) {
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
  const troopsByCountry = {};
  for (const playerId of ids) {
    const holdings = countries.filter((country) => ownerByCountry.get(country.id) === playerId);
    const placements = shuffled(holdings, random).slice(0, Math.min(5, holdings.length));
    placements.forEach((country) => { troopsByCountry[country.id] = 1; });
  }
  const modeBase = { ...createMissionMode(), playStyle, difficulty, troopsPerTurn: reinforcementsPerTurn(count), troopsByCountry, turnDeadline: Date.now() + 60_000, territoryIds: countries.map((country) => country.id), active: true, players: playersBase, currentPlayerId: ids[0], turnNumber: 1, handoffRequired: playStyle === 'local' };
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

export function getAdjacentAttackOrigins(state, targetId, playerId = state?.missionMode?.currentPlayerId) {
  const countries = allCountries(state);
  return (WAR_ADJACENCY[targetId] ?? []).map((id) => countries.find((country) => country.id === id)).filter((country) =>
    country && getCountryOwner(state, country.id) === playerId && (Number(state.missionMode?.troopsByCountry?.[country.id]) || 0) >= 2);
}

export function getAdjacentAttackTargets(state, sourceId, playerId = state?.missionMode?.currentPlayerId) {
  const sourceTroops = Number(state?.missionMode?.troopsByCountry?.[sourceId]) || 0;
  if (sourceTroops < 2 || state?.missionMode?.activeBattle || getCountryOwner(state, sourceId) !== playerId) return [];
  const countries = allCountries(state);
  return (WAR_ADJACENCY[sourceId] ?? []).map((id) => countries.find((country) => country.id === id)).filter((country) =>
    country && getCountryOwner(state, country.id) !== playerId);
}

export function getLegalAttacks(state, playerId = state?.missionMode?.currentPlayerId) {
  const countries = allCountries(state);
  return Object.entries(WAR_ADJACENCY).flatMap(([targetId, origins]) => origins.flatMap((sourceId) => {
    const source = countries.find((country) => country.id === sourceId);
    if (!source || getCountryOwner(state, sourceId) !== playerId || getCountryOwner(state, targetId) === playerId) return [];
    const available = Math.max(0, (Number(state.missionMode?.troopsByCountry?.[sourceId]) || 0) - 1);
    return available ? [{ sourceId, targetId, maxTroops: available }] : [];
  }));
}

export function canAttackTerritory(state, targetId, sourceId, attackingTroops = 1) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired) return { ok: false, reason: 'O turno está pausado ou a partida terminou.' };
  if (mode.activeBattle) return { ok: false, reason: 'Resolva a batalha em andamento antes de iniciar outro ataque.' };
  if (mode.turnDeadline && Date.now() >= mode.turnDeadline) return { ok: false, reason: 'O tempo acabou. O turno está sendo passado.' };
  const target = allCountries(state).find((country) => country.id === targetId);
  if (!target) return { ok: false, reason: 'Território não encontrado no mapa.' };
  const owner = getCountryOwner(state, targetId);
  if (!owner || owner === mode.currentPlayerId) return { ok: false, reason: 'Esse território já está sob seu controle.' };
  if (!(WAR_ADJACENCY[targetId] ?? []).includes(sourceId)) return { ok: false, reason: 'Só é possível atacar um país vizinho que faça fronteira com o território escolhido.' };
  if (getCountryOwner(state, sourceId) !== mode.currentPlayerId) return { ok: false, reason: 'Escolha um território de origem que esteja sob seu controle.' };
  const originTroops = Number(mode.troopsByCountry?.[sourceId]) || 0;
  if (!Number.isInteger(attackingTroops) || attackingTroops < 1 || attackingTroops >= originTroops) return { ok: false, reason: 'Envie tropas disponíveis e deixe pelo menos 1 no território de origem.' };
  if (!territoriesOf(state, mode.currentPlayerId).length) return { ok: false, reason: 'Este jogador foi eliminado.' };
  return { ok: true, reason: 'Ataque autorizado.' };
}

function mobilizeTroopsCore(state, countryId, amount = 1) {
  const mode = state?.missionMode;
  const playerId = mode?.currentPlayerId;
  const country = allCountries(state).find((item) => item.id === countryId);
  const count = Math.floor(Number(amount));
  if (!mode?.active || mode.finished || mode.handoffRequired || mode.activeBattle || mode.actionUsed || !country || getCountryOwner(state, countryId) !== playerId) return { ...state, notice: 'Só é possível mobilizar reforços no seu turno, antes de atacar.' };
  if (!Number.isInteger(count) || count < 1 || count > mode.troopsPerTurn || mode.mobilizedThisTurn + count > mode.troopsPerTurn) return { ...state, notice: `Você pode mobilizar até ${mode.troopsPerTurn} tropas por turno.` };
  const troopsByCountry = { ...mode.troopsByCountry, [countryId]: (mode.troopsByCountry[countryId] ?? 0) + count };
  return { ...state, missionMode: { ...mode, troopsByCountry, mobilizedThisTurn: mode.mobilizedThisTurn + count }, notice: `${count} tropa(s) mobilizada(s) em ${country.name ?? country.nome}.` };
}

function fortifyTerritoryCore(state, countryId) {
  const mode = state?.missionMode;
  const country = allCountries(state).find((item) => item.id === countryId);
  if (!mode?.active || mode.finished || mode.handoffRequired || mode.activeBattle || mode.actionUsed || !country || getCountryOwner(state, countryId) !== mode.currentPlayerId) {
    return { ...state, notice: 'Só é possível fortificar um território seu durante seu turno.' };
  }
  if (mode.fortifiedCountries?.[countryId]) return { ...state, notice: 'Este território já está fortificado.' };
  if (mode.mobilizedThisTurn + 2 > mode.troopsPerTurn) return { ...state, notice: 'São necessários 2 reforços disponíveis para fortificar.' };
  return { ...state, missionMode: { ...mode, fortifiedCountries: { ...mode.fortifiedCountries, [countryId]: true }, mobilizedThisTurn: mode.mobilizedThisTurn + 2 }, notice: `${country.name ?? country.nome} fortificado: +1 no melhor dado da defesa até ser conquistado.` };
}

// diceCount (1 a 3): quantos dados o atacante rola em cada rodada (padrao: o maximo possivel).
export function conquerTerritory(state, targetId, sourceId, attackingTroops = 1, random = Math.random, diceCount = null) {
  const status = canAttackTerritory(state, targetId, sourceId, attackingTroops);
  if (!status.ok) return { ...state, notice: status.reason };
  const mode = state.missionMode;
  const attackerId = mode.currentPlayerId;
  const stationed = Math.max(0, Number(mode.troopsByCountry?.[targetId]) || 0);
  const troopsByCountry = { ...mode.troopsByCountry, [sourceId]: mode.troopsByCountry[sourceId] - attackingTroops };
  return resolveBattleRound({ ...state, missionMode: { ...mode, troopsByCountry,
    activeBattle: { sourceId, targetId, attackerId, attackingRemaining: attackingTroops, defendersRemaining: stationed, round: 0, diceCount: [1, 2, 3].includes(Number(diceCount)) ? Number(diceCount) : null } } }, random);
}

function resolveBattleRoundCore(state, random) {
  const mode = state.missionMode;
  const battle = mode.activeBattle;
  if (!battle) return state;
  const { sourceId, targetId, attackerId } = battle;
  const target = allCountries(state).find((country) => country.id === targetId);
  if (!target) return { ...state, notice: 'O território da batalha não está mais no tabuleiro.' };
  const attacking = battle.attackingRemaining;
  const defending = battle.defendersRemaining;
  const fortified = Boolean(mode.fortifiedCountries?.[targetId]);
  const rollDice = (count) => Array.from({ length: count }, () => 6 - randomIndex(random, 6)).sort((a, b) => b - a);
  const attackDice = rollDice(clampDice(battle.diceCount, attacking));
  // Fortificacao: +1 apenas no melhor dado da defesa (rollDice ja devolve em ordem decrescente).
  const rolledDefense = rollDice(Math.min(2, defending));
  const defenseDice = rolledDefense.map((die, index) => (index === 0 ? Math.min(6, die + Number(fortified)) : die)).sort((a, b) => b - a);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let index = 0; index < Math.min(attackDice.length, defenseDice.length); index += 1) {
    // Empate favorece a defesa, como no sistema clássico de Risk.
    if (attackDice[index] > defenseDice[index]) defenderLosses += 1;
    else attackerLosses += 1;
  }
  const attackersRemaining = attacking - attackerLosses;
  const defendersRemaining = defending - defenderLosses;
  const won = defendersRemaining === 0;
  const defeated = attackersRemaining === 0;
  const roll = attackDice[0];
  const lastBattle = { targetId, sourceId, attackerId, roll, won, defeated, round: battle.round + 1,
    attackingTroops: attacking, attackDice, defenseDice, fortifyFrom: fortified && rolledDefense.length ? rolledDefense[0] : null, attackerLosses, defenderLosses,
    attackersRemaining, defendersRemaining, defenseTroops: defending, fortified };
  const targetName = target.name ?? target.nome;
  if (!won && !defeated) {
    const troopsByCountry = { ...mode.troopsByCountry, [targetId]: defendersRemaining };
    return { ...state, missionMode: { ...mode, troopsByCountry, activeBattle: { ...battle, attackingRemaining: attackersRemaining,
      defendersRemaining, round: battle.round + 1 }, lastBattle, actionUsed: true },
    notice: `Rodada ${lastBattle.round}: ataque ${attackDice.join(',')} contra defesa ${defenseDice.join(',')}. Perdas: ${attackerLosses} suas, ${defenderLosses} defensoras. Continuar ou recuar?` };
  }
  if (defeated) {
    const fortifiedCountries = { ...mode.fortifiedCountries };
    if (won) delete fortifiedCountries[targetId];
    const troopsByCountry = { ...mode.troopsByCountry, [targetId]: defendersRemaining };
    const diceText = `ataque ${attackDice.join(',')} contra defesa ${defenseDice.join(',')}`;
    return { ...state, missionMode: { ...mode, troopsByCountry, activeBattle: null, fortifiedCountries, actionUsed: true, lastBattle },
      notice: `Rodada ${lastBattle.round}: os defensores de ${targetName} resistiram (${diceText}). A força atacante foi eliminada.` };
  }
  const previousOwner = getCountryOwner(state, targetId);
  const contacts = state.geopolitics.contacts.map((country) => country.id === targetId ? { ...country, ownerId: attackerId } : country);
  const troopsByCountry = { ...mode.troopsByCountry };
  troopsByCountry[targetId] = attackersRemaining;
  const fortifiedCountries = { ...mode.fortifiedCountries };
  delete fortifiedCountries[targetId];
  let next = { ...state, country: state.country.id === targetId ? { ...state.country, ownerId: attackerId } : state.country,
    geopolitics: { ...state.geopolitics, contacts }, world: contacts,
    missionMode: { ...mode, troopsByCountry, activeBattle: null, fortifiedCountries, actionUsed: true, lastBattle },
    notice: `Rodada ${lastBattle.round}: ${targetName} conquistado com ${attackersRemaining} tropa(s) sobrevivente(s).` };
  if (!territoryCounts(next)[previousOwner]) next = { ...next, missionMode: { ...next.missionMode,
    eliminatedBy: { ...mode.eliminatedBy, [previousOwner]: attackerId } } };
  return checkCompetitiveVictory(next, attackerId);
}

export function continueBattle(state, random = Math.random, diceCount = null) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired || !mode.activeBattle) return state;
  if (mode.activeBattle.attackerId !== mode.currentPlayerId) return { ...state, notice: 'Esta batalha não pertence ao jogador do turno.' };
  if (mode.turnDeadline && Date.now() >= mode.turnDeadline) return { ...state, notice: 'O tempo acabou. Recue para encerrar a batalha.' };
  const chosen = [1, 2, 3].includes(Number(diceCount)) ? Number(diceCount) : mode.activeBattle.diceCount;
  return resolveBattleRound({ ...state, missionMode: { ...mode, activeBattle: { ...mode.activeBattle, diceCount: chosen } } }, random);
}

function retreatBattleCore(state) {
  const mode = state?.missionMode;
  const battle = mode?.activeBattle;
  if (!mode?.active || mode.finished || mode.handoffRequired || !battle || battle.attackerId !== mode.currentPlayerId) return state;
  const troopsByCountry = { ...mode.troopsByCountry,
    [battle.sourceId]: (Number(mode.troopsByCountry?.[battle.sourceId]) || 0) + battle.attackingRemaining };
  return { ...state, missionMode: { ...mode, troopsByCountry, activeBattle: null, lastBattle: { ...mode.lastBattle, retreated: true }, actionUsed: true },
    notice: `Ofensiva interrompida. ${battle.attackingRemaining} tropa(s) sobrevivente(s) recuaram para o território de origem.` };
}

// O cronometro estourou: passa o turno (recuando uma batalha em andamento) e avisa de quem era o tempo.
export function expireMissionTurn(state) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired) return state;
  const name = getCompetitivePlayer(mode, mode.currentPlayerId)?.name ?? 'Jogador';
  const next = advanceMissionTurn(logMissionEvent(state, 'timeout', `O tempo de ${name} acabou: a vez foi passada.`));
  return next === state ? state : { ...next, notice: `O tempo de ${name} acabou. ${next.notice}` };
}

// Um turno salvo guarda um horario absoluto; ao carregar o jogo o relogio recomeca (senao o turno passaria sozinho).
export function renewMissionDeadline(state, now = Date.now()) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired || !mode.turnDeadline) return state;
  return { ...state, missionMode: { ...mode, turnDeadline: now + mode.turnLimitSeconds * 1000 } };
}

// Adia o prazo pelo tempo em que o jogo ficou parado (menu aberto, aba escondida, sala pausada).
export function extendMissionDeadline(state, elapsedMs) {
  const mode = state?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired || !mode.turnDeadline || !(elapsedMs > 0)) return state;
  return { ...state, missionMode: { ...mode, turnDeadline: mode.turnDeadline + elapsedMs } };
}

export function revealMissionTurn(state) {
  if (!state?.missionMode?.active || !state.missionMode.handoffRequired) return state;
  return { ...state, missionMode: { ...state.missionMode, handoffRequired: false, turnDeadline: Date.now() + state.missionMode.turnLimitSeconds * 1000 }, notice: `${getCompetitivePlayer(state.missionMode, state.missionMode.currentPlayerId)?.name ?? 'Jogador'}, seu turno começou. Mobilize seus reforços e planeje antes do prazo.` };
}

function advanceMissionTurnCore(state) {
  let currentState = state;
  let mode = currentState?.missionMode;
  if (!mode?.active || mode.finished || mode.handoffRequired) return state;
  if (mode.activeBattle) {
    currentState = retreatBattle(currentState);
    mode = currentState.missionMode;
  }
  const counts = territoryCounts(currentState);
  const playerIds = mode.players.map((player) => player.id);
  const currentIndex = Math.max(0, playerIds.indexOf(mode.currentPlayerId));
  let nextIndex = (currentIndex + 1) % playerIds.length;
  while (!counts[playerIds[nextIndex]] && nextIndex !== currentIndex) nextIndex = (nextIndex + 1) % playerIds.length;
  const nextPlayerId = playerIds[nextIndex];
  const nextTurn = nextIndex <= currentIndex ? mode.turnNumber + 1 : mode.turnNumber;
  const reinforcements = Math.min(reinforcementsPerTurn(mode.players.length), counts[nextPlayerId] || 0);
  const troopsByCountry = { ...mode.troopsByCountry };
  const turnDeadline = Date.now() + mode.turnLimitSeconds * 1000;
  return {
    ...currentState,
    missionMode: { ...mode, currentPlayerId: nextPlayerId, turnNumber: nextTurn, actionUsed: false, handoffRequired: !mode.playStyle || mode.playStyle === 'local', mobilizedThisTurn: 0, turnDeadline, troopsByCountry },
    notice: `Turno de ${getCompetitivePlayer(mode, nextPlayerId)?.name ?? nextPlayerId}. ${reinforcements} reforços disponíveis para posicionar.`,
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


// ---------- Historico de jogadas ----------
// Registro publico (resultados de batalhas, reforcos, trocas de turno): nada aqui revela missoes secretas.
export const HISTORY_LIMIT = 80;
const HISTORY_TYPES = new Set(['info', 'battle', 'conquest', 'retreat', 'reinforce', 'fortify', 'turn', 'timeout', 'eliminate', 'victory']);

// Save de uma partida em andamento sem historico: o painel nao fica vazio, o registro comeca neste ponto.
function seedHistory(list, value) {
  if (list.length || !value?.active) return list;
  const turn = Math.max(1, Math.floor(Number(value.turnNumber) || 1));
  return [{ turn, type: 'info', playerId: null, text: 'Histórico iniciado neste ponto da partida. As próximas jogadas aparecem aqui.' }];
}

export function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.text === 'string' && item.text)
    .map((item) => ({ turn: Math.max(1, Math.floor(Number(item.turn) || 1)), type: HISTORY_TYPES.has(item.type) ? item.type : 'info', playerId: typeof item.playerId === 'string' ? item.playerId.slice(0, 20) : null, text: item.text.slice(0, 220) }))
    .slice(0, HISTORY_LIMIT);
}

export function logMissionEvent(state, type, text, playerId = undefined) {
  const mode = state?.missionMode;
  if (!mode?.active) return state;
  const entry = { turn: mode.turnNumber, type, playerId: playerId === undefined ? mode.currentPlayerId : playerId, text };
  return { ...state, missionMode: { ...mode, history: [entry, ...(mode.history ?? [])].slice(0, HISTORY_LIMIT) } };
}

const nameOfCountry = (state, id) => { const country = allCountries(state).find((item) => item.id === id); return country?.name ?? country?.nome ?? id; };
const nameOfPlayer = (mode, id) => getCompetitivePlayer(mode, id)?.name ?? 'Jogador';

function resolveBattleRound(state, random) {
  const before = state.missionMode;
  const result = resolveBattleRoundCore(state, random);
  const last = result?.missionMode?.lastBattle;
  if (result === state || !last || last === before?.lastBattle) return result;
  const mode = result.missionMode;
  const attacker = nameOfPlayer(mode, last.attackerId);
  const target = nameOfCountry(result, last.targetId);
  let out = logMissionEvent(result, 'battle', `${attacker}: ${nameOfCountry(result, last.sourceId)} → ${target} · dados ${(last.attackDice ?? [last.roll]).join(' ')} × ${(last.defenseDice ?? []).join(' ') || 'sem tropas'} · perdas ${last.attackerLosses ?? 0}/${last.defenderLosses ?? 0}`, last.attackerId);
  if (last.won) out = logMissionEvent(out, 'conquest', `${attacker} conquistou ${target}.`, last.attackerId);
  else if (last.defeated) out = logMissionEvent(out, 'retreat', `${attacker} perdeu a ofensiva contra ${target}.`, last.attackerId);
  for (const [victim, by] of Object.entries(out.missionMode.eliminatedBy ?? {})) {
    if (!(victim in (before.eliminatedBy ?? {}))) out = logMissionEvent(out, 'eliminate', `${nameOfPlayer(out.missionMode, victim)} foi eliminado por ${nameOfPlayer(out.missionMode, by)}.`, by);
  }
  if (out.missionMode.finished && !before.finished) out = logMissionEvent(out, 'victory', `${nameOfPlayer(out.missionMode, out.missionMode.winnerId)} cumpriu a missão e venceu.`, out.missionMode.winnerId);
  return out;
}

export function mobilizeTroops(state, countryId, amount = 1) {
  const result = mobilizeTroopsCore(state, countryId, amount);
  if (result === state || result.missionMode?.mobilizedThisTurn === state.missionMode?.mobilizedThisTurn) return result;
  const mode = result.missionMode;
  return logMissionEvent(result, 'reinforce', `${nameOfPlayer(mode, mode.currentPlayerId)} reforçou ${nameOfCountry(result, countryId)} (+${amount}).`);
}

export function fortifyTerritory(state, countryId) {
  const result = fortifyTerritoryCore(state, countryId);
  if (result === state || result.missionMode?.fortifiedCountries?.[countryId] === state.missionMode?.fortifiedCountries?.[countryId]) return result;
  const mode = result.missionMode;
  return logMissionEvent(result, 'fortify', `${nameOfPlayer(mode, mode.currentPlayerId)} fortificou ${nameOfCountry(result, countryId)}.`);
}

export function retreatBattle(state) {
  const battle = state?.missionMode?.activeBattle;
  const result = retreatBattleCore(state);
  if (result === state || !battle) return result;
  return logMissionEvent(result, 'retreat', `${nameOfPlayer(result.missionMode, battle.attackerId)} recuou de ${nameOfCountry(result, battle.targetId)} com ${battle.attackingRemaining} tropa(s).`, battle.attackerId);
}

export function advanceMissionTurn(state) {
  const result = advanceMissionTurnCore(state);
  const before = state?.missionMode;
  const mode = result?.missionMode;
  if (result === state || !mode || (mode.currentPlayerId === before?.currentPlayerId && mode.turnNumber === before?.turnNumber)) return result;
  return logMissionEvent(result, 'turn', `Rodada ${mode.turnNumber}: vez de ${nameOfPlayer(mode, mode.currentPlayerId)}.`, mode.currentPlayerId);
}

export function startMissionMatch(...args) {
  const result = startMissionMatchCore(...args);
  const mode = result?.missionMode;
  if (!mode?.active) return result;
  return logMissionEvent(result, 'info', `Partida iniciada: ${mode.players.length} jogadores e ${allCountries(result).length} territórios.`, null);
}
