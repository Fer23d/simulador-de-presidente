import { allCountries, getCountryRegion, getCurrentMissionPlayer, territoryCounts, conquerTerritory, advanceMissionTurn } from './mission_mode.js';

export const BOT_DIFFICULTIES = Object.freeze({
  easy: { label: 'Fácil', description: 'Escolhe alvos aleatórios. Ideal para aprender.' },
  medium: { label: 'Médio', description: 'Prioriza a própria missão, mas se dispersa às vezes.' },
  hard: { label: 'Difícil', description: 'Foca a missão, elimina rivais vulneráveis e contém o líder.' },
});
const pick = (items, random) => items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];

// Only the acting bot's mission and public territory ownership inform decisions.
// Difficulty never changes the dice or reads another player's secret objective.
export function chooseBotTarget(state, random = Math.random) {
  const player = getCurrentMissionPlayer(state);
  if (!player?.isBot || state.missionMode.finished) return null;
  const countries = allCountries(state);
  const targets = countries.filter((country) => country.ownerId && country.ownerId !== player.id);
  if (!targets.length) return null;
  const difficulty = state.missionMode.difficulty;
  if (difficulty === 'easy' || (difficulty === 'medium' && random() < .25)) return pick(targets, random).id;
  const counts = territoryCounts(state);
  const mission = player.mission;
  const owned = countries.filter((country) => country.ownerId === player.id);
  const score = (country) => {
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
  const best = Math.max(...targets.map(score));
  return pick(targets.filter((country) => score(country) === best), random).id;
}

export function stepBotTurn(state, random = Math.random) {
  if (state.missionMode?.playStyle !== 'bots' || !getCurrentMissionPlayer(state)?.isBot || state.missionMode.finished) return state;
  if (state.missionMode.actionUsed) return advanceMissionTurn(state);
  const target = chooseBotTarget(state, random);
  return target ? conquerTerritory(state, target, random) : advanceMissionTurn(state);
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
    }, state.missionMode.actionUsed ? 1100 : 800);
  }
  return { sync, stop };
}
