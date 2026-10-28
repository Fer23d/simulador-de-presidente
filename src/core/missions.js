// Missoes do Vault: cada dilema acontece numa sala real do bunker. O Presidente precisa ir ate la
// (qualquer andar) para abrir o dilema, e ganha sucata ao resolve-lo.
export const MISSION_BASE_REWARD = 25;
export const MISSION_REWARD_PER_FLOOR = 10;

// Salas onde cada dilema prefere acontecer; sem nenhuma delas, vale qualquer sala habitada.
const MISSION_ROOM_TYPES = Object.freeze({
  'ration-emergency': Object.freeze(['greenhouse', 'dormitory', 'office']),
  'generator-bearings': Object.freeze(['generator']),
  'air-filter-crisis': Object.freeze(['life_support', 'medical']),
  'radio-signal-unknown': Object.freeze(['radio', 'office']),
  'greenhouse-fungus': Object.freeze(['greenhouse']),
});

const UNREACHABLE = new Set(['elevator']);

// Historinha contada quando o Presidente chega ao local; {andar} e {setor} sao preenchidos com a sala real.
export const MISSION_STORIES = Object.freeze({
  'ration-emergency': 'Você chega ao andar {andar} e encontra a despensa do setor {setor} cercada. Dois cientistas defendem as últimas latas com uma prancheta, enquanto os operários batem nas prateleiras vazias. "Sem comida para quem pensa, o Vault para de funcionar", diz um deles. O silêncio que se segue é mais perigoso que os gritos. Todos olham para você.',
  'generator-bearings': 'O barulho guia você até o setor {setor} do andar {andar} antes mesmo de abrir a porta: um gemido metálico, ritmado, como um animal ferido. O engenheiro de plantão está coberto de graxa, segurando um rolamento rachado na palma da mão. "Aguenta mais umas semanas", murmura, sem acreditar no que diz. As luzes do corredor piscam a cada volta da turbina.',
  'air-filter-crisis': 'No andar {andar}, o ar do setor {setor} tem gosto de ferrugem. Habitantes tossem encostados nas paredes e uma criança respira por um pano molhado. Os filtros do sistema estão negros de fuligem. A médica de plantão ergue o último curativo esterilizado e espera a sua ordem.',
  'radio-signal-unknown': 'O rádio do setor {setor}, andar {andar}, chia sozinho no escuro. Entre a estática, uma voz repete coordenadas e uma palavra: "sobreviventes". O operador anotou tudo em um guardanapo com mãos trêmulas. Pode ser um esconderijo cheio de suprimentos. Pode ser uma isca. Lá fora, ninguém responde a perguntas.',
  'greenhouse-fungus': 'A luz violeta da estufa do andar {andar} revela o problema assim que você entra no setor {setor}: uma penugem cinzenta cobrindo as folhas, espalhando-se de bandeja em bandeja. O botânico arranca uma planta morta e mostra as raízes apodrecidas. "Se não agirmos agora, perdemos a colheita inteira. Talvez a próxima também."',
});

export function getMissionStory(event) {
  const story = MISSION_STORIES[event?.id];
  if (!story || !hasMissionLocation(event)) return null;
  return story.replaceAll('{andar}', String(event.floor + 1)).replaceAll('{setor}', String(event.column));
}

function missionCandidates(grid, eventId) {
  const rooms = (grid ?? []).flat().filter((room) => room && !UNREACHABLE.has(room.type));
  const preferred = rooms.filter((room) => (MISSION_ROOM_TYPES[eventId] ?? []).includes(room.type));
  return preferred.length ? preferred : rooms;
}

export function createMissionLocation(grid, eventId, seed = 1) {
  const candidates = missionCandidates(grid, eventId);
  if (!candidates.length) return null;
  const roll = ((Math.imul(Math.floor(Number(seed) || 1), 2_654_435_761) >>> 0) % 10_000) / 10_000;
  const room = candidates[Math.floor(roll * candidates.length)];
  return { floor: room.floor, column: room.column };
}

export function hasMissionLocation(event) {
  return Boolean(event) && Number.isInteger(event.floor) && Number.isInteger(event.column);
}

// Missao em andamento: o dilema so aparece depois que o Presidente chega a sala.
export function isMissionPending(event) {
  return hasMissionLocation(event) && event.arrived !== true;
}

export function getMissionReward(event) {
  return hasMissionLocation(event) ? MISSION_BASE_REWARD + MISSION_REWARD_PER_FLOOR * event.floor : 0;
}

export function isPlayerAtMission(event, floor, column) {
  return isMissionPending(event) && event.floor === floor && event.column === column;
}

export function arriveAtMission(state) {
  const event = state?.pendingBunkerEvent;
  if (!isMissionPending(event)) return state;
  return { ...state, pendingBunkerEvent: { ...event, arrived: true } };
}

export function normalizeMission(value, grid) {
  if (!hasMissionLocation(value)) return {};
  const room = grid?.[value.floor]?.[value.column];
  if (!room || UNREACHABLE.has(room.type)) return {};
  return { floor: value.floor, column: value.column, ...(value.arrived === true ? { arrived: true } : {}) };
}
