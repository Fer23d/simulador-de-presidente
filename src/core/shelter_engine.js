import { getDepthAdjustedScrapCost, getRoomUpgradeCosts, ROOM_MAX_LEVEL } from './bunker_economy.js';
import { getPresidentClassModifiers } from './player_state.js';
import { normalizeNeeds } from './needs.js';
import { generateResidentIdentity } from './names.js';

export const SLOT_WIDTH = 264;
export const ROOM_HEIGHT = 146;
export const FLOOR_SPACING = 181;
export const WORLD_LEFT = 60;
export const WORLD_TOP = 176;
export const MAX_FLOORS = 6;
export const MAX_COLUMNS = 7;

export const SHELTER_TYPES = Object.freeze({
  vault: Object.freeze({ name: 'Porta do Cofre', cost: 0, capacity: 3500, accent: '#e7b36f' }),
  elevator: Object.freeze({ name: 'Elevador', cost: 65, capacity: 0, accent: '#91a8a9' }),
  dormitory: Object.freeze({ name: 'Dormitório', cost: 80, capacity: 500, accent: '#9b7a68' }),
  generator: Object.freeze({ name: 'Sala do Gerador', cost: 120, capacity: 0, accent: '#e7a947' }),
  greenhouse: Object.freeze({ name: 'Estufa Hidropônica', cost: 100, capacity: 100, accent: '#87b888' }),
  arsenal: Object.freeze({ name: 'Arsenal Militar', cost: 150, capacity: 0, accent: '#ad7168' }),
  medical: Object.freeze({ name: 'Centro Médico', cost: 130, capacity: 80, accent: '#88b5ae' }),
  radio: Object.freeze({ name: 'Sala de Rádio', cost: 105, capacity: 0, accent: '#b9a277' }),
  office: Object.freeze({ name: 'Gabinete do Ditador', cost: 220, capacity: 0, accent: '#b396b1' }),
  detention: Object.freeze({ name: 'Cela de Detenção', cost: 180, capacity: 0, accent: '#a9574c' }),
  laboratory: Object.freeze({ name: 'Laboratório de Pesquisa', cost: 300, capacity: 0, accent: '#79c7d1' }),
  life_support: Object.freeze({ name: 'Suporte de Vida', cost: 180, capacity: 0, accent: '#84cbd4' }),
  presidential_suite: Object.freeze({ name: 'Suíte Presidencial', cost: 220, capacity: 0, accent: '#d3ae5d' }),
});

function emptyGrid() {
  return Array.from({ length: MAX_FLOORS }, () => Array(MAX_COLUMNS).fill(null));
}

function makeRoom(type, floor, column, data = {}) {
  return {
    id: typeof data.id === 'string' && /^[a-z0-9-]{1,32}$/.test(data.id) ? data.id : `${type}-${floor}-${column}`,
    type, floor, column,
    level: Math.max(1, Math.min(ROOM_MAX_LEVEL, Math.floor(Number(data.level) || 1))),
    operational: type === 'generator' ? data.operational === true : true,
    ...(typeof data.staffedBy === 'string' ? { staffedBy: data.staffedBy } : {}),
    ...(type === 'greenhouse' && Number.isFinite(Number(data.disabledMonthsRemaining))
      ? { disabledMonthsRemaining: Math.max(0, Math.floor(Number(data.disabledMonthsRemaining))) }
      : {}),
  };
}

function initialGrid() {
  const grid = emptyGrid();
  grid[0][0] = makeRoom('elevator', 0, 0);
  grid[0][1] = makeRoom('vault', 0, 1);
  return grid;
}

export const INITIAL_SHELTER_GRID = initialGrid();

export function getRoom(grid, floor, column) {
  return Number.isInteger(floor) && Number.isInteger(column) && floor >= 0 && floor < MAX_FLOORS && column >= 0 && column < MAX_COLUMNS
    ? grid?.[floor]?.[column] ?? null : null;
}

export function findBuildSlots(grid, type) {
  if (!SHELTER_TYPES[type] || type === 'vault') return [];
  const slots = [];
  for (let floor = 0; floor < MAX_FLOORS; floor++) {
    for (let column = 0; column < MAX_COLUMNS; column++) {
      if (getRoom(grid, floor, column)) continue;
      if (type === 'elevator') {
        if (column === 0 && floor > 0 && getRoom(grid, floor - 1, 0)?.type === 'elevator') slots.push({ floor, column });
      } else if (column > 0 && getRoom(grid, floor, column - 1)) {
        slots.push({ floor, column });
      }
    }
  }
  return slots;
}

export function getShelterBuildCost(type, floor, presidentClass = null) {
  const baseCost = SHELTER_TYPES[type]?.cost;
  if (!Number.isFinite(baseCost) || !Number.isInteger(floor) || floor < 0) return null;
  return Math.ceil(getDepthAdjustedScrapCost(baseCost, floor) * getPresidentClassModifiers(presidentClass).buildCostMultiplier);
}

export function normalizeShelterGrid(value) {
  const grid = initialGrid();
  if (!Array.isArray(value)) return grid;
  for (let floor = 0; floor < MAX_FLOORS; floor++) {
    if (floor > 0 && value[floor]?.[0]?.type === 'elevator' && findBuildSlots(grid, 'elevator').some((slot) => slot.floor === floor)) {
      grid[floor][0] = makeRoom('elevator', floor, 0, value[floor][0]);
    }
    for (let column = 1; column < MAX_COLUMNS; column++) {
      const candidate = value[floor]?.[column];
      if (!candidate || !SHELTER_TYPES[candidate.type] || ['vault', 'elevator'].includes(candidate.type)) continue;
      if (findBuildSlots(grid, candidate.type).some((slot) => slot.floor === floor && slot.column === column)) {
        grid[floor][column] = makeRoom(candidate.type, floor, column, candidate);
      }
    }
  }
  return grid;
}

export function migrateLegacyRooms(legacyRooms) {
  const grid = initialGrid();
  if (!Array.isArray(legacyRooms)) return grid;
  for (const candidate of legacyRooms) {
    if (!candidate || !['dormitory', 'generator', 'greenhouse'].includes(candidate.type)) continue;
    let slot = findBuildSlots(grid, candidate.type)[0];
    if (!slot) {
      const elevatorSlot = findBuildSlots(grid, 'elevator')[0];
      if (!elevatorSlot) break;
      grid[elevatorSlot.floor][0] = makeRoom('elevator', elevatorSlot.floor, 0);
      slot = findBuildSlots(grid, candidate.type)[0];
    }
    if (slot) grid[slot.floor][slot.column] = makeRoom(candidate.type, slot.floor, slot.column, candidate);
  }
  return grid;
}

export function migrateLegacyPlayer(player, legacyRooms, grid) {
  if (!player || !Number.isInteger(player.x) || !Number.isInteger(player.y) || !Array.isArray(legacyRooms)) return [];
  const oldRoom = legacyRooms.find((room) => room && Number.isInteger(room.x) && Number.isInteger(room.y) &&
    player.x >= room.x && player.x < room.x + 5 && player.y >= room.y && player.y < room.y + 5);
  const newRoom = oldRoom?.type === 'vault' ? getRoom(grid, 0, 1) : grid.flat().find((room) => room?.id === oldRoom?.id);
  if (!newRoom) return [];
  return [{ id: 'president', floor: newRoom.floor, column: newRoom.column,
    ...cellCenter(newRoom.floor, newRoom.column), facing: player.facing === 'west' ? -1 : 1, route: [] }];
}

export function buildShelterRoom(state, type, floor, column) {
  const specification = SHELTER_TYPES[type];
  if (!state.is_wasteland || !specification || type === 'vault') return { ...state, notice: 'Módulo inválido.' };
  if (!findBuildSlots(state.shelter_grid, type).some((slot) => slot.floor === floor && slot.column === column)) {
    return { ...state, notice: 'Construa ao lado de uma sala ou prolongue o elevador.' };
  }
  const buildCost = getShelterBuildCost(type, floor, state.presidentClass);
  if ((Number(state.scrap) || 0) < buildCost) return { ...state, notice: 'Sucata insuficiente.' };
  const grid = state.shelter_grid.map((row) => [...row]);
  const roles = { generator: 'engineer', greenhouse: 'scientist', laboratory: 'scientist', medical: 'medic', arsenal: 'guard', radio: 'engineer', office: 'resident' };
  const hasWorker = Array.isArray(state.inhabitants) && !['elevator', 'detention', 'life_support', 'presidential_suite'].includes(type);
  const workerId = `worker-${floor}-${column}`;
  const productiveRoom = ['generator', 'greenhouse', 'laboratory'].includes(type);
  grid[floor][column] = makeRoom(type, floor, column, productiveRoom ? { staffedBy: workerId } : {});
  const inhabitants = Array.isArray(state.inhabitants) && !['elevator', 'detention', 'life_support', 'presidential_suite'].includes(type)
    ? [...state.inhabitants, { id: `worker-${floor}-${column}`, floor, column, offsetX: column % 2 ? -78 : 78,
      currentRoomId: `${type}-${floor}-${column}`, state: productiveRoom ? 'working' : 'idle',
      role: roles[type] ?? 'resident', pose: ['generator', 'greenhouse', 'laboratory', 'medical', 'radio'].includes(type) ? 'working' : 'idle', facing: column % 2 ? 1 : -1,
      currentState: 'idle', targetOffsetX: null, waitSeconds: 1, loyalty: 100,
      revoltChance: 20, lastTalkedDay: 0,
      ...generateResidentIdentity(workerId), isVIP: false, modifier: 1,
      is_on_expedition: false, expedition_timer: 0, is_prisoner: false, needs: normalizeNeeds() }]
    : state.inhabitants;
  if (hasWorker && productiveRoom) {
    inhabitants[inhabitants.length - 1].workFloor = floor;
    inhabitants[inhabitants.length - 1].workColumn = column;
    inhabitants[inhabitants.length - 1].rebellionCheckDone = false;
  }
  return { ...state, scrap: state.scrap - buildCost, shelter_grid: grid, ...(inhabitants ? { inhabitants } : {}),
    notice: `${specification.name} construído no andar ${floor + 1}, setor ${column}.` };
}

export function repairShelterGenerator(state, floor, column) {
  const room = getRoom(state.shelter_grid, floor, column);
  if (!state.is_wasteland || room?.type !== 'generator' || room.operational) return { ...state, notice: 'Gerador indisponível para reparo.' };
  if ((Number(state.scrap) || 0) < 25) return { ...state, notice: 'Sucata insuficiente para o reparo.' };
  const grid = state.shelter_grid.map((row) => [...row]);
  grid[floor][column] = { ...room, operational: true };
  return { ...state, scrap: state.scrap - 25, shelter_grid: grid, notice: 'Gerador reparado e pronto para produzir.' };
}

export function upgradeShelterRoom(state, floor, column) {
  const room = getRoom(state.shelter_grid, floor, column);
  const costs = getRoomUpgradeCosts(room, state.presidentClass);
  if (!state.is_wasteland || !room || costs === null) {
    return { ...state, notice: 'Esta sala não pode receber mais melhorias.' };
  }
  if ((Number(state.scrap) || 0) < costs.scrap) return { ...state, notice: 'Sucata insuficiente para melhorar a sala.' };
  if ((Number(state.science) || 0) < costs.science) return { ...state, notice: 'Ciência insuficiente para melhorar a sala.' };
  const grid = state.shelter_grid.map((row) => [...row]);
  grid[floor][column] = { ...room, level: room.level + 1 };
  return { ...state, scrap: state.scrap - costs.scrap, science: (Number(state.science) || 0) - costs.science,
    shelter_grid: grid, notice: `${SHELTER_TYPES[room.type].name} melhorado para nível ${room.level + 1}.` };
}

export function calculateShelterCapacity(grid) {
  return grid.flat().reduce((total, room) => total + (room ? SHELTER_TYPES[room.type].capacity * room.level : 0), 0);
}

function hasModule(state, type) {
  return Boolean(state.shelter_grid?.flat().some((room) => room?.type === type));
}

export function equipShelterGuard(state) {
  if (!state.is_wasteland || !hasModule(state, 'arsenal') || (state.shelter_supplies?.weapons ?? 0) < 1) {
    return { ...state, notice: 'Arsenal ou armamento indisponível.' };
  }
  return { ...state, shelter_guards: (state.shelter_guards ?? 0) + 1,
    shelter_supplies: { ...state.shelter_supplies, weapons: state.shelter_supplies.weapons - 1 },
    notice: 'Um habitante recebeu armamento e integra a guarda do Vault.' };
}

export function useShelterMedkit(state) {
  if (!state.is_wasteland || !hasModule(state, 'medical') || (state.shelter_supplies?.medkits ?? 0) < 1) {
    return { ...state, notice: 'Centro médico ou curativos indisponíveis.' };
  }
  return { ...state, shelter_radiation: Math.max(0, (state.shelter_radiation ?? 0) - 15),
    shelter_supplies: { ...state.shelter_supplies, medkits: state.shelter_supplies.medkits - 1 },
    notice: 'Tratamento concluído. A exposição à radiação diminuiu.' };
}

export function broadcastShelterSignal(state) {
  if (!state.is_wasteland || !hasModule(state, 'radio') || (state.scrap ?? 0) < 10) {
    return { ...state, notice: 'Sala de rádio ou sucata indisponível.' };
  }
  const population = Math.min(calculateShelterCapacity(state.shelter_grid), (state.country?.populacao_base ?? 0) + 10);
  return { ...state, scrap: state.scrap - 10,
    country: { ...state.country, populacao: population, populacao_base: population },
    notice: 'A transmissão alcançou sobreviventes da superfície.' };
}

export function findRoute(grid, from, to) {
  if (!getRoom(grid, from.floor, from.column) || !getRoom(grid, to.floor, to.column)) return null;
  const key = ({ floor, column }) => `${floor}:${column}`;
  const queue = [from];
  const parent = new Map([[key(from), null]]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (key(current) === key(to)) {
      const route = [];
      let cursor = current;
      while (cursor) { route.unshift(cursor); cursor = parent.get(key(cursor)); }
      return route;
    }
    const neighbors = [
      { floor: current.floor, column: current.column - 1 },
      { floor: current.floor, column: current.column + 1 },
    ];
    if (getRoom(grid, current.floor, current.column)?.type === 'elevator') {
      neighbors.push({ floor: current.floor - 1, column: current.column }, { floor: current.floor + 1, column: current.column });
    }
    for (const next of neighbors) {
      if (!getRoom(grid, next.floor, next.column) || parent.has(key(next))) continue;
      if (next.floor !== current.floor && getRoom(grid, next.floor, next.column)?.type !== 'elevator') continue;
      parent.set(key(next), current);
      queue.push(next);
    }
  }
  return null;
}

export function cellCenter(floor, column) {
  return { x: WORLD_LEFT + column * SLOT_WIDTH + SLOT_WIDTH / 2,
    y: WORLD_TOP + floor * FLOOR_SPACING + ROOM_HEIGHT - 19 };
}

export function normalizeShelterInhabitants(value, grid) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const candidate of value.slice(0, 32)) {
    if (!candidate || typeof candidate.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(candidate.id) || seen.has(candidate.id)) continue;
    if (!Number.isInteger(candidate.floor) || !Number.isInteger(candidate.column) || !getRoom(grid, candidate.floor, candidate.column)) continue;
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) ||
      candidate.x < WORLD_LEFT || candidate.x > WORLD_LEFT + MAX_COLUMNS * SLOT_WIDTH ||
      candidate.y < WORLD_TOP - 80 || candidate.y > WORLD_TOP + MAX_FLOORS * FLOOR_SPACING + ROOM_HEIGHT) continue;
    const route = [];
    let last = { floor: candidate.floor, column: candidate.column };
    for (const step of Array.isArray(candidate.route) ? candidate.route.slice(0, MAX_FLOORS * MAX_COLUMNS) : []) {
      if (!step || !Number.isInteger(step.floor) || !Number.isInteger(step.column)) break;
      if (findRoute(grid, last, step)?.length !== 2) break;
      route.push({ floor: step.floor, column: step.column });
      last = step;
    }
    seen.add(candidate.id);
    result.push({ id: candidate.id, floor: candidate.floor, column: candidate.column,
      x: candidate.x, y: candidate.y, facing: candidate.facing === -1 ? -1 : 1, route });
  }
  return result;
}

export function getCellAtPoint(screenX, screenY, camera) {
  const x = screenX - (camera?.offset_x ?? 0) - WORLD_LEFT;
  const y = screenY - (camera?.offset_y ?? 0) - WORLD_TOP;
  const column = Math.floor(x / SLOT_WIDTH);
  const floor = Math.floor(y / FLOOR_SPACING);
  if (column < 0 || column >= MAX_COLUMNS || floor < 0 || floor >= MAX_FLOORS || y % FLOOR_SPACING >= ROOM_HEIGHT) return null;
  return { floor, column };
}

export class Inhabitant {
  constructor(id, floor, column, president = false) {
    this.id = id;
    this.floor = floor;
    this.column = column;
    this.president = president;
    this.x = cellCenter(floor, column).x;
    this.y = cellCenter(floor, column).y;
    this.route = [];
    this.facing = 1;
    this.walkPhase = 0;
    this.idle = 1 + Math.random() * 3;
  }

  assign(grid, floor, column) {
    const route = findRoute(grid, { floor: this.floor, column: this.column }, { floor, column });
    if (!route) return false;
    this.route = route.slice(1);
    this.idle = 2;
    return true;
  }

  update(delta) {
    if (!this.route.length) { this.idle -= delta; return false; }
    const destination = cellCenter(this.route[0].floor, this.route[0].column);
    const dx = destination.x - this.x;
    const dy = destination.y - this.y;
    const distance = Math.hypot(dx, dy);
    const speed = dx ? 88 : 115;
    const step = Math.min(distance, speed * delta);
    if (distance > 0) { this.x += dx / distance * step; this.y += dy / distance * step; }
    if (Math.abs(dx) > 1) this.facing = Math.sign(dx);
    this.walkPhase += delta * 9;
    if (distance <= step + .01) {
      this.floor = this.route[0].floor;
      this.column = this.route[0].column;
      this.route.shift();
      return true;
    }
    return false;
  }
}

function roomRect(floor, column, camera) {
  return { x: WORLD_LEFT + column * SLOT_WIDTH + camera.offset_x,
    y: WORLD_TOP + floor * FLOOR_SPACING + camera.offset_y, width: SLOT_WIDTH - 6, height: ROOM_HEIGHT };
}

function line(ctx, x1, y1, x2, y2, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function terrain(ctx, camera, viewport) {
  const earth = ctx.createLinearGradient(0, 0, 0, viewport.height);
  earth.addColorStop(0, '#34404a');
  earth.addColorStop(.19, '#302c2a');
  earth.addColorStop(1, '#1b191a');
  ctx.fillStyle = earth;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  const surface = WORLD_TOP - 30 + camera.offset_y;
  if (surface > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, surface);
    sky.addColorStop(0, '#35414b');
    sky.addColorStop(1, '#655c4e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewport.width, surface);
    ctx.fillStyle = '#716955';
    ctx.fillRect(0, surface - 7, viewport.width, 12);
    line(ctx, 0, surface + 4, viewport.width, surface + 4, '#b89a6e', 3);
  }
  for (let floor = 0; floor < MAX_FLOORS + 2; floor++) {
    const y = WORLD_TOP + floor * FLOOR_SPACING + camera.offset_y + ROOM_HEIGHT + 9;
    if (y < 0 || y > viewport.height) continue;
    line(ctx, 0, y, viewport.width, y - 5, '#49413a', 3);
    line(ctx, 0, y + 12, viewport.width, y + 9, '#282522', 2);
  }
  for (let index = 0; index < 120; index++) {
    const x = ((index * 197 + Math.floor(camera.offset_x * .22)) % (viewport.width + 32) + viewport.width + 32) % (viewport.width + 32);
    const y = ((index * 103 + Math.floor(camera.offset_y * .3)) % (viewport.height + 22) + viewport.height + 22) % (viewport.height + 22);
    if (y < surface + 10) continue;
    ctx.fillStyle = index % 3 ? '#36312e' : '#51473e';
    ctx.fillRect(x, y, index % 4 + 2, index % 3 + 1);
  }
}

function drawElevator(ctx, rect, room, grid) {
  const shaftX = rect.x + rect.width / 2 - 31;
  if (getRoom(grid, room.floor, 1)) {
    const corridorX = shaftX + 61;
    const corridorWidth = rect.x + SLOT_WIDTH - corridorX + 4;
    ctx.fillStyle = '#273438';
    ctx.fillRect(corridorX, rect.y + 57, corridorWidth, 62);
    ctx.fillStyle = '#697879';
    ctx.fillRect(corridorX, rect.y + 54, corridorWidth, 7);
    ctx.fillStyle = '#4e5a5b';
    ctx.fillRect(corridorX, rect.y + 116, corridorWidth, 9);
    line(ctx, corridorX, rect.y + 96, corridorX + corridorWidth, rect.y + 96, '#8c7960', 2);
  }
  ctx.fillStyle = '#0c1417';
  ctx.fillRect(shaftX - 8, rect.y - 14, 78, rect.height + 37);
  ctx.fillStyle = '#647477';
  ctx.fillRect(shaftX - 8, rect.y - 14, 7, rect.height + 37);
  ctx.fillRect(shaftX + 63, rect.y - 14, 7, rect.height + 37);
  for (let step = 0; step < 6; step++) line(ctx, shaftX + 12, rect.y + step * 27, shaftX + 49, rect.y + step * 27, '#394d4e', 2);
  ctx.fillStyle = '#526264';
  ctx.fillRect(shaftX, rect.y + 31, 62, 95);
  ctx.fillStyle = '#1b292c';
  ctx.fillRect(shaftX + 5, rect.y + 37, 52, 78);
  line(ctx, shaftX + 31, rect.y + 38, shaftX + 31, rect.y + 115, '#879996', 2);
  ctx.fillStyle = '#f3b457';
  ctx.fillRect(shaftX + 54, rect.y + 68, 4, 6);
  ctx.font = '13px "Share Tech Mono", monospace';
  ctx.fillStyle = '#d8be91';
  ctx.fillText(`ELEV. ${room.floor + 1}`, rect.x + 18, rect.y + 23);
}

function drawFurniture(ctx, room, rect, time) {
  const { x, y, width, height } = rect;
  if (room.type === 'vault') {
    ctx.fillStyle = '#46545b';
    ctx.fillRect(x + 25, y + 37, 72, 72);
    ctx.strokeStyle = '#a1a19a';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 30, y + 42, 62, 62);
    ctx.fillStyle = '#171e23';
    ctx.fillRect(x + 145, y + 75, 73, 37);
    ctx.fillStyle = '#7db6ab';
    ctx.fillRect(x + 153, y + 82, 28, 14);
    ctx.fillStyle = '#d5ac62';
    ctx.fillRect(x + 189, y + 86, 16, 5);
    line(ctx, x + 158, y + 75, x + 158, y + 47, '#738384', 4);
    line(ctx, x + 158, y + 47, x + 207, y + 47, '#738384', 4);
  } else if (room.type === 'dormitory') {
    for (const bedX of [x + 26, x + 148]) {
      ctx.fillStyle = '#414b4d';
      ctx.fillRect(bedX, y + 59, 82, 49);
      for (const bedY of [y + 65, y + 88]) {
        ctx.fillStyle = '#344959';
        ctx.fillRect(bedX + 7, bedY, 68, 16);
        ctx.fillStyle = '#c0ad91';
        ctx.fillRect(bedX + 10, bedY + 3, 17, 8);
      }
      line(ctx, bedX, y + 47, bedX, y + 117, '#87908d', 4);
      line(ctx, bedX + 82, y + 47, bedX + 82, y + 117, '#87908d', 4);
    }
  } else if (room.type === 'generator') {
    ctx.fillStyle = '#303c3d';
    ctx.fillRect(x + 34, y + 57, 166, 52);
    ctx.fillStyle = '#76817c';
    ctx.fillRect(x + 43, y + 49, 82, 13);
    for (let index = 0; index < 5; index++) {
      ctx.fillStyle = index % 2 ? '#a4793f' : '#e2a645';
      ctx.fillRect(x + 52 + index * 29, y + 73, 18, 8);
    }
    ctx.fillStyle = room.operational && Math.sin(time * 3) > -.3 ? '#f6c565' : '#4b4338';
    ctx.fillRect(x + 211, y + 78, 13, 9);
    line(ctx, x + 125, y + 51, x + 125, y + 30, '#8c9290', 7);
    line(ctx, x + 125, y + 30, x + 199, y + 30, '#8c9290', 7);
  } else if (room.type === 'greenhouse') {
    ctx.fillStyle = '#6f8880';
    ctx.fillRect(x + 16, y + 23, width - 32, 8);
    for (let index = 0; index < 4; index++) {
      const planterX = x + 25 + index * 54;
      ctx.fillStyle = '#42413b';
      ctx.fillRect(planterX, y + 94, 42, 15);
      line(ctx, planterX + 21, y + 91, planterX + 21, y + 62, '#5c9f67', 3);
      ctx.fillStyle = '#83bc7d';
      ctx.beginPath();
      ctx.ellipse(planterX + 14, y + 72, 11, 5, -.5, 0, Math.PI * 2);
      ctx.ellipse(planterX + 29, y + 64, 11, 5, .5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#b0d1bf';
    ctx.fillRect(x + 196, y + 34, 23, 18);
  }
}

function drawRoom(ctx, room, grid, camera, time) {
  const rect = roomRect(room.floor, room.column, camera);
  if (room.type === 'elevator') { drawElevator(ctx, rect, room, grid); return; }
  const backdrop = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  const palette = {
    vault: ['#495a5d', '#253237'],
    dormitory: ['#584943', '#2a3032'],
    generator: ['#645341', '#2e3434'],
    greenhouse: ['#415c53', '#22352f'],
  }[room.type];
  backdrop.addColorStop(0, palette[0]);
  backdrop.addColorStop(1, palette[1]);
  ctx.fillStyle = '#0d1113';
  ctx.fillRect(rect.x - 6, rect.y - 15, rect.width + 12, rect.height + 34);
  ctx.fillStyle = backdrop;
  ctx.fillRect(rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8);
  for (let panel = 1; panel < 4; panel++) line(ctx, rect.x + panel * 63, rect.y + 18, rect.x + panel * 63, rect.y + rect.height - 13, '#64716e66', 1);
  ctx.fillStyle = '#707b7a';
  ctx.fillRect(rect.x - 5, rect.y - 13, rect.width + 10, 13);
  ctx.fillStyle = '#303a3b';
  ctx.fillRect(rect.x - 5, rect.y + rect.height - 15, rect.width + 10, 24);
  ctx.fillStyle = '#b39c72';
  ctx.fillRect(rect.x + 4, rect.y + rect.height - 16, rect.width - 8, 3);
  for (const support of [rect.x + 4, rect.x + rect.width - 10]) {
    ctx.fillStyle = '#61706e';
    ctx.fillRect(support, rect.y + 1, 7, rect.height - 14);
    ctx.fillStyle = '#d7b773';
    ctx.fillRect(support + 1, rect.y + 3, 5, 4);
  }
  ctx.fillStyle = SHELTER_TYPES[room.type].accent;
  ctx.font = '14px "Share Tech Mono", monospace';
  ctx.fillText(`${SHELTER_TYPES[room.type].name.toUpperCase()}  /  N${room.level}`, rect.x + 16, rect.y + 24);
  drawRoomLevelIndicators(ctx, rect, room.level);
  drawFurniture(ctx, room, rect, time);
  ctx.fillStyle = 'rgba(255, 184, 98, .05)';
  ctx.fillRect(rect.x + 8, rect.y + 27, rect.width - 16, 48);
}

export function drawRoomLevelIndicators(ctx, rect, level) {
  const activeLevel = Math.max(1, Math.min(ROOM_MAX_LEVEL, Math.floor(Number(level) || 1)));
  const size = 8;
  const gap = 4;
  const startX = rect.x + rect.width - (ROOM_MAX_LEVEL * size + (ROOM_MAX_LEVEL - 1) * gap) - 13;
  const y = rect.y + 10;
  for (let index = 0; index < ROOM_MAX_LEVEL; index++) {
    ctx.fillStyle = index < activeLevel ? '#69d879' : '#343c3a';
    ctx.fillRect(startX + index * (size + gap), y, size, size);
  }
}

function drawInhabitant(ctx, inhabitant, camera, time, selected) {
  const x = inhabitant.x + camera.offset_x;
  const y = inhabitant.y + camera.offset_y;
  const stride = inhabitant.route.length ? Math.sin(inhabitant.walkPhase) * 5 : Math.sin(time * 1.6 + x) * .5;
  ctx.fillStyle = '#11191b99';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b2428';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  line(ctx, x - 5, y - 18, x - 7 - stride, y - 2, '#1b2428', 7);
  line(ctx, x + 5, y - 18, x + 7 + stride, y - 2, '#1b2428', 7);
  ctx.fillStyle = inhabitant.president ? '#364f62' : '#6b6754';
  ctx.fillRect(x - 10, y - 41, 20, 24);
  ctx.fillStyle = inhabitant.president ? '#a8bdc0' : '#9f9180';
  ctx.fillRect(x - 9, y - 25, 18, 4);
  line(ctx, x - 10, y - 36, x - 13 - stride * .4, y - 22, '#b39a82', 5);
  line(ctx, x + 10, y - 36, x + 13 + stride * .4, y - 22, '#b39a82', 5);
  ctx.fillStyle = '#bda28c';
  ctx.beginPath();
  ctx.ellipse(x, y - 48, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2727';
  ctx.fillRect(x - 10, y - 60, 18, 5);
  ctx.fillRect(x + (inhabitant.facing > 0 ? 5 : -9), y - 50, 3, 2);
  if (selected) {
    ctx.strokeStyle = '#e9cf78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 18, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f3d079';
    ctx.beginPath();
    ctx.moveTo(x, y - 69);
    ctx.lineTo(x - 6, y - 80);
    ctx.lineTo(x + 6, y - 80);
    ctx.closePath();
    ctx.fill();
  }
}

export function renderShelter(ctx, grid, inhabitants, camera, viewport, { buildMode = false, buildType = 'dormitory', selectedId = null, time = 0 } = {}) {
  terrain(ctx, camera, viewport);
  for (const row of grid) for (const room of row) if (room) drawRoom(ctx, room, grid, camera, time);
  for (const inhabitant of inhabitants) drawInhabitant(ctx, inhabitant, camera, time, inhabitant.id === selectedId);
  if (!buildMode) return;
  for (const { floor, column } of findBuildSlots(grid, buildType)) {
    const rect = roomRect(floor, column, camera);
    ctx.save();
    ctx.strokeStyle = '#b4da9b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rect.x + 6, rect.y + 8, rect.width - 12, rect.height - 15);
    ctx.restore();
    ctx.fillStyle = '#d2efb2';
    ctx.font = '31px "Share Tech Mono", monospace';
    ctx.fillText('+', rect.x + rect.width / 2 - 8, rect.y + rect.height / 2 + 8);
  }
}

export function createShelterEngine(canvas, { grid: inputGrid, previous, onBuild, onRoom, onSelect, onActorsChanged } = {}) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;
  const grid = normalizeShelterGrid(inputGrid);
  const inhabitants = [];
  const oldActors = new Map((previous?.inhabitants ?? []).map((actor) => [actor.id, actor]));
  const residents = [{ id: 'president', floor: 0, column: 1, president: true, offset: 0 }];
  for (const room of grid.flat().filter((item) => item?.type === 'dormitory')) {
    for (let index = 0; index < 2; index++) residents.push({ id: `${room.id}-${index}`, floor: room.floor, column: room.column, president: false, offset: index ? 38 : -38 });
  }
  residents.push({ id: 'vault-resident', floor: 0, column: 1, president: false, offset: 42 });
  for (const resident of residents) {
    const saved = oldActors.get(resident.id);
    const actor = new Inhabitant(resident.id, saved?.floor ?? resident.floor, saved?.column ?? resident.column, resident.president);
    if (!saved) actor.x += resident.offset;
    if (saved && getRoom(grid, actor.floor, actor.column)) {
      actor.x = saved.x;
      actor.y = saved.y;
      actor.route = saved.route ?? [];
      actor.facing = saved.facing ?? 1;
    }
    inhabitants.push(actor);
  }
  const viewport = { width: Math.max(300, canvas.clientWidth || canvas.width || 960), height: Math.max(220, canvas.clientHeight || canvas.height || 600) };
  const vault = cellCenter(0, 1);
  const camera = previous?.camera ? { ...previous.camera } : { offset_x: viewport.width / 2 - vault.x, offset_y: viewport.height * .44 - vault.y };
  let buildMode = false;
  let buildType = 'dormitory';
  let selectedId = previous?.selectedId ?? null;
  let pointer = null;
  let frameId = null;
  let lastTime = 0;
  let stopped = false;
  let paused = false;

  const snapshot = () => ({ camera: { ...camera }, selectedId, inhabitants: inhabitants.map(({ id, floor, column, x, y, facing, route }) =>
    ({ id, floor, column, x, y, facing, route: route.map((step) => ({ ...step })) })) });

  const draw = (time = 0) => {
    const width = Math.max(300, canvas.clientWidth || canvas.width || 960);
    const height = Math.max(220, canvas.clientHeight || canvas.height || 600);
    camera.offset_x += (width - viewport.width) / 2;
    camera.offset_y += (height - viewport.height) / 2;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    viewport.width = width;
    viewport.height = height;
    renderShelter(ctx, grid, inhabitants, camera, viewport, { buildMode, buildType, selectedId, time });
  };

  const frame = (time) => {
    if (stopped) return;
    const delta = Math.min(.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    let actorsChanged = false;
    if (!paused) for (const actor of inhabitants) {
      if (actor.update(delta)) actorsChanged = true;
      if (!actor.route.length && actor.id !== selectedId && actor.id !== 'president' && actor.idle <= 0) {
        const rooms = grid.flat().filter((room) => room && room.type !== 'elevator');
        const destination = rooms[Math.floor(Math.random() * rooms.length)];
        if (destination && actor.assign(grid, destination.floor, destination.column)) actorsChanged = true;
        actor.idle = 2 + Math.random() * 3;
      }
    }
    if (actorsChanged) onActorsChanged?.(snapshot().inhabitants);
    draw(time / 1000);
    frameId = requestAnimationFrame(frame);
  };

  const position = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
  };

  const click = (x, y) => {
    const cell = getCellAtPoint(x, y, camera);
    if (!cell) { selectedId = null; onSelect?.(null); draw(); return; }
    const room = getRoom(grid, cell.floor, cell.column);
    if (buildMode && !room) {
      if (findBuildSlots(grid, buildType).some((slot) => slot.floor === cell.floor && slot.column === cell.column)) onBuild?.(buildType, cell.floor, cell.column);
      return;
    }
    const actor = inhabitants.slice().reverse().find((item) => Math.abs(item.x + camera.offset_x - x) <= 17 &&
      y >= item.y + camera.offset_y - 66 && y <= item.y + camera.offset_y + 7);
    if (actor && !buildMode) {
      selectedId = selectedId === actor.id ? null : actor.id;
      onSelect?.(selectedId ? actor : null);
      draw();
      return;
    }
    if (!room) return;
    const selected = inhabitants.find((item) => item.id === selectedId);
    if (selected && selected.assign(grid, cell.floor, cell.column)) {
      onActorsChanged?.(snapshot().inhabitants);
      selectedId = null;
      onSelect?.(null);
      draw();
    } else if (!selected) onRoom?.(room);
  };

  const down = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const point = position(event);
    pointer = { ...point, cameraX: camera.offset_x, cameraY: camera.offset_y, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!pointer) return;
    const point = position(event);
    const dx = point.x - pointer.x;
    const dy = point.y - pointer.y;
    if (Math.hypot(dx, dy) > 5) pointer.moved = true;
    if (pointer.moved) { camera.offset_x = pointer.cameraX + dx; camera.offset_y = pointer.cameraY + dy; draw(); }
  };
  const up = (event) => {
    if (!pointer) return;
    const point = position(event);
    if (!pointer.moved) click(point.x, point.y);
    pointer = null;
  };
  const doubleClick = (event) => {
    const point = position(event);
    const cell = getCellAtPoint(point.x, point.y, camera);
    const room = cell && getRoom(grid, cell.floor, cell.column);
    if (room) { selectedId = null; onRoom?.(room); }
  };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', doubleClick);
  draw();
  if (typeof requestAnimationFrame === 'function') frameId = requestAnimationFrame(frame);

  return {
    getSnapshot: snapshot,
    setBuildMode(value) { buildMode = Boolean(value); if (buildMode) selectedId = null; draw(); },
    setBuildType(type) { if (SHELTER_TYPES[type] && type !== 'vault') buildType = type; draw(); },
    pause() { paused = true; },
    resume() { paused = false; },
    destroy() {
      stopped = true;
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('dblclick', doubleClick);
    },
  };
}
