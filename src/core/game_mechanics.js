import { nextRandom } from './geopolitics.js';

const EXPEDITION_MONTHS = 3;
const EXPEDITION_SUCCESS_CHANCE = 0.7;
const REBEL_SCRAP_COST = 5;
const LOW_MORALE_THRESHOLD = 40;
const REBELLION_CHANCE = 0.2;
const SCOUT_EXPEDITION_SUCCESS_CHANCE = 0.65;
const GREENHOUSE_CURE_SUCCESS_CHANCE = 0.6;

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
  if (!room || !['greenhouse', 'generator'].includes(room.type) || (room.type === 'generator' && !room.operational)) return 0;
  const workers = (state.inhabitants ?? []).filter((inhabitant) =>
    inhabitant.workFloor === room.floor && inhabitant.workColumn === room.column);
  if (room.staffedBy) {
    const assigned = workers.find((inhabitant) => inhabitant.id === room.staffedBy);
    if (!assigned) return 0;
    return assigned.is_on_expedition || assigned.is_prisoner || assigned.currentState === 'rebel'
      ? 0 : Number(assigned.loyalty ?? 100) < LOW_MORALE_THRESHOLD ? 0.5 : 1;
  }
  if (!workers.length) return 1;
  return workers.reduce((total, worker) => total + (worker.is_on_expedition || worker.is_prisoner || worker.currentState === 'rebel'
    ? 0 : Number(worker.loyalty ?? 100) < LOW_MORALE_THRESHOLD ? 0.5 : 1), 0) / workers.length;
}

export function startExpedition(state, inhabitantId) {
  const inhabitant = state.inhabitants?.find((item) => item.id === inhabitantId);
  if (!state.is_wasteland || !inhabitant || inhabitant.is_on_expedition || inhabitant.is_prisoner || inhabitant.currentState === 'rebel') {
    return { ...state, notice: 'Este habitante nao pode iniciar uma expedicao.' };
  }
  return {
    ...state,
    inhabitants: state.inhabitants.map((item) => item.id === inhabitantId
      ? { ...item, is_on_expedition: true, expedition_timer: EXPEDITION_MONTHS }
      : item),
    notice: `${inhabitant.id} partiu para uma expedicao de tres meses na superficie.`,
  };
}

export function advanceMonthlyGameMechanics(state) {
  let randomSeed = Number(state.randomSeed) || 1;
  const reports = [...(state.pendingExpeditionReports ?? [])];
  const inhabitants = [];
  let scrap = Math.max(0, Number(state.scrap) || 0);
  let technology = state.technology ?? { points: 0, unlocked: [] };
  let lostExplorer = false;

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
    const success = roll.value < EXPEDITION_SUCCESS_CHANCE;
    reports.push({ id: `${state.monthCounter}-${inhabitant.id}`, inhabitantId: inhabitant.id, success });
    if (success) {
      inhabitants.push({ ...inhabitant, is_on_expedition: false, expedition_timer: 0 });
      scrap += 500;
      technology = { ...technology, points: (Number(technology.points) || 0) + 1 };
    } else {
      lostExplorer = true;
    }
  }

  const resourcesDepleted = (Number(state.shelter_supplies?.food) || 0) <= 0
    || (Number(state.shelter_supplies?.energy) || 0) <= 0;
  const updatedInhabitants = inhabitants.map((inhabitant) => {
    if (inhabitant.is_prisoner || inhabitant.is_on_expedition || inhabitant.currentState === 'rebel') return inhabitant;
    const loyalty = Math.max(0, Math.min(100, Number(inhabitant.loyalty ?? 100) - (resourcesDepleted ? 10 : 0)));
    let currentState = inhabitant.currentState;
    let rebellionCheckDone = inhabitant.rebellionCheckDone === true;
    if (loyalty > 0) rebellionCheckDone = false;
    if (loyalty <= 0 && !rebellionCheckDone) {
      const roll = nextRandom(randomSeed);
      randomSeed = roll.seed;
      rebellionCheckDone = true;
      if (roll.value < REBELLION_CHANCE) currentState = 'rebel';
    }
    return { ...inhabitant, loyalty, currentState,
      ...(currentState === 'rebel' ? { targetOffsetX: null } : {}), rebellionCheckDone };
  });
  const rebels = updatedInhabitants.filter((inhabitant) => inhabitant.currentState === 'rebel' && !inhabitant.is_prisoner && !inhabitant.is_on_expedition).length;
  scrap = Math.max(0, scrap - rebels * REBEL_SCRAP_COST);

  return {
    ...state,
    randomSeed,
    scrap,
    technology,
    inhabitants: updatedInhabitants,
    pendingExpeditionReports: reports,
    notice: lostExplorer
      ? '> O SINAL DO EXPLORADOR FOI PERDIDO NO WASTELAND.'
      : rebels > 0 ? `Dissidentes causaram danos discretos ao Vault. Sucata perdida: ${rebels * REBEL_SCRAP_COST}.`
        : resourcesDepleted ? 'Alimentos ou energia esgotados. A lealdade dos habitantes caiu.'
          : reports.length > (state.pendingExpeditionReports?.length ?? 0) ? 'Relatorio de expedicao pronto para consulta.' : state.notice,
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
  const eventLoyaltyChange = optionId === 'attempt-cure' && !outcome ? -10 : loyaltyChange;
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

export function detainRebel(state, inhabitantId) {
  const inhabitant = state.inhabitants?.find((item) => item.id === inhabitantId);
  const cell = state.shelter_grid?.flat().find((room) => room?.type === 'detention');
  if (!state.is_wasteland || !inhabitant || inhabitant.currentState !== 'rebel' || inhabitant.is_prisoner) {
    return { ...state, notice: 'O dissidente nao esta disponivel para detencao.' };
  }
  if (!cell) return { ...state, notice: 'Construa uma Cela de Detencao antes de prender dissidentes.' };
  return {
    ...state,
    inhabitants: state.inhabitants.map((item) => item.id === inhabitantId
      ? { ...item, floor: cell.floor, column: cell.column, offsetX: 0, currentState: 'idle', targetOffsetX: null,
        is_prisoner: true, is_on_expedition: false, expedition_timer: 0 }
      : item),
    notice: `${inhabitant.id} foi transferido para a Cela de Detencao.`,
  };
}
