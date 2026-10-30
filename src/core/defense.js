import { nextRandom } from './geopolitics.js';
import { normalizeOilField } from './oil.js';

// Forte da superficie: protege o campo de petroleo dos saqueadores do Ermo com soldados do exercito.
// Sobe de nivel com obra cronometrada, como os pocos; durante a obra defende com o nivel anterior.
export const FORT_MAX_LEVEL = 5;
export const FORT_LEVELS = Object.freeze([
  null,
  Object.freeze({ capacity: 60, turrets: 1, wall: 20, buildMs: 30_000, scrap: 300, oil: 50 }),
  Object.freeze({ capacity: 120, turrets: 2, wall: 35, buildMs: 2 * 60_000, scrap: 400, oil: 150 }),
  Object.freeze({ capacity: 200, turrets: 3, wall: 55, buildMs: 5 * 60_000, scrap: 600, oil: 300 }),
  Object.freeze({ capacity: 300, turrets: 4, wall: 80, buildMs: 12 * 60_000, scrap: 900, oil: 500 }),
  Object.freeze({ capacity: 450, turrets: 6, wall: 110, buildMs: 25 * 60_000, scrap: 1_300, oil: 800 }),
]);
export const TURRET_POWER = 6;
export const SOLDIER_POWER = .25;
export const RECRUIT_BATCH = 10;
export const RECRUIT_COST = 30;
// Os saqueadores so aparecem depois de o Vault ter pocos e um mes de folga para montar a defesa.
export const RAID_GRACE_TURNS = 2;
// Faccoes com relacao abaixo disso consideram o petroleo do Vault um alvo legitimo.
export const RAID_HOSTILITY = 20;

export function normalizeFort(value) {
  const level = Math.floor(Number(value?.level));
  if (!Number.isInteger(level) || level < 1) return null;
  const upgradeUntil = Number(value.upgradeUntil);
  return {
    level: Math.min(FORT_MAX_LEVEL, level),
    garrison: Math.max(0, Math.floor(Number(value.garrison) || 0)),
    upgradeUntil: Number.isFinite(upgradeUntil) && upgradeUntil > 0 ? upgradeUntil : 0,
  };
}

export function normalizeRaidReport(value) {
  if (!value || typeof value !== 'object' || typeof value.faction !== 'string') return null;
  const number = (key) => Math.max(0, Math.floor(Number(value[key]) || 0));
  return { faction: value.faction.slice(0, 60), won: value.won === true, attack: number('attack'), defense: number('defense'),
    oilLost: number('oilLost'), soldiersLost: number('soldiersLost'), raidersDown: number('raidersDown'), loot: number('loot'),
    turn: number('turn') };
}

export function getArmySoldiers(state) {
  return Math.max(0, Math.floor(Number(state?.military?.exercito?.soldados) || 0));
}

function withArmy(state, soldiers) {
  const military = state.military ?? {};
  return { ...military, exercito: { ...(military.exercito ?? {}), soldados: Math.max(0, soldiers) } };
}

export function getFortStatus(fort, now = Date.now()) {
  const current = normalizeFort(fort);
  if (!current) return null;
  const upgrading = current.upgradeUntil > now;
  const activeLevel = upgrading ? current.level - 1 : current.level;
  const active = FORT_LEVELS[activeLevel] ?? { capacity: FORT_LEVELS[1].capacity, turrets: 0, wall: 0 };
  const spec = FORT_LEVELS[current.level];
  const garrison = Math.min(current.garrison, Math.max(active.capacity, spec.capacity));
  const next = FORT_LEVELS[current.level + 1] ?? null;
  return {
    level: current.level,
    activeLevel,
    upgrading,
    building: upgrading && current.level === 1,
    upgradeRemainingMs: upgrading ? current.upgradeUntil - now : 0,
    upgradeProgress: upgrading ? 1 - (current.upgradeUntil - now) / spec.buildMs : 1,
    garrison,
    capacity: spec.capacity,
    turrets: active.turrets,
    wall: active.wall,
    defense: Math.round(active.wall + active.turrets * TURRET_POWER + garrison * SOLDIER_POWER),
    next: !upgrading && next ? { level: current.level + 1, ...next,
      defense: Math.round(next.wall + next.turrets * TURRET_POWER + Math.min(garrison, next.capacity) * SOLDIER_POWER) } : null,
  };
}

export function buildFort(state, now = Date.now()) {
  if (!state?.is_wasteland) return state;
  if (normalizeFort(state.surface_fort)) return { ...state, notice: 'O Forte da superfície já existe.' };
  const cost = FORT_LEVELS[1];
  if ((Number(state.scrap) || 0) < cost.scrap || (Number(state.oil) || 0) < cost.oil) {
    return { ...state, notice: `O Forte pede ${cost.scrap} sucatas e ${cost.oil} barris de petróleo.` };
  }
  return { ...state, scrap: state.scrap - cost.scrap, oil: state.oil - cost.oil,
    surface_fort: { level: 1, garrison: 0, upgradeUntil: now + cost.buildMs },
    notice: 'Sacos de areia e arame farpado: o Forte da superfície está sendo erguido.' };
}

export function upgradeFort(state, now = Date.now()) {
  const fort = normalizeFort(state?.surface_fort);
  const status = getFortStatus(fort, now);
  if (!status?.next) return { ...state, notice: status?.upgrading ? 'O Forte já está em obras.' : 'O Forte já está no nível máximo.' };
  const { scrap, oil, level, buildMs } = status.next;
  if ((Number(state.scrap) || 0) < scrap || (Number(state.oil) || 0) < oil) {
    return { ...state, notice: `Recursos insuficientes: nível ${level} pede ${scrap} sucatas e ${oil} barris.` };
  }
  return { ...state, scrap: state.scrap - scrap, oil: state.oil - oil,
    surface_fort: { ...fort, level, upgradeUntil: now + buildMs }, notice: `Forte da superfície subindo para o nível ${level}.` };
}

// Move soldiers do exercito para o Forte (positivo) ou de volta ao Vault (negativo).
export function assignGarrison(state, amount, now = Date.now()) {
  const fort = normalizeFort(state?.surface_fort);
  const status = getFortStatus(fort, now);
  if (!status) return state;
  const army = getArmySoldiers(state);
  const delta = amount > 0
    ? Math.min(Math.floor(amount), army, status.capacity - status.garrison)
    : -Math.min(Math.floor(-amount), status.garrison);
  if (!delta) return { ...state, notice: amount > 0 ? (army ? 'O Forte está lotado.' : 'Não há soldados disponíveis no Vault.') : 'Nenhum soldado no Forte.' };
  return { ...state, military: withArmy(state, army - delta), surface_fort: { ...fort, garrison: status.garrison + delta },
    notice: delta > 0 ? `${delta} soldados assumiram posição no Forte.` : `${-delta} soldados voltaram ao Vault.` };
}

export function recruitSoldiers(state) {
  if (!state?.is_wasteland) return state;
  if ((Number(state.scrap) || 0) < RECRUIT_COST) return { ...state, notice: `Recrutar pede ${RECRUIT_COST} sucatas.` };
  return { ...state, scrap: state.scrap - RECRUIT_COST, military: withArmy(state, getArmySoldiers(state) + RECRUIT_BATCH),
    notice: `${RECRUIT_BATCH} sobreviventes pegaram em armas.` };
}

function hostileFactions(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => Number(contact.relation) < RAID_HOSTILITY && Number(contact.militaryPower) > 0);
}

// Forca do bando cresce com o tempo pos-bomba: o Ermo se arma enquanto o Vault prospera.
export function getRaiderPower(faction, turn) {
  return Math.round(Number(faction?.militaryPower || 0) * (1 + Math.max(0, Number(turn) || 0) / 24));
}

export function getThreatEstimate(state) {
  const factions = hostileFactions(state);
  if (!factions.length) return null;
  const strongest = factions.reduce((best, faction) => (faction.militaryPower > best.militaryPower ? faction : best));
  return { faction: strongest.name, power: getRaiderPower(strongest, state.wasteland_turn) };
}

export function getRaidChance(state) {
  const field = normalizeOilField(state?.oil_derricks);
  if (!state?.is_wasteland || !field.some(Boolean) || (Number(state.wasteland_turn) || 0) < RAID_GRACE_TURNS || !hostileFactions(state).length) return 0;
  // Barris parados no tanque chamam atencao: quanto mais petroleo, mais cobica.
  return Math.min(.6, .25 + (Number(state.oil) || 0) / 2_000);
}

// Rolado ao virar o mes: decide se ha ataque e ja resolve a batalha, guardando o relatorio para o jogador ver.
export function rollSurfaceRaid(state, now = Date.now()) {
  const chance = getRaidChance(state);
  if (!chance || state.pendingRaid) return state;
  let seed = Number(state.randomSeed) || 1;
  const roll = nextRandom(seed); seed = roll.seed;
  if (roll.value >= chance) return { ...state, randomSeed: seed };
  const factions = hostileFactions(state);
  const pick = nextRandom(seed); seed = pick.seed;
  const faction = factions[Math.floor(pick.value * factions.length)];
  const swing = nextRandom(seed); seed = swing.seed;
  const attack = Math.max(1, Math.round(getRaiderPower(faction, state.wasteland_turn) * (.8 + swing.value * .4)));
  const fort = normalizeFort(state.surface_fort);
  const status = getFortStatus(fort, now);
  const defense = status?.defense ?? 0;
  const garrison = status?.garrison ?? 0;
  const won = defense >= attack;
  const ratio = defense / attack;
  // Na derrota, os saqueadores levam parte da reserva e esvaziam os tanques dos pocos.
  const field = normalizeOilField(state.oil_derricks);
  const stolenShare = won ? 0 : ratio >= .6 ? .2 : .4;
  const oilLost = Math.floor((Number(state.oil) || 0) * stolenShare);
  const soldiersLost = Math.min(garrison, Math.round(garrison * (won ? Math.min(.15, .5 / Math.max(1, ratio) * .2) : .3)));
  const raidersDown = Math.max(1, Math.round(attack / 4 * (won ? 1 : Math.min(1, ratio))));
  const loot = won ? Math.round(attack * 1.5) : 0;
  const report = { faction: faction.name, won, attack, defense, oilLost, soldiersLost, raidersDown, loot, turn: Number(state.wasteland_turn) || 0 };
  return {
    ...state,
    randomSeed: seed,
    oil: (Number(state.oil) || 0) - oilLost,
    scrap: (Number(state.scrap) || 0) + loot,
    oil_derricks: won ? field : field.map((derrick) => (derrick ? { ...derrick, collectedAt: Math.max(derrick.collectedAt, now) } : derrick)),
    surface_fort: fort ? { ...fort, garrison: garrison - soldiersLost } : fort,
    pendingRaid: report,
    raid_log: [report, ...(state.raid_log ?? [])].slice(0, 5),
    notice: won ? `ATAQUE REPELIDO: ${faction.name} recuou do campo de petróleo.` : `ATAQUE NA SUPERFÍCIE: ${faction.name} saqueou o campo de petróleo.`,
  };
}

export function dismissRaid(state) {
  return state?.pendingRaid ? { ...state, pendingRaid: null } : state;
}
