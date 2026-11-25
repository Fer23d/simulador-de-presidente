import { allCountries, getCountryRegion, getCurrentMissionPlayer, getCountryOwner, territoryCounts, getLegalAttacks, mobilizeTroops, conquerTerritory, continueBattle, advanceMissionTurn } from './mission_mode.js';
import { WAR_ADJACENCY } from '../data/war_adjacency.js';

export const BOT_DIFFICULTIES = Object.freeze({
  easy: { label: 'Fácil', description: 'Escolhe alvos aleatórios. Ideal para aprender.' },
  medium: { label: 'Médio', description: 'Prioriza a própria missão, mas se dispersa às vezes.' },
  hard: { label: 'Difícil', description: 'Foca a missão, elimina rivais vulneráveis e contém o líder.' },
});
const pick = (items, random) => items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];

function botAttackOptions(state, playerId) {
  const mode = state.missionMode;
  const remaining = Math.max(0, mode.troopsPerTurn - mode.mobilizedThisTurn);
  if (!remaining || mode.actionUsed) return getLegalAttacks(state, playerId);
  const countries = allCountries(state);
  const options = [];
  for (const source of countries) {
    if (getCountryOwner(state, source.id) !== playerId) continue;
    const hasRivalNeighbor = (WAR_ADJACENCY[source.id] ?? []).some((targetId) => getCountryOwner(state, targetId) && getCountryOwner(state, targetId) !== playerId);
    if (!hasRivalNeighbor) continue;
    const troopsByCountry = { ...mode.troopsByCountry, [source.id]: (Number(mode.troopsByCountry?.[source.id]) || 0) + remaining };
    const preview = { ...state, missionMode: { ...mode, troopsByCountry } };
    for (const attack of getLegalAttacks(preview, playerId).filter((item) => item.sourceId === source.id)) {
      options.push({ ...attack, reinforcementAmount: remaining });
    }
  }
  return options;
}

// Only the acting bot's mission and public territory ownership inform decisions.
// Difficulty never changes the dice or reads another player's secret objective.
export function chooseBotAttack(state, random = Math.random) {
  const player = getCurrentMissionPlayer(state);
  if (!player?.isBot || state.missionMode.finished) return null;
  const countries = allCountries(state);
  const attacks = botAttackOptions(state, player.id);
  if (!attacks.length) return null;
  const difficulty = state.missionMode.difficulty;
  if (difficulty === 'easy' || (difficulty === 'medium' && random() < .25)) {
    const attack = pick(attacks, random);
    return { ...attack, attackingTroops: attack.maxTroops };
  }
  const counts = territoryCounts(state);
  const mission = player.mission;
  const owned = countries.filter((country) => country.ownerId === player.id);
  const score = ({ targetId }) => {
    const country = countries.find((item) => item.id === targetId);
    if (!country) return -Infinity;
    let value = 0;
    if (['region', 'bridge'].includes(mission.kind) && getCountryRegion(country) === mission.regionId) value += 100;
    if (mission.kind === 'eliminate' && country.ownerId === mission.targetPlayerId) value += 100;
    if (mission.kind === 'global' && owned.filter((item) => getCountryRegion(item) === getCountryRegion(country)).length < 2) value += 100;
    if (mission.kind === 'majority' && country.id === player.homeCountryId) value += 100;
    if (difficulty === 'hard') {
      if (counts[country.ownerId] === 1) value += 120;
      value += counts[country.ownerId] / 10;
    }
    return value;
  };
  const best = Math.max(...attacks.map(score));
  const attack = pick(attacks.filter((item) => score(item) === best), random);
  return { ...attack, attackingTroops: attack.maxTroops };
}

// Compatibilidade para chamadas antigas que só precisam identificar o alvo.
export function chooseBotTarget(state, random = Math.random) {
  return chooseBotAttack(state, random)?.targetId ?? null;
}

export function stepBotTurn(state, random = Math.random) {
  if (state.missionMode?.playStyle !== 'bots' || !getCurrentMissionPlayer(state)?.isBot || state.missionMode.finished) return state;
  if (state.missionMode.activeBattle) {
    const next = continueBattle(state, random);
    return next.missionMode.activeBattle ? next : advanceMissionTurn(next);
  }
  if (state.missionMode.actionUsed) return advanceMissionTurn(state);
  const attack = chooseBotAttack(state, random);
  if (!attack) return advanceMissionTurn(state);
  const prepared = attack.reinforcementAmount
    ? mobilizeTroops(state, attack.sourceId, attack.reinforcementAmount)
    : state;
  return conquerTerritory(prepared, attack.targetId, attack.sourceId, attack.attackingTroops, random);
}

export function createBotRunner({ getState, commit, isPaused, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  function stop() { if (timer !== null) cancel(timer); timer = null; }
  function sync() {
    stop();
    const state = getState();
    if (isPaused() || state.missionMode?.playStyle !== 'bots' || state.missionMode.finished || !getCurrentMissionPlayer(state)?.isBot) return;
    timer = schedule(() => {
      timer = null;
      if (getState() === state && !isPaused()) commit(stepBotTurn(state));
      else sync();
    }, 800);
  }
  return { sync, stop };
}
