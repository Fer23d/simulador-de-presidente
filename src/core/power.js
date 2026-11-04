import { countActiveGenerators, GENERATOR_LIGHT_THRESHOLD, hasReliableNightPower } from './environment.js';
import { GENERATOR_OUTPUT_BY_LEVEL, getBunkerEnergyConsumption, getLifeSupportEnergyMaintenance } from './bunker_economy.js';
import { GENERATOR_FUEL_BOOST, getGeneratorFuelPlan } from './oil_economy.js';
import { getPresidentClassModifiers } from './player_state.js';

// Orcamento de energia do Vault: cada sala gasta energia por mes, os geradores (e o petroleo) produzem,
// e uma sala nova so pode ser construida se a energia que sobra aguentar o gasto dela.
export const BASE_POWER = 60;

export const ROOM_ENERGY_DRAW = Object.freeze({
  dormitory: 8, greenhouse: 30, laboratory: 45, medical: 20, radiation_clinic: 25, arsenal: 15,
  radio: 20, office: 10, detention: 10, presidential_suite: 12, elevator: 5,
});

// Geradores e elevador nunca ficam bloqueados: sao a forma de resolver a falta de energia.
const ALWAYS_BUILDABLE = new Set(['generator', 'elevator', 'vault']);

const level = (room) => Math.max(1, Math.min(5, Math.floor(Number(room?.level) || 1)));

export function getRoomEnergyDraw(room) {
  const perLevel = ROOM_ENERGY_DRAW[room?.type] ?? 0;
  return room?.type === 'elevator' ? perLevel : perLevel * level(room);
}

export function getRoomsEnergyDraw(grid) {
  return (grid ?? []).flat().reduce((total, room) => total + (room ? getRoomEnergyDraw(room) : 0), 0);
}

// Capacidade nominal: reator de emergencia + geradores operacionais (x petroleo quando abastecidos).
export function getPowerCapacity(state) {
  const multiplier = getGeneratorFuelPlan(state).multiplier;
  const classMultiplier = getPresidentClassModifiers(state?.presidentClass).generatorOutputMultiplier;
  const generators = (state?.shelter_grid ?? []).flat().filter((room) => room?.type === 'generator' && room.operational);
  const output = generators.reduce((total, room) => total + (GENERATOR_OUTPUT_BY_LEVEL[level(room) - 1] ?? 0), 0);
  return BASE_POWER + Math.round(output * multiplier * classMultiplier);
}

// Geradores que contam para a iluminacao: abastecidos com petroleo rendem 1,5x, entao dois ja valem tres.
export function getLightingGenerators(state) {
  const count = countActiveGenerators(state?.shelter_grid ?? []);
  return getGeneratorFuelPlan(state).active ? Math.floor(count * GENERATOR_FUEL_BOOST + 1e-9) : count;
}

export function isVaultLit(state) {
  return hasReliableNightPower(getLightingGenerators(state));
}

export function getPowerBudget(state) {
  const grid = state?.shelter_grid ?? [];
  const capacity = getPowerCapacity(state);
  const draw = getRoomsEnergyDraw(grid) + getLifeSupportEnergyMaintenance(grid) + getBunkerEnergyConsumption(state);
  const fuel = getGeneratorFuelPlan(state);
  return { capacity, draw, free: capacity - draw, generators: fuel.generators, fuelActive: fuel.active,
    lightingGenerators: getLightingGenerators(state), lit: isVaultLit(state), lightThreshold: GENERATOR_LIGHT_THRESHOLD };
}

// Construir ou melhorar so e permitido se a energia livre cobrir o gasto extra da sala.
export function checkRoomPower(state, type, { upgrade = false } = {}) {
  if (!state?.is_wasteland || ALWAYS_BUILDABLE.has(type)) return { ok: true, need: 0, free: Infinity };
  const need = ROOM_ENERGY_DRAW[type] ?? 0;
  if (!need) return { ok: true, need: 0, free: Infinity };
  const { free } = getPowerBudget(state);
  if (free >= need) return { ok: true, need, free };
  return { ok: false, need, free,
    reason: `Energia insuficiente: ${upgrade ? 'melhorar' : 'construir'} esta sala gasta ${need} de energia por mês, mas só sobram ${Math.max(0, free)}. Construa ou melhore um gerador, ou abasteça-os com petróleo.` };
}
