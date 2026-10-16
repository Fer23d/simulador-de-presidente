export const ROOM_MAX_LEVEL = 5;

const OUTPUT_BY_LEVEL = Object.freeze([100, 250, 400, 550, 700]);
const UPGRADE_COST_BY_TARGET_LEVEL = Object.freeze({
  2: Object.freeze({ scrap: 300, science: 0 }),
  3: Object.freeze({ scrap: 800, science: 0 }),
  4: Object.freeze({ scrap: 1500, science: 500 }),
  5: Object.freeze({ scrap: 2500, science: 1500 }),
});
const LABORATORY_OUTPUT_BY_LEVEL = Object.freeze([40, 100, 160, 220, 280]);

const ROOM_OUTPUT = Object.freeze({
  generator: Object.freeze({ resource: 'energy', label: 'energia', byLevel: OUTPUT_BY_LEVEL }),
  greenhouse: Object.freeze({ resource: 'food', label: 'comida', byLevel: OUTPUT_BY_LEVEL }),
  laboratory: Object.freeze({ resource: 'science', label: 'ciência', byLevel: LABORATORY_OUTPUT_BY_LEVEL }),
  arsenal: Object.freeze({ resource: 'weapons', label: 'armas', perLevel: 1 }),
  medical: Object.freeze({ resource: 'medkits', label: 'curativos', perLevel: 2 }),
  radio: Object.freeze({ resource: 'population', label: 'sobreviventes', perLevel: 3 }),
  office: Object.freeze({ resource: 'scrap', label: 'sucatas', perLevel: 5 }),
});

function boundedLevel(level) {
  return Math.max(1, Math.min(ROOM_MAX_LEVEL, Math.floor(Number(level) || 1)));
}

export function getRoomUpgradeCost(room) {
  return getRoomUpgradeCosts(room)?.scrap ?? null;
}

export function getRoomUpgradeCosts(room) {
  const level = boundedLevel(room?.level);
  if (!room || ['vault', 'elevator'].includes(room.type) || level >= ROOM_MAX_LEVEL) return null;
  return UPGRADE_COST_BY_TARGET_LEVEL[level + 1] ?? null;
}

export function getBunkerFoodConsumption(state, population = state.country?.populacao_base) {
  const inhabitants = state.inhabitants ?? [];
  const present = inhabitants.filter((inhabitant) => !inhabitant.is_on_expedition);
  const unseenPopulation = Math.max(0, (Number(population) || 0) - present.length);
  return Math.ceil(unseenPopulation / 500) + present.reduce((total, inhabitant) =>
    total + (inhabitant.isVIP ? 2 : 1), 0);
}

export function getBunkerEnergyConsumption(state, population = state.country?.populacao_base) {
  return Math.ceil(Math.max(0, Number(population) || 0) / 500);
}

export function getRoomWorkforce(state, room) {
  const workers = (state.inhabitants ?? []).filter((inhabitant) =>
    (inhabitant.workFloor ?? inhabitant.floor) === room.floor
    && (inhabitant.workColumn ?? inhabitant.column) === room.column);
  const activeWorkers = workers.filter((inhabitant) =>
    !inhabitant.is_on_expedition && !inhabitant.is_prisoner && inhabitant.currentState !== 'rebel');
  const lowMorale = activeWorkers.filter((inhabitant) => Number(inhabitant.loyalty ?? 100) < 40).length;
  return {
    assigned: workers.length,
    active: activeWorkers.length,
    lowMorale,
    effective: activeWorkers.reduce((total, inhabitant) => {
      const modifier = Math.max(1, Number(inhabitant.modifier) || (inhabitant.isVIP ? 2 : 1));
      return total + (Number(inhabitant.loyalty ?? 100) < 40 ? 0.5 : 1) * modifier;
    }, 0),
  };
}

function roomOutput(state, room, level) {
  const spec = ROOM_OUTPUT[room.type];
  if (!spec) return null;
  let amount = spec.byLevel ? spec.byLevel[boundedLevel(level) - 1] : spec.perLevel * boundedLevel(level);
  if (room.type === 'generator' || room.type === 'greenhouse' || room.type === 'laboratory') {
    if (room.type === 'generator' && !room.operational) amount = 0;
    else amount *= getRoomWorkforce(state, room).effective;
  }
  return { resource: spec.resource, label: spec.label, amount: Math.floor(amount) };
}

export function getRoomEconomyProfile(state, room) {
  if (!room) return null;
  const level = boundedLevel(room.level);
  const costs = getRoomUpgradeCosts({ ...room, level });
  const output = roomOutput(state, room, level);
  const workforce = getRoomWorkforce(state, room);
  const populationConsumption = Math.ceil(Math.max(0, Number(state.country?.populacao_base) || 0) / 500);
  return {
    level,
    maxLevel: ROOM_MAX_LEVEL,
    workers: workforce,
    production: output,
    consumption: {
      food: getBunkerFoodConsumption(state),
      energy: populationConsumption,
    },
    nextLevel: costs === null ? null : {
      level: level + 1,
      cost: costs,
      production: roomOutput(state, room, level + 1),
    },
  };
}

export function getRoomStorageCapacity(grid, resource) {
  return (grid ?? []).flat().reduce((total, room) => {
    if (!room) return total;
    const level = boundedLevel(room.level);
    if (room.type === 'vault' && ['food', 'energy'].includes(resource)) return total + 200;
    if (room.type === 'vault' && ['weapons', 'medkits'].includes(resource)) return total + 100;
    if (resource === 'scrap' && room.type === 'vault') return total + 10000;
    if (resource === 'food' && room.type === 'greenhouse') return total + level * 300;
    if (resource === 'energy' && room.type === 'generator') return total + level * 300;
    if (resource === 'science' && room.type === 'laboratory') return total + level * 500;
    if (resource === 'weapons' && room.type === 'arsenal') return total + level * 50;
    if (resource === 'medkits' && room.type === 'medical') return total + level * 50;
    if (resource === 'scrap' && room.type === 'office') return total + level * 2000;
    return total;
  }, 0);
}
