import { getRoomStorageCapacity } from './bunker_economy.js';
import { getSkin } from './player_state.js';
import { getVaultDay } from './vault_time.js';

// Nivel da partida inteira: o XP vem do que o jogador faz em qualquer modo, cada nivel da um premio do modo em que ele esta,
// e a Porta do Vault so abre quando o nivel exigido for atingido. O progresso e da partida (um novo jogo recomeca no nivel 1).
export const MAX_LEVEL = 60;
export const DOOR_REQUIRED_LEVEL = 25;
export const LEVEL_RECENT_LIMIT = 6;
// Multiplicador do premio: nivel comum, terminado em 5 e terminado em 0 (o melhor de todos).
export const TIER_MULTIPLIER = Object.freeze({ normal: 1, five: 2, zero: 4 });

// XP total para chegar ao nivel n. Nivel 10 ~ fim da presidencia, nivel 25 ~ fim do Vault, nivel ~45 ao fechar a cidade.
export function totalXpForLevel(level) {
  const steps = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)) - 1);
  return 4 * steps * steps + 70 * steps;
}

export function getLevelForXp(xp) {
  const total = Math.max(0, Number(xp) || 0);
  let level = 1;
  while (level < MAX_LEVEL && totalXpForLevel(level + 1) <= total) level++;
  return level;
}

export function getLevelTier(level) {
  return level % 10 === 0 ? 'zero' : level % 5 === 0 ? 'five' : 'normal';
}

export function getGameMode(state) {
  return state?.city ? 'city' : state?.is_wasteland ? 'vault' : 'presidency';
}

const MODE_LABELS = Object.freeze({ presidency: 'Presidência', vault: 'Vault', city: 'Cidade' });
export const getModeLabel = (mode) => MODE_LABELS[mode] ?? MODE_LABELS.presidency;

// Titulos e vestimentas exclusivas dos niveis terminados em 0.
export const LEVEL_TITLES = Object.freeze({
  1: 'Recém-empossado', 10: 'Estadista', 20: 'Sobrevivente Veterano', 30: 'Fundador do Recomeço',
  40: 'Arquiteto da Nova Era', 50: 'Lenda do Último Gabinete', 60: 'O Último Presidente',
});
const LEVEL_SKINS = Object.freeze({ 10: 'scrap_armor', 20: 'raider', 40: 'generalissimo', 50: 'ghoul', 60: 'shadow' });
const CLASS_EPIC_SKIN = Object.freeze({ worker: 'worker_welder', commander: 'commander_nightops', doctor: 'doctor_containment', survivor: 'survivor_wanderer' });

export function getLevelTitle(level) {
  const milestone = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const reached = Object.keys(LEVEL_TITLES).map(Number).filter((key) => key <= milestone).pop();
  return LEVEL_TITLES[reached];
}

function getRewardSkinId(level, state) {
  if (level === 30) return CLASS_EPIC_SKIN[state?.presidentClass] ?? 'generalissimo';
  return LEVEL_SKINS[level] ?? null;
}

export function createLevelState() {
  return { xp: 0, level: 1, recent: [], skins: [] };
}

export function normalizeLevelState(value) {
  const xp = Math.max(0, Math.floor(Number(value?.xp) || 0));
  const skins = [...new Set((Array.isArray(value?.skins) ? value.skins : []).filter((id) => typeof id === 'string' && getSkin(id)))];
  const recent = (Array.isArray(value?.recent) ? value.recent : []).slice(-LEVEL_RECENT_LIMIT).filter((entry) => Number.isInteger(entry?.level))
    .map((entry) => ({ level: Math.max(1, Math.min(MAX_LEVEL, entry.level)), tier: ['normal', 'five', 'zero'].includes(entry.tier) ? entry.tier : 'normal',
      mode: ['presidency', 'vault', 'city'].includes(entry.mode) ? entry.mode : 'presidency', text: String(entry.text ?? '').slice(0, 200) }));
  return { xp, level: getLevelForXp(xp), recent, skins };
}

export function getLevel(state) {
  return Math.max(1, Math.floor(Number(state?.level?.level) || 1));
}

export function getLevelProgress(state) {
  const info = state?.level ?? createLevelState();
  const level = getLevel(state);
  const floor = totalXpForLevel(level);
  const next = level >= MAX_LEVEL ? floor : totalXpForLevel(level + 1);
  return { level, xp: info.xp, floorXp: floor, nextXp: next, current: info.xp - floor, needed: next - floor,
    fraction: level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (info.xp - floor) / Math.max(1, next - floor))),
    title: getLevelTitle(level), nextSpecial: level >= MAX_LEVEL ? null : (Math.floor(level / 5) + 1) * 5 };
}

// ---------- Premios ----------

const add = (value, amount, cap = Infinity) => Math.min(cap, (Number(value) || 0) + amount);

// Quantidades do premio de um nivel em cada modo. A trilha mostra estes numeros e applyLevelReward paga exatamente eles.
// `m` e o multiplicador do nivel (comum, 5, 0) e `s` cresce um pouco com o nivel.
export function getRewardAmounts(level, mode, state) {
  const tier = getLevelTier(level);
  const m = TIER_MULTIPLIER[tier];
  const s = 1 + level / 40;
  if (mode === 'presidency') {
    return { cash: Math.round(Math.max(1e8, (Number(state?.economy?.gdp) || 0) * 0.0004) * m * s), points: m };
  }
  if (mode === 'vault') {
    return { scrap: Math.round(30 * m * s), oil: Math.round(10 * m * s), food: Math.round(12 * m * s), energy: Math.round(10 * m * s),
      medkits: tier === 'normal' ? 0 : m, soldiers: tier === 'zero' ? 20 : 0 };
  }
  return { scrap: Math.round(40 * m * s), food: Math.round(25 * m * s), water: Math.round(25 * m * s), oil: Math.round(8 * m * s),
    happiness: tier === 'zero' ? 6 : tier === 'five' ? 2 : 0 };
}

// O premio em linhas de texto, na ordem em que aparece no aviso e na trilha.
export function describeLevelReward(level, mode, state) {
  const amounts = getRewardAmounts(level, mode, state);
  const lines = [];
  const line = (label, value) => { if (value) lines.push(`${label} +${value}`); };
  if (mode === 'presidency') {
    lines.push(`Caixa nacional +${(amounts.cash / 1e9).toFixed(1)} bi`);
    line('Pontos de tecnologia', amounts.points);
  } else if (mode === 'vault') {
    line('Sucata', amounts.scrap); line('Petróleo', amounts.oil); line('Comida', amounts.food); line('Energia', amounts.energy);
    line('Curativos', amounts.medkits); line('Soldados', amounts.soldiers);
  } else {
    line('Sucata', amounts.scrap); line('Comida', amounts.food); line('Água', amounts.water); line('Petróleo', amounts.oil);
    line('Felicidade', amounts.happiness);
  }
  if (getLevelTier(level) === 'zero') {
    const skin = getSkin(getRewardSkinId(level, state));
    if (skin) lines.push(`Vestimenta exclusiva: ${skin.name}`);
    lines.push(`Título: ${getLevelTitle(level)}`);
  }
  return lines;
}

function applyModeReward(state, level, mode) {
  const amounts = getRewardAmounts(level, mode, state);
  if (mode === 'presidency') {
    return { ...state, economy: { ...state.economy, cash: add(state.economy?.cash, amounts.cash) },
      technology: { ...state.technology, points: add(state.technology?.points, amounts.points) } };
  }
  if (mode === 'vault') {
    const grid = state.shelter_grid;
    const supplies = { ...(state.shelter_supplies ?? {}) };
    supplies.food = add(supplies.food, amounts.food, getRoomStorageCapacity(grid, 'food') || Infinity);
    supplies.energy = add(supplies.energy, amounts.energy, getRoomStorageCapacity(grid, 'energy') || Infinity);
    if (amounts.medkits) supplies.medkits = add(supplies.medkits, amounts.medkits, getRoomStorageCapacity(grid, 'medkits') || Infinity);
    const rewarded = { ...state, scrap: add(state.scrap, amounts.scrap), oil: add(state.oil, amounts.oil), shelter_supplies: supplies };
    return amounts.soldiers
      ? { ...rewarded, military: { ...rewarded.military, exercito: { ...rewarded.military?.exercito, soldados: add(rewarded.military?.exercito?.soldados, amounts.soldiers) } } }
      : rewarded;
  }
  const city = state.city;
  const cap = 4_000;
  const resources = { ...city.resources, scrap: add(city.resources.scrap, amounts.scrap, cap), food: add(city.resources.food, amounts.food, cap),
    water: add(city.resources.water, amounts.water, cap), oil: add(city.resources.oil, amounts.oil, cap) };
  return { ...state, city: { ...city, resources, happiness: Math.min(100, city.happiness + amounts.happiness) } };
}

export function applyLevelReward(state, level) {
  const mode = getGameMode(state);
  const lines = describeLevelReward(level, mode, state);
  let next = applyModeReward(state, level, mode);
  const skinId = getLevelTier(level) === 'zero' ? getRewardSkinId(level, state) : null;
  const skin = skinId ? getSkin(skinId) : null;
  if (skin) next = { ...next, unlockedSkins: [...new Set([...(next.unlockedSkins ?? ['default']), skin.id])] };
  const entry = { level, tier: getLevelTier(level), mode, text: lines.join(' · ') };
  const info = next.level ?? createLevelState();
  return { ...next, level: { ...info, skins: skin ? [...new Set([...info.skins, skin.id])] : info.skins,
    recent: [...info.recent, entry].slice(-LEVEL_RECENT_LIMIT) } };
}

// Concede XP e, a cada nivel novo, o premio daquele nivel no modo atual.
export function grantXp(state, amount) {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (!gain) return state;
  const info = state.level ?? createLevelState();
  if (info.level >= MAX_LEVEL) return state;
  const xp = info.xp + gain;
  const reached = getLevelForXp(xp);
  let next = { ...state, level: { ...info, xp, level: reached } };
  for (let level = info.level + 1; level <= reached; level++) next = applyLevelReward(next, level);
  return next;
}

// ---------- XP a partir do que mudou no estado ----------

const sum = (list) => list.reduce((total, value) => total + value, 0);
const roomLevels = (state) => sum((state.shelter_grid ?? []).flat().filter(Boolean).map((room) => Number(room.level) || 1));
const derrickLevels = (state) => sum((state.oil_derricks ?? []).filter(Boolean).map((derrick) => Number(derrick.level) || 0));
const fortLevel = (state) => Number(state.surface_fort?.level) || 0;
const monthIndex = (state) => (Number(state.calendar?.year) || 0) * 12 + (Number(state.calendar?.month) || 0);
const cityBuildings = (state, road) => (state.city?.buildings ?? []).filter((building) => (building.type === 'road') === road).length;
const positive = (value) => Math.max(0, value);

export const XP_VALUES = Object.freeze({
  presidencyMonth: 10, enterVault: 80, vaultDay: 2, vaultMonth: 20, roomLevel: 15, mission: 40, derrickLevel: 25, fortLevel: 30,
  raidWon: 60, raidLost: 10, ending: 100, cityStart: 100, cityDay: 1, cityMonth: 12, cityBuilding: 6, cityRoad: 1, cityFinish: 150,
});

// Compara dois estados e devolve o XP do que o jogador fez entre eles. Assim todo modo rende XP sem espalhar chamadas pelo codigo.
export function computeXpGain(previous, next) {
  if (!previous || !next) return 0;
  let gain = 0;
  const X = XP_VALUES;
  if (!previous.is_wasteland && !next.is_wasteland) gain += Math.min(3, positive(monthIndex(next) - monthIndex(previous))) * X.presidencyMonth;
  if (!previous.is_wasteland && next.is_wasteland) gain += X.enterVault;
  if (previous.is_wasteland && next.is_wasteland) {
    gain += Math.min(60, positive(getVaultDay(next) - getVaultDay(previous))) * X.vaultDay;
    gain += positive((Number(next.wasteland_turn) || 0) - (Number(previous.wasteland_turn) || 0)) * X.vaultMonth;
    gain += positive(roomLevels(next) - roomLevels(previous)) * X.roomLevel;
    gain += positive(derrickLevels(next) - derrickLevels(previous)) * X.derrickLevel;
    gain += positive(fortLevel(next) - fortLevel(previous)) * X.fortLevel;
    if (previous.pendingBunkerEvent && !next.pendingBunkerEvent && next.wasteland_turn === previous.wasteland_turn) gain += X.mission;
    if (!previous.pendingRaid && next.pendingRaid) gain += next.pendingRaid.won ? X.raidWon : X.raidLost;
    if (!previous.ending && next.ending) gain += X.ending;
  }
  if (!previous.city && next.city) gain += X.cityStart;
  if (previous.city && next.city) {
    const before = previous.city;
    const after = next.city;
    gain += Math.min(60, positive(after.day - before.day)) * X.cityDay;
    gain += positive(Math.floor(after.day / 30) - Math.floor(before.day / 30)) * X.cityMonth;
    gain += positive(cityBuildings(next, false) - cityBuildings(previous, false)) * X.cityBuilding;
    gain += positive(cityBuildings(next, true) - cityBuildings(previous, true)) * X.cityRoad;
    if (!before.result && after.result) gain += X.cityFinish;
  }
  return gain;
}

// Chamado em toda mudanca de estado: soma o XP do que mudou, ignorando recomecos (novo jogo, outro pais).
export function awardXp(previous, next) {
  if (!previous?.level || !next?.level || next.level.xp < previous.level.xp || next.level.level < previous.level.level) return next;
  return grantXp(next, computeXpGain(previous, next));
}

// Niveis recem-conquistados entre dois estados, para mostrar avisos.
export function getNewLevelEntries(previous, next) {
  const before = previous?.level?.level ?? 1;
  return (next?.level?.recent ?? []).filter((entry) => entry.level > before);
}

export function describeLevelGate(state) {
  if (!state?.is_wasteland || state.city || state.ending) return null;
  const level = getLevel(state);
  if (level >= DOOR_REQUIRED_LEVEL) return null;
  return { required: DOOR_REQUIRED_LEVEL, level, missing: DOOR_REQUIRED_LEVEL - level, missingXp: totalXpForLevel(DOOR_REQUIRED_LEVEL) - (state.level?.xp ?? 0) };
}

// Saves antigos nao tem nivel: estima o XP pelo que ja foi jogado, para ninguem recomecar do zero.
export function estimateLegacyXp(saved) {
  const vaultMonths = Math.max(0, Math.floor(Number(saved?.wasteland_turn) || 0));
  const presidencyMonths = Math.max(0, Math.floor(Number(saved?.monthCounter) || 0) - vaultMonths);
  let xp = presidencyMonths * XP_VALUES.presidencyMonth;
  if (saved?.is_wasteland) xp += XP_VALUES.enterVault + vaultMonths * (XP_VALUES.vaultMonth + 30 * XP_VALUES.vaultDay + 30);
  if (saved?.city) xp += XP_VALUES.cityStart + Math.floor(Number(saved.city.day) || 0) * 1.7;
  return Math.floor(xp);
}
