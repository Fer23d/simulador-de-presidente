import { nextRandom } from './geopolitics.js';
import { getRoomWorkforce } from './bunker_economy.js';
import { getPresidentClassModifiers } from './player_state.js';
import { countActiveGenerators, getNighttimeRiskChance } from './environment.js';
import { createExpeditionLoot, createExpeditionNodes } from './expeditions.js';
import { normalizeNeeds } from './needs.js';
import { getWeather } from './weather.js';
import { getSector, getSectorExpedition, getSurfaceMap, isSectorSelectable, revealSector } from './surface_map.js';

const EXPEDITION_MONTHS = 3;
const EXPEDITION_SUCCESS_CHANCE = 0.7;
const REBEL_SCRAP_COST = 5;
const REBELLION_CHANCE = 0.2;
const VIP_DISCOVERY_CHANCE = 0.1;
const VIP_ASSASSINATION_CHANCE = 0.3;
const NON_WORK_ROOM_TYPES = new Set(['vault', 'elevator', 'detention', 'dormitory', 'life_support', 'presidential_suite']);

function shelterRooms(state) {
  return (state.shelter_grid ?? []).flat().filter(Boolean);
}

function findRoomById(state, roomId) {
  return shelterRooms(state).find((room) => room.id === roomId) ?? null;
}

function findAssignedRoom(state, inhabitant) {
  const rooms = shelterRooms(state);
  const byId = rooms.find((room) => room.id === inhabitant.currentRoomId);
  if (byId && !NON_WORK_ROOM_TYPES.has(byId.type)) return byId;
  return rooms.find((room) => !NON_WORK_ROOM_TYPES.has(room.type)
    && room.floor === inhabitant.workFloor && room.column === inhabitant.workColumn) ?? null;
}

function getRoomWorkerCount(state, room, excludeId = null) {
  return (state.inhabitants ?? []).filter((inhabitant) => inhabitant.id !== excludeId
    && !inhabitant.is_prisoner && !inhabitant.is_on_expedition
    && !inhabitant.currentState?.startsWith('rebel')
    && ((inhabitant.state === 'working' && inhabitant.currentRoomId === room.id)
      || (inhabitant.workFloor === room.floor && inhabitant.workColumn === room.column))).length;
}

function hasRoomWorkerSpace(state, room, excludeId = null) {
  if (!room || NON_WORK_ROOM_TYPES.has(room.type)) return false;
  const maxWorkers = Math.max(1, Math.floor(Number(room.maxWorkers ?? room.level) || 1));
  return getRoomWorkerCount(state, room, excludeId) < maxWorkers;
}

function moveInhabitantToRoom(inhabitant, room, { employed = false } = {}) {
  return {
    ...inhabitant,
    floor: room.floor,
    column: room.column,
    offsetX: 0,
    currentRoomId: room.id,
    previousRoomId: null,
    state: employed ? 'working' : 'idle',
    currentState: 'idle',
    pose: employed ? 'working' : 'idle',
    targetOffsetX: null,
    is_prisoner: false,
    ...(employed ? { workFloor: room.floor, workColumn: room.column } : { workFloor: null, workColumn: null }),
  };
}

function removeWorkerFromRoom(inhabitant, roomId) {
  return { ...inhabitant, previousRoomId: roomId ?? inhabitant.currentRoomId ?? null,
    workFloor: null, workColumn: null, state: 'idle', pose: 'idle' };
}

function assignWorkerToRoom(state, inhabitant, room) {
  return hasRoomWorkerSpace(state, room, inhabitant.id)
    ? moveInhabitantToRoom(inhabitant, room, { employed: true }) : null;
}
const SCOUT_EXPEDITION_SUCCESS_CHANCE = 0.65;
const GREENHOUSE_CURE_SUCCESS_CHANCE = 0.6;
const SUPPRESSION_PER_SOLDIER = 0.1;
const VIP_PROFILES = Object.freeze([
  Object.freeze({ name: 'Dr. Isaac', role: 'scientist' }),
  Object.freeze({ name: 'Dra. Amara', role: 'scientist' }),
  Object.freeze({ name: 'Coronel Silva', role: 'guard' }),
  Object.freeze({ name: 'Coronela Costa', role: 'guard' }),
]);

export const WASTELAND_EVENTS = Object.freeze([
  Object.freeze({
    id: 'ration-emergency',
    title: 'A Ração de Emergência',
    description: 'Os cientistas sugerem concentrar os alimentos nas equipas técnicas. A medida pode salvar a produção, mas os demais habitantes sentirão o abandono.',
    options: Object.freeze([
      Object.freeze({ id: 'support-scientists', label: '[ APOIAR OS INTELECTUAIS ]', effects: Object.freeze({ food: 200, loyalty: -20 }) }),
      Object.freeze({ id: 'refuse-ration-cuts', label: '[ RECUSAR OS CORTES ]', effects: Object.freeze({}) }),
    ]),
  }),
  Object.freeze({
    id: 'generator-bearings',
    title: 'O Gerador Está a Gemer',
    description: 'A equipa de manutenção encontrou rolamentos gastos. Pode gastar sucata agora ou manter a máquina em funcionamento no limite.',
    options: Object.freeze([
      Object.freeze({ id: 'replace-bearings', label: '[ TROCAR ROLAMENTOS: 60 SUCATAS ]', cost: Object.freeze({ scrap: 60 }), effects: Object.freeze({ energy: 100 }) }),
      Object.freeze({ id: 'delay-repair', label: '[ ADIAR A MANUTENÇÃO ]', effects: Object.freeze({ energy: -30, loyalty: -5 }) }),
    ]),
  }),
  Object.freeze({
    id: 'air-filter-crisis',
    title: 'Filtros Saturados',
    description: 'O ar reciclado está a irritar os pulmões dos habitantes. A ala médica pede um curativo para tratar a exposição.',
    options: Object.freeze([
      Object.freeze({ id: 'use-medkit-filters', label: '[ USAR 1 CURATIVO ]', cost: Object.freeze({ medkits: 1 }), effects: Object.freeze({ loyalty: 10 }) }),
      Object.freeze({ id: 'keep-ventilation-running', label: '[ MANTER A VENTILAÇÃO ]', effects: Object.freeze({ food: -30, loyalty: -10 }) }),
    ]),
  }),
  Object.freeze({
    id: 'radio-signal-unknown',
    title: 'Sinal de Rádio Desconhecido',
    description: 'Uma transmissão fraca surgiu no rádio. Enviar batedores pode revelar um esconderijo, mas a viagem consumirá mantimentos.',
    options: Object.freeze([
      Object.freeze({ id: 'send-scouts', label: '[ ENVIAR BATEDORES: 50 COMIDAS ]', cost: Object.freeze({ food: 50 }) }),
      Object.freeze({ id: 'ignore-signal', label: '[ IGNORAR O SINAL ]', effects: Object.freeze({}) }),
    ]),
  }),
  Object.freeze({
    id: 'greenhouse-fungus',
    title: 'Fungo na Estufa',
    description: 'Uma infestação ameaça a colheita hidropônica. A equipe pode isolar a estufa ou gastar energia tentando salvar as plantas.',
    prerequisites: Object.freeze({ roomType: 'greenhouse' }),
    options: Object.freeze([
      Object.freeze({ id: 'quarantine-greenhouse', label: '[ COLOCAR A ESTUFA EM QUARENTENA ]', effects: Object.freeze({}) }),
      Object.freeze({ id: 'attempt-cure', label: '[ TENTAR A CURA: 80 ENERGIAS ]', cost: Object.freeze({ energy: 80 }) }),
    ]),
  }),
]);

export function calculateSuppression(state = {}) {
  const inhabitants = Array.isArray(state.inhabitants) ? state.inhabitants : [];
  const inhabitantSoldiers = inhabitants.filter((inhabitant) => !inhabitant.is_on_expedition && !inhabitant.is_prisoner
    && (inhabitant.role === 'soldier'
    || inhabitant.isMilitary === true
    || (inhabitant.isVIP === true && ['guard', 'military', 'soldier'].includes(inhabitant.role)))).length;
  const arsenalGuards = Math.max(0, Math.floor(Number(state.shelter_guards) || 0));
  const totalSoldiers = inhabitantSoldiers + arsenalGuards;
  const suppressionMultiplier = getPresidentClassModifiers(state.presidentClass).suppressionMultiplier;
  const suppressionFactor = Math.min(1, totalSoldiers * SUPPRESSION_PER_SOLDIER * suppressionMultiplier);
  return { totalSoldiers, suppressionFactor, percent: Math.round(suppressionFactor * 100) };
}

export function calculateSuppressedChance(baseChance, suppressionFactor) {
  const chance = Math.max(0, Math.min(1, Number(baseChance) || 0));
  const suppression = Math.max(0, Math.min(1, Number(suppressionFactor) || 0));
  return Math.max(0, chance - suppression);
}

export function getWastelandEvent(eventId) {
  return WASTELAND_EVENTS.find((event) => event.id === eventId) ?? null;
}

export function canResolveWastelandEvent(state, eventId, optionId) {
  const event = getWastelandEvent(eventId);
  const option = event?.options.find((choice) => choice.id === optionId);
  if (!state.is_wasteland || !option) return false;
  if (event.prerequisites?.roomType && !state.shelter_grid?.flat().some((room) => room?.type === event.prerequisites.roomType)) return false;
  return Object.entries(option.cost ?? {}).every(([resource, amount]) =>
    (Number(resource === 'scrap' ? state.scrap : state.shelter_supplies?.[resource]) || 0) >= amount);
}

export function getRoomProductivityMultiplier(state, room) {
  if (!room || !['greenhouse', 'generator', 'laboratory'].includes(room.type) || (room.type === 'generator' && !room.operational)) return 0;
  return getRoomWorkforce(state, room).effective;
}

export function startExpedition(state, inhabitantId, destination = null) {
  const inhabitant = state.inhabitants?.find((item) => item.id === inhabitantId);
  if (!state.is_wasteland || !inhabitant || inhabitant.is_on_expedition || inhabitant.is_prisoner || inhabitant.currentState === 'rebel') {
    return { ...state, notice: 'Este habitante nao pode iniciar uma expedicao.' };
  }
  const weather = getWeather(state);
  if (weather.blocksExpeditions) {
    return { ...state, notice: `${weather.label}: expedições suspensas até o tempo abrir.` };
  }
  const map = getSurfaceMap(state);
  if (isSectorSelectable(map, destination)) {
    const sector = getSector(map, destination);
    const plan = getSectorExpedition(sector);
    return {
      ...state,
      surface_map: map,
      inhabitants: state.inhabitants.map((item) => item.id === inhabitantId
        ? { ...item, is_on_expedition: true, expedition_timer: plan.months, expedition_destination: sector.name, expedition_sector: sector.id }
        : item),
      notice: `${inhabitant.name || inhabitant.id} partiu para ${sector.name} numa expedicao de ${plan.months} meses.`,
    };
  }
  const availableDestinations = state.expeditionLocation?.nodes ?? createExpeditionNodes(state.expeditionLocation?.city);
  const expeditionDestination = availableDestinations.includes(destination) ? destination : availableDestinations[0];
  return {
    ...state,
    inhabitants: state.inhabitants.map((item) => item.id === inhabitantId
      ? { ...item, is_on_expedition: true, expedition_timer: EXPEDITION_MONTHS, expedition_destination: expeditionDestination }
      : item),
    notice: `${inhabitant.id} partiu para ${expeditionDestination} numa expedicao de tres meses.`,
  };
}

export function advanceMonthlyGameMechanics(state) {
  let randomSeed = Number(state.randomSeed) || 1;
  const activeGenerators = countActiveGenerators(state.shelter_grid ?? state.bunker_rooms);
  const { suppressionFactor } = calculateSuppression(state);
  const reports = [...(state.pendingExpeditionReports ?? [])];
  const inhabitants = [];
  let scrap = Math.max(0, Number(state.scrap) || 0);
  let technology = state.technology ?? { points: 0, unlocked: [] };
  let lostExplorer = false;
  let currentLoot = Array.isArray(state.currentLoot) ? [...state.currentLoot] : [];
  let returnedWithLoot = false;
  let surfaceMap = state.surface_map ? getSurfaceMap(state) : null;

  for (const inhabitant of state.inhabitants ?? []) {
    if (!inhabitant.is_on_expedition) {
      inhabitants.push(inhabitant);
      continue;
    }
    const timer = Math.max(0, Math.floor(Number(inhabitant.expedition_timer) || 0) - 1);
    if (timer > 0) {
      inhabitants.push({ ...inhabitant, expedition_timer: timer });
      continue;
    }

    const roll = nextRandom(randomSeed);
    randomSeed = roll.seed;
    const sectorMap = inhabitant.expedition_sector ? surfaceMap ?? getSurfaceMap(state) : null;
    const sector = sectorMap ? getSector(sectorMap, inhabitant.expedition_sector) : null;
    const plan = sector ? getSectorExpedition(sector) : null;
    const success = roll.value < (plan?.successChance ?? EXPEDITION_SUCCESS_CHANCE);
    const reportIndex = reports.length;
    reports.push({ id: `${state.monthCounter}-${inhabitant.id}`, inhabitantId: inhabitant.id,
      destination: inhabitant.expedition_destination ?? null, success, ...(sector ? { sectorId: sector.id } : {}) });
    if (success) {
      const { expedition_sector: exploredSector, ...returned } = inhabitant;
      inhabitants.push({ ...returned, is_on_expedition: false, expedition_timer: 0 });
      if (sector) surfaceMap = revealSector(sectorMap, sector.id);
      const rarityRoll = nextRandom(randomSeed);
      randomSeed = rarityRoll.seed;
      if (rarityRoll.value < VIP_DISCOVERY_CHANCE * (plan?.vipMultiplier ?? 1) && inhabitants.length < 48) {
        const profileIndex = Math.floor(rarityRoll.value * 10_000) % VIP_PROFILES.length;
        const profile = VIP_PROFILES[profileIndex];
        const rooms = state.shelter_grid?.flat() ?? [];
        const laboratory = rooms.find((room) => room?.type === 'laboratory');
        const formerWorkplace = rooms.find((room) => room?.floor === inhabitant.workFloor
          && room?.column === inhabitant.workColumn && ['generator', 'greenhouse', 'laboratory'].includes(room.type));
        const destination = laboratory ?? formerWorkplace;
        const floor = destination?.floor ?? inhabitant.floor;
        const column = destination?.column ?? inhabitant.column;
        const assignedWorkplace = destination && ['generator', 'greenhouse', 'laboratory'].includes(destination.type);
        const vip = {
          id: `${inhabitant.id}-vip-${Math.max(0, Number(state.monthCounter) || 0)}`,
          name: profile.name,
          role: profile.role,
          isVIP: true,
          modifier: 2,
          floor,
          column,
          currentRoomId: destination?.id ?? null,
          state: assignedWorkplace ? 'working' : 'idle',
          offsetX: profileIndex % 2 ? 38 : -38,
          currentState: 'idle',
          targetOffsetX: null,
          waitSeconds: 1,
          loyalty: 100,
          revoltChance: 20,
          lastTalkedDay: 0,
          rebellionCheckDone: false,
          is_on_expedition: false,
          expedition_timer: 0,
          is_prisoner: false,
          needs: normalizeNeeds(),
          ...(assignedWorkplace ? { workFloor: floor, workColumn: column, pose: 'working' } : {}),
        };
        inhabitants.push(vip);
        reports[reportIndex] = { ...reports[reportIndex], vipFound: true, vipName: vip.name };
      }
      const lootDrop = createExpeditionLoot(randomSeed, plan?.loot);
      randomSeed = lootDrop.randomSeed;
      currentLoot.push(...lootDrop.loot);
      returnedWithLoot = true;
    } else {
      lostExplorer = true;
    }
  }

  const resourcesDepleted = (Number(state.shelter_supplies?.food) || 0) <= 0
    || (Number(state.shelter_supplies?.energy) || 0) <= 0;
  const updatedInhabitants = inhabitants.map((inhabitant) => {
    if (inhabitant.is_prisoner || inhabitant.is_on_expedition || inhabitant.currentState === 'rebel') return inhabitant;
    const loyaltyLoss = resourcesDepleted
      ? 10 * (1 - suppressionFactor) * getPresidentClassModifiers(state.presidentClass).loyaltyLossMultiplier : 0;
    const loyalty = Math.max(0, Math.min(100, Number(inhabitant.loyalty ?? 100) - loyaltyLoss));
    let currentState = inhabitant.currentState;
    let rebellionCheckDone = inhabitant.rebellionCheckDone === true;
    if (loyalty > 0) rebellionCheckDone = false;
    if (loyalty <= 0 && !rebellionCheckDone) {
      const roll = nextRandom(randomSeed);
      randomSeed = roll.seed;
      rebellionCheckDone = true;
      const baseRebellionChance = Math.max(0, Math.min(1,
        Number.isFinite(Number(inhabitant.revoltChance))
          ? Number(inhabitant.revoltChance) / 100 : REBELLION_CHANCE));
      const rebellionChance = calculateSuppressedChance(
        getNighttimeRiskChance(baseRebellionChance, state.isNight === true, activeGenerators), suppressionFactor);
      if (roll.value < rebellionChance) currentState = 'rebel';
    }
    return { ...inhabitant, loyalty, currentState,
      ...(currentState === 'rebel' ? { targetOffsetX: null } : {}), rebellionCheckDone };
  });
  const rebels = updatedInhabitants.filter((inhabitant) => inhabitant.currentState === 'rebel' && !inhabitant.is_prisoner && !inhabitant.is_on_expedition).length;
  scrap = Math.max(0, scrap - rebels * REBEL_SCRAP_COST);
  const assassinated = new Set();
  let assassinationNotice = null;
  for (const rebel of updatedInhabitants.filter((inhabitant) => inhabitant.isVIP
    && inhabitant.currentState === 'rebel' && !inhabitant.is_prisoner && !inhabitant.is_on_expedition)) {
    const attackRoll = nextRandom(randomSeed);
    randomSeed = attackRoll.seed;
    const assassinationChance = calculateSuppressedChance(
      getNighttimeRiskChance(VIP_ASSASSINATION_CHANCE, state.isNight === true, activeGenerators), suppressionFactor);
    if (attackRoll.value >= assassinationChance) continue;
    const candidates = updatedInhabitants.filter((inhabitant) => !inhabitant.isVIP
      && inhabitant.currentState !== 'rebel' && !inhabitant.is_prisoner && !inhabitant.is_on_expedition
      && Number.isInteger(inhabitant.workFloor) && Number.isInteger(inhabitant.workColumn)
      && Math.abs(inhabitant.floor - rebel.floor) + Math.abs(inhabitant.column - rebel.column) <= 1
      && !assassinated.has(inhabitant.id));
    if (!candidates.length) continue;
    const targetRoll = nextRandom(randomSeed);
    randomSeed = targetRoll.seed;
    const victim = candidates[Math.floor(targetRoll.value * candidates.length)];
    assassinated.add(victim.id);
    assassinationNotice = `> ALERTA CRÍTICO: ${rebel.name || rebel.id} assassinou ${victim.name || victim.id}.`;
  }
  const survivingInhabitants = updatedInhabitants.filter((inhabitant) => !assassinated.has(inhabitant.id));

  return {
    ...state,
    randomSeed,
    scrap,
    technology,
    inhabitants: survivingInhabitants,
    pendingExpeditionReports: reports,
    ...(surfaceMap ? { surface_map: surfaceMap } : {}),
    pendingLoot: returnedWithLoot || state.pendingLoot === true,
    currentLoot,
    lootbox_opened: returnedWithLoot ? false : Boolean(state.lootbox_opened),
    lootbox_click_count: returnedWithLoot ? 0 : Math.max(0, Math.min(3, Number(state.lootbox_click_count) || 0)),
    lootbox_revealed: returnedWithLoot ? false : Boolean(state.lootbox_revealed),
    lootbox_cards_visible: returnedWithLoot ? false : Boolean(state.lootbox_cards_visible),
    lootbox_shake_started_at: returnedWithLoot ? null : (state.lootbox_shake_started_at ?? null),
    lootbox_revealed_at: returnedWithLoot ? null : (state.lootbox_revealed_at ?? null),
    notice: assassinationNotice ?? (lostExplorer
      ? '> O SINAL DO EXPLORADOR FOI PERDIDO NO WASTELAND.'
      : rebels > 0 ? `Dissidentes causaram danos discretos ao Vault. Sucata perdida: ${rebels * REBEL_SCRAP_COST}.`
        : resourcesDepleted ? 'Alimentos ou energia esgotados. A lealdade dos habitantes caiu.'
          : returnedWithLoot ? '> NOVA CARGA DO ERMO DETECTADA NO PORTÃO.'
            : reports.length > (state.pendingExpeditionReports?.length ?? 0) ? 'Relatorio de expedicao pronto para consulta.' : state.notice),
  };
}

export function resolveWastelandEvent(state, optionId) {
  const event = getWastelandEvent(state.pendingBunkerEvent?.id);
  const option = event?.options.find((choice) => choice.id === optionId);
  if (!state.is_wasteland || !event || !option) return { ...state, notice: 'Dilema do Vault indisponível.' };

  const cost = option.cost ?? {};
  if (!canResolveWastelandEvent(state, event.id, optionId)) {
    return { ...state, notice: 'Recursos insuficientes para esta decisão.' };
  }
  const supplies = { ...(state.shelter_supplies ?? {}) };
  let scrap = Number(state.scrap) || 0;
  for (const [resource, amount] of Object.entries(cost)) {
    if (resource === 'scrap') scrap -= amount;
    else supplies[resource] = Math.max(0, (Number(supplies[resource]) || 0) - amount);
  }
  for (const [resource, amount] of Object.entries(option.effects ?? {})) {
    if (resource === 'loyalty') continue;
    supplies[resource] = Math.max(0, (Number(supplies[resource]) || 0) + amount);
  }
  let randomSeed = state.randomSeed;
  let outcome = null;
  if (optionId === 'send-scouts' || optionId === 'attempt-cure') {
    const roll = nextRandom(Number(state.randomSeed) || 1);
    randomSeed = roll.seed;
    const successChance = optionId === 'send-scouts'
      ? SCOUT_EXPEDITION_SUCCESS_CHANCE
      : GREENHOUSE_CURE_SUCCESS_CHANCE;
    outcome = roll.value < successChance;
    if (optionId === 'send-scouts' && outcome) scrap += 100;
  }
  let shelterGrid = state.shelter_grid;
  if (optionId === 'quarantine-greenhouse' || (optionId === 'attempt-cure' && !outcome)) {
    let quarantined = false;
    shelterGrid = (state.shelter_grid ?? []).map((row) => row.map((room) => {
      if (!quarantined && room?.type === 'greenhouse') {
        quarantined = true;
        return { ...room, disabledMonthsRemaining: 3 };
      }
      return room;
    }));
  }
  const loyaltyChange = Number(option.effects?.loyalty) || 0;
  const immuneToAirborneDisease = getPresidentClassModifiers(state.presidentClass).diseaseImmunity
    && event.id === 'air-filter-crisis';
  const eventLoyaltyChange = immuneToAirborneDisease && loyaltyChange < 0 ? 0
    : optionId === 'attempt-cure' && !outcome ? -10 : loyaltyChange;
  const inhabitants = eventLoyaltyChange ? (state.inhabitants ?? []).map((inhabitant) => ({
    ...inhabitant,
    loyalty: Math.max(0, Math.min(100, (Number(inhabitant.loyalty) || 0) + eventLoyaltyChange)),
    ...(Number(inhabitant.loyalty) + eventLoyaltyChange > 0 ? { rebellionCheckDone: false } : {}),
  })) : state.inhabitants;
  return {
    ...state,
    scrap,
    shelter_supplies: supplies,
    ...(randomSeed !== state.randomSeed ? { randomSeed } : {}),
    ...(shelterGrid ? { shelter_grid: shelterGrid } : {}),
    ...(inhabitants ? { inhabitants } : {}),
    pendingBunkerEvent: null,
    notice: `Dilema resolvido: ${event.title}.`,
  };
}

export function dismissExpeditionReport(state) {
  if (!state.pendingExpeditionReports?.length) return state;
  return {
    ...state,
    pendingExpeditionReports: state.pendingExpeditionReports.slice(1),
    notice: 'Relatorio de expedicao arquivado.',
  };
}

export function releaseNPC(state, inhabitantId) {
  const inhabitant = state.inhabitants?.find((item) => item.id === inhabitantId);
  if (!state.is_wasteland || !inhabitant?.is_prisoner) return state;

  const previousRoom = findRoomById(state, inhabitant.previousRoomId);
  const restoredWorker = assignWorkerToRoom(state, inhabitant, previousRoom);
  if (restoredWorker) {
    return {
      ...state,
      inhabitants: state.inhabitants.map((item) => item.id === inhabitant.id
        ? restoredWorker : item),
      notice: `${inhabitant.id} foi libertado e voltou ao setor anterior.`,
    };
  }

  const fallbackRoom = shelterRooms(state).find((room) => room.type === 'dormitory')
    ?? shelterRooms(state).find((room) => room.type === 'vault');
  if (!fallbackRoom) return state;
  return {
    ...state,
    inhabitants: state.inhabitants.map((item) => item.id === inhabitant.id
      ? moveInhabitantToRoom(item, fallbackRoom) : item),
    notice: `${inhabitant.id} foi libertado e aguarda novas ordens no ${fallbackRoom.type === 'dormitory' ? 'dormitório' : 'Vault'}.`,
  };
}

export function arrestNPC(state, inhabitantId) {
  let nextState = state;
  let inhabitant = nextState.inhabitants?.find((item) => item.id === inhabitantId);
  const cell = shelterRooms(nextState).find((room) => room.type === 'detention');
  if (!state.is_wasteland || !inhabitant || inhabitant.currentState !== 'rebel' || inhabitant.is_prisoner) {
    return { ...state, notice: 'O dissidente nao esta disponivel para detencao.' };
  }
  if (!cell) return { ...state, notice: 'Construa uma Cela de Detencao antes de prender dissidentes.' };

  // A cela tem uma vaga: libertar primeiro qualquer ocupante para evitar NPCs sobrepostos.
  const cellOccupants = nextState.inhabitants.filter((item) => item.is_prisoner
    && (item.currentRoomId === cell.id || (item.floor === cell.floor && item.column === cell.column)));
  for (const occupant of cellOccupants) nextState = releaseNPC(nextState, occupant.id);
  inhabitant = nextState.inhabitants.find((item) => item.id === inhabitantId);
  const previousRoom = findAssignedRoom(nextState, inhabitant);
  const unassigned = removeWorkerFromRoom(inhabitant, previousRoom?.id);

  return {
    ...nextState,
    inhabitants: nextState.inhabitants.map((item) => item.id === inhabitantId
      ? { ...unassigned,
        floor: cell.floor, column: cell.column, offsetX: 0, currentRoomId: cell.id,
        state: 'imprisoned', currentState: 'idle', pose: 'idle', targetOffsetX: null,
        is_prisoner: true, is_on_expedition: false, expedition_timer: 0 }
      : item),
    notice: `${inhabitant.id} foi transferido para a Cela de Detencao.`,
  };
}

export function detainRebel(state, inhabitantId) {
  return arrestNPC(state, inhabitantId);
}
