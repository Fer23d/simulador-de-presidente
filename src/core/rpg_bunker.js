import {
  cellCenter, findBuildSlots, getCellAtPoint, getRoom, INITIAL_SHELTER_GRID,
  MAX_COLUMNS, MAX_FLOORS, ROOM_HEIGHT, SHELTER_TYPES, SLOT_WIDTH,
  FLOOR_SPACING, WORLD_LEFT, WORLD_TOP,
} from './shelter_engine.js';

const WALK_SPEED = 170;
const LIFT_SPEED = 280;
const PLAYER_RADIUS = 14;
const TRIGGER_RADIUS = 70;
const LABELS = Object.freeze({
  vault: 'ACEDER AO COMANDO', generator: 'ACEDER AO TERMINAL DO GERADOR',
  greenhouse: 'INSPECIONAR A ESTUFA', dormitory: 'GERIR DORMITÓRIO',
  arsenal: 'ABRIR O ARSENAL', medical: 'ACEDER AO CENTRO MÉDICO',
  radio: 'OPERAR A SALA DE RÁDIO', office: 'ENTRAR NO GABINETE',
});

export function createRpgPlayer(grid = INITIAL_SHELTER_GRID) {
  const start = getRoom(grid, 0, 1) ? cellCenter(0, 1) : cellCenter(0, 0);
  return { x: start.x, y: start.y, floor: 0, vx: 0, vy: 0, facing: 1, liftTarget: null, liftHeld: false };
}

export function normalizeRpgPlayer(value, grid) {
  const fallback = createRpgPlayer(grid);
  if (!value || !Number.isInteger(value.floor) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return fallback;
  const column = Math.floor((value.x - WORLD_LEFT) / SLOT_WIDTH);
  if (!getRoom(grid, value.floor, column)) return fallback;
  return { x: value.x, y: cellCenter(value.floor, column).y, floor: value.floor,
    vx: 0, vy: 0, facing: value.facing === -1 ? -1 : 1, liftTarget: null, liftHeld: false };
}

function playerColumn(player) {
  return Math.floor((player.x - WORLD_LEFT) / SLOT_WIDTH);
}

export function getElevatorPrompt(player, grid) {
  if (player.liftTarget !== null || getRoom(grid, player.floor, playerColumn(player))?.type !== 'elevator') return '';
  if (Math.abs(player.x - cellCenter(player.floor, playerColumn(player)).x) > 42) return '';
  const up = getRoom(grid, player.floor - 1, 0)?.type === 'elevator';
  const down = getRoom(grid, player.floor + 1, 0)?.type === 'elevator';
  return [up ? '[ W ] SUBIR' : '', down ? '[ S ] DESCER' : ''].filter(Boolean).join('   |   ');
}

export function findNearbyTrigger(player, grid) {
  if (player.liftTarget !== null) return null;
  const room = getRoom(grid, player.floor, playerColumn(player));
  if (!room || room.type === 'elevator') return null;
  const center = cellCenter(room.floor, room.column);
  return Math.abs(player.x - center.x) <= TRIGGER_RADIUS
    ? { room, label: `[ E ] ${LABELS[room.type] ?? 'GERIR SALA'}` } : null;
}

export function updatePlayer(player, input, grid, deltaSeconds) {
  const dt = Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
  const next = { ...player };
  next.liftHeld = Boolean(input.up || input.down);
  if (next.liftTarget !== null) {
    const destination = cellCenter(next.liftTarget, 0).y;
    const distance = destination - next.y;
    next.y += Math.sign(distance) * Math.min(Math.abs(distance), LIFT_SPEED * dt);
    next.vx = 0;
    next.vy = 0;
    if (next.y === destination) {
      next.floor = next.liftTarget;
      next.liftTarget = null;
    }
    return next;
  }
  const elevator = getElevatorPrompt(next, grid);
  if (elevator && !player.liftHeld && ((input.up && elevator.includes('SUBIR')) || (input.down && elevator.includes('DESCER')))) {
    next.liftTarget = next.floor + (input.up ? -1 : 1);
    next.x = cellCenter(next.floor, 0).x;
    next.vx = 0;
    return next;
  }
  const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
  next.vx = direction * WALK_SPEED;
  if (direction) next.facing = direction;
  const proposed = next.x + next.vx * dt;
  const column = Math.floor((proposed - WORLD_LEFT) / SLOT_WIDTH);
  if (getRoom(grid, next.floor, column)) {
    next.x = Math.max(WORLD_LEFT + PLAYER_RADIUS,
      Math.min(WORLD_LEFT + MAX_COLUMNS * SLOT_WIDTH - PLAYER_RADIUS, proposed));
  } else {
    const current = playerColumn(next);
    const roomLeft = WORLD_LEFT + current * SLOT_WIDTH;
    next.x = direction > 0 ? roomLeft + SLOT_WIDTH - PLAYER_RADIUS : roomLeft + PLAYER_RADIUS;
    next.vx = 0;
  }
  const ground = cellCenter(next.floor, playerColumn(next)).y;
  next.vy = Math.min(650, (next.vy || 0) + 1200 * dt);
  next.y = Math.min(ground, next.y + next.vy * dt);
  if (next.y >= ground) { next.y = ground; next.vy = 0; }
  return next;
}

export function createInitialInhabitants(grid = INITIAL_SHELTER_GRID) {
  if (!getRoom(grid, 0, 1)) return [];
  return [
    { id: 'vault-resident-1', floor: 0, column: 1, offsetX: -78, role: 'resident', pose: 'seated', facing: 1 },
    { id: 'vault-engineer-1', floor: 0, column: 1, offsetX: 78, role: 'engineer', pose: 'working', facing: -1 },
  ];
}

export function normalizeInhabitants(value, grid) {
  if (!Array.isArray(value)) return createInitialInhabitants(grid);
  const ids = new Set();
  const result = [];
  for (const npc of value.slice(0, 48)) {
    if (!npc || typeof npc.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(npc.id) ||
      npc.id === 'president' || ids.has(npc.id) || !Number.isInteger(npc.floor) ||
      !Number.isInteger(npc.column) || !getRoom(grid, npc.floor, npc.column) ||
      getRoom(grid, npc.floor, npc.column).type === 'elevator') continue;
    ids.add(npc.id);
    result.push({ id: npc.id, floor: npc.floor, column: npc.column,
      offsetX: Math.max(-98, Math.min(98, Number(npc.offsetX) || 0)),
      role: ['resident', 'engineer', 'scientist', 'medic', 'guard'].includes(npc.role) ? npc.role : 'resident',
      pose: ['idle', 'seated', 'working'].includes(npc.pose) ? npc.pose : 'idle',
      facing: npc.facing === -1 ? -1 : 1 });
  }
  return result;
}

export function getElevatorShaftBounds(grid) {
  const shafts = [];
  for (let column = 0; column < MAX_COLUMNS; column++) {
    for (let floor = 0; floor < MAX_FLOORS; floor++) {
      if (getRoom(grid, floor, column)?.type !== 'elevator') continue;
      const floorStart = floor;
      while (getRoom(grid, floor + 1, column)?.type === 'elevator') floor++;
      const floorEnd = floor;
      shafts.push({ column, floorStart, floorEnd,
        x: WORLD_LEFT + column * SLOT_WIDTH, y: WORLD_TOP + floorStart * FLOOR_SPACING,
        width: SLOT_WIDTH, height: ROOM_HEIGHT + (floorEnd - floorStart) * FLOOR_SPACING });
    }
  }
  return shafts;
}

export function getElevatorCabinGroundY(player, cabinFloor = player.floor) {
  return player.liftTarget !== null ? player.y : cellCenter(cabinFloor, 0).y;
}

export function generateDirtPattern(ctx, texture = textureCanvas('earth_texture', 256)) {
  return ctx.createPattern(texture, 'repeat');
}

export function renderInhabitants(ctx, inhabitants, grid, time = 0) {
  for (let index = 0; index < (inhabitants?.length ?? 0); index++) {
    const npc = inhabitants[index];
    if (!getRoom(grid, npc.floor, npc.column) || getRoom(grid, npc.floor, npc.column).type === 'elevator') continue;
    const center = cellCenter(npc.floor, npc.column);
    const breath = Math.sin(time / 500 + index * 1.8) * 1.4;
    const seated = npc.pose === 'seated';
    const working = npc.pose === 'working';
    const coat = { resident: '#84745f', engineer: '#b38755', scientist: '#b5bcb3', medic: '#8eb4a8', guard: '#667d73' }[npc.role] ?? '#84745f';
    ctx.save();
    ctx.translate(center.x + (npc.offsetX ?? 0), center.y + breath + (seated ? 11 : 0));
    ctx.scale(npc.facing === -1 ? -1 : 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(0, 1, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#252c2a';
    ctx.fillRect(-9, -24, 7, seated ? 15 : 24); ctx.fillRect(3, -24, 7, seated ? 15 : 24);
    const fabric = ctx.createLinearGradient(-13, -61, 14, -19);
    fabric.addColorStop(0, '#ccd0ba'); fabric.addColorStop(.25, coat); fabric.addColorStop(1, '#293635');
    ctx.fillStyle = fabric; ctx.fillRect(-13, seated ? -55 : -61, 26, seated ? 31 : 38);
    ctx.fillStyle = '#b38e73'; ctx.fillRect(-6, seated ? -70 : -77, 13, 16);
    ctx.fillStyle = npc.role === 'engineer' ? '#ae914f' : npc.role === 'guard' ? '#40564f' : '#4a514d';
    ctx.fillRect(-10, seated ? -75 : -82, 21, 7);
    if (npc.role === 'scientist' || npc.role === 'medic') {
      ctx.fillStyle = '#d5d8c9'; ctx.fillRect(-13, -43, 5, 26); ctx.fillRect(8, -43, 5, 26);
    }
    ctx.strokeStyle = coat; ctx.lineWidth = 5;
    const armSwing = working ? Math.sin(time / 180 + index) * 7 : Math.sin(time / 850 + index) * 2;
    ctx.beginPath(); ctx.moveTo(12, -52); ctx.lineTo(17, -34 + armSwing); ctx.stroke();
    ctx.restore();
  }
}

function textureCanvas(kind, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, size, size);
  const colors = kind === 'earth_texture' ? ['#29251f', '#1a1e1c', '#32281d']
    : kind === 'wall_texture' ? ['#464543', '#242927', '#5b554c']
    : kind === 'elevator_shaft' ? ['#333c3d', '#1b2223', '#505457']
      : ['#62615b', '#343b3b', '#58524a'];
  colors.forEach((color, index) => base.addColorStop(index / (colors.length - 1), color));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Seeded details prevent shimmering as the camera moves.
  let seed = kind.length * 607;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let i = 0; i < (kind === 'earth_texture' ? 2600 : 420); i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % size;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % size;
    ctx.fillStyle = kind === 'earth_texture'
      ? (i % 6 ? 'rgba(190,156,109,.1)' : 'rgba(9,10,9,.35)')
      : (i % 7 ? 'rgba(222,219,202,.07)' : 'rgba(74,31,13,.25)');
    ctx.fillRect(x, y, 1 + i % 4, 1 + i % 3);
  }
  if (kind === 'earth_texture') {
    for (let y = 7; y < size; y += 32) {
      ctx.strokeStyle = 'rgba(145,103,66,.24)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * .3, y + 10, size * .7, y - 8, size, y + 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(9,11,10,.38)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, y + 7);
      ctx.bezierCurveTo(size * .3, y + 17, size * .7, y - 1, size, y + 12); ctx.stroke();
    }
    for (let i = 0; i < 75; i++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 2 + random() * 8;
      ctx.fillStyle = i % 4 ? '#242623' : '#514a3d';
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .42, random() * 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(186,162,122,.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x - 1, y - 1, Math.max(1, radius * .35), Math.PI, Math.PI * 1.8); ctx.stroke();
    }
  } else if (kind === 'floor_texture') {
    for (let y = 8; y < size; y += 17) {
      ctx.fillStyle = '#202526'; ctx.fillRect(0, y, size, 3);
      ctx.fillStyle = 'rgba(210,210,196,.25)'; ctx.fillRect(0, y + 4, size, 1);
      for (let x = 10; x < size; x += 28) { ctx.fillStyle = '#151919'; ctx.fillRect(x, y - 3, 3, 3); }
    }
  } else if (kind === 'wall_texture') {
    for (let x = 12; x < size; x += 42) {
      ctx.fillStyle = 'rgba(8,12,12,.6)'; ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = 'rgba(214,184,132,.15)'; ctx.fillRect(x + 5, 0, 1, size);
    }
    ctx.strokeStyle = '#754532'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 43); ctx.bezierCurveTo(39, 66, 53, 22, size, 48); ctx.stroke();
  } else {
    for (let x = 19; x < size; x += 44) {
      ctx.fillStyle = '#0e1517'; ctx.fillRect(x, 0, 7, size);
      ctx.fillStyle = '#788183'; ctx.fillRect(x + 3, 0, 2, size);
    }
    for (let y = 22; y < size; y += 31) { ctx.fillStyle = '#101818'; ctx.fillRect(0, y, size, 4); }
  }
  return canvas;
}

export class AssetManager {
  constructor(urls = {}) {
    this.assets = {};
    this.patterns = new WeakMap();
    for (const key of ['earth_texture', 'wall_texture', 'floor_texture', 'elevator_shaft', 'player_sprite']) {
      this.assets[key] = key === 'player_sprite' ? null : textureCanvas(key, key === 'earth_texture' ? 256 : 128);
      if (urls[key] && typeof Image !== 'undefined') {
        const image = new Image();
        image.onload = () => { this.assets[key] = image; if (key === 'earth_texture') this.patterns = new WeakMap(); };
        image.onerror = () => { /* Keep the procedural texture. */ };
        image.src = urls[key];
      }
    }
  }

  get(key) { return this.assets[key]; }

  getDirtPattern(ctx) {
    if (!this.patterns.has(ctx)) this.patterns.set(ctx, generateDirtPattern(ctx, this.assets.earth_texture));
    return this.patterns.get(ctx);
  }
}

function drawTiled(ctx, image, x, y, width, height) {
  for (let py = y; py < y + height; py += 128) {
    for (let px = x; px < x + width; px += 128) {
      ctx.drawImage(image, px, py, Math.min(128, x + width - px), Math.min(128, y + height - py));
    }
  }
}

function drawGeology(ctx) {
  const surface = WORLD_TOP - 123;
  ctx.strokeStyle = 'rgba(109,85,56,.72)';
  for (let i = 0; i < MAX_COLUMNS + 2; i++) {
    const x = WORLD_LEFT - 180 + i * 235;
    ctx.lineWidth = 4 + i % 3;
    ctx.beginPath(); ctx.moveTo(x, surface);
    ctx.bezierCurveTo(x + 22, surface + 50, x - 31, surface + 65, x + 15, surface + 118); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 12, surface + 70);
    ctx.quadraticCurveTo(x + 61, surface + 84, x + 86, surface + 116); ctx.stroke();
  }
  for (let floor = 0; floor < MAX_FLOORS; floor++) {
    for (let column = -1; column < MAX_COLUMNS + 2; column++) {
      const x = WORLD_LEFT + column * SLOT_WIDTH + 44 + (floor * 73 + column * 41) % 125;
      const y = WORLD_TOP + floor * FLOOR_SPACING + 43 + Math.abs(column * 17 + floor * 23) % 71;
      ctx.fillStyle = floor > 1 ? 'rgba(96,91,75,.72)' : 'rgba(64,62,52,.72)';
      ctx.beginPath(); ctx.ellipse(x, y, 9 + floor % 4, 4 + column % 3, .36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(171,152,114,.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 2, y - 2, 5, Math.PI, Math.PI * 1.8); ctx.stroke();
      if (floor < 2 || column % 2) continue;
      ctx.strokeStyle = floor > 3 ? 'rgba(108,186,160,.43)' : 'rgba(170,130,70,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 71, y + 42);
      ctx.bezierCurveTo(x - 20, y + 25, x + 25, y + 61, x + 73, y + 33); ctx.stroke();
      for (let node = 0; node < 4; node++) {
        ctx.fillStyle = floor > 3 ? 'rgba(129,216,181,.58)' : 'rgba(218,162,76,.62)';
        ctx.beginPath(); ctx.ellipse(x - 49 + node * 33, y + 36 + node % 2 * 10, 4, 2, -.3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function drawElevatorShaft(ctx, grid, assets) {
  for (const shaft of getElevatorShaftBounds(grid)) {
    const cx = shaft.x + shaft.width / 2;
    drawTiled(ctx, assets.get('elevator_shaft'), shaft.x + 12, shaft.y - 5, shaft.width - 24, shaft.height + 10);
    const tunnel = ctx.createLinearGradient(shaft.x, 0, shaft.x + shaft.width, 0);
    tunnel.addColorStop(0, 'rgba(0,0,0,.92)');
    tunnel.addColorStop(.22, 'rgba(6,13,14,.42)');
    tunnel.addColorStop(.5, 'rgba(0,0,0,.24)');
    tunnel.addColorStop(.78, 'rgba(6,13,14,.42)');
    tunnel.addColorStop(1, 'rgba(0,0,0,.92)');
    ctx.fillStyle = tunnel; ctx.fillRect(shaft.x + 12, shaft.y - 5, shaft.width - 24, shaft.height + 10);
    for (const side of [-1, 1]) {
      const railX = cx + side * 71;
      ctx.fillStyle = '#0b1112'; ctx.fillRect(railX - 9, shaft.y - 8, 18, shaft.height + 16);
      const rail = ctx.createLinearGradient(railX - 7, 0, railX + 7, 0);
      rail.addColorStop(0, '#333a38'); rail.addColorStop(.42, '#aab0a6'); rail.addColorStop(1, '#20292a');
      ctx.fillStyle = rail; ctx.fillRect(railX - 5, shaft.y - 8, 10, shaft.height + 16);
      ctx.fillStyle = 'rgba(2,5,5,.7)'; ctx.fillRect(cx + side * 29 - 3, shaft.y - 8, 6, shaft.height + 16);
      ctx.fillStyle = '#878d86'; ctx.fillRect(cx + side * 29 - 1, shaft.y - 8, 2, shaft.height + 16);
    }
    for (let y = shaft.y + 16; y < shaft.y + shaft.height; y += 34) {
      ctx.fillStyle = '#192122'; ctx.fillRect(cx - 90, y, 180, 7);
      ctx.fillStyle = 'rgba(173,178,165,.26)'; ctx.fillRect(cx - 90, y, 180, 1);
      for (const side of [-1, 1]) { ctx.fillStyle = '#abb1a4'; ctx.fillRect(cx + side * 71 - 2, y + 2, 4, 4); }
    }
  }
}

function drawElevatorBay(ctx, room) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  ctx.fillStyle = 'rgba(8,14,15,.3)'; ctx.fillRect(x + 20, y + 4, SLOT_WIDTH - 40, ROOM_HEIGHT - 8);
  ctx.fillStyle = '#11191a'; ctx.fillRect(x, y + ROOM_HEIGHT - 14, SLOT_WIDTH, 15);
  ctx.fillStyle = '#8d9189'; ctx.fillRect(x + 18, y + ROOM_HEIGHT - 14, SLOT_WIDTH - 36, 3);
  ctx.fillStyle = '#1a2020'; ctx.fillRect(x + 3, y + 2, 17, ROOM_HEIGHT - 3);
  ctx.fillRect(x + SLOT_WIDTH - 20, y + 2, 17, ROOM_HEIGHT - 3);
  ctx.fillStyle = '#b6a478'; ctx.fillRect(x + 24, y + 18, 16, 7);
  ctx.fillStyle = '#b6a478'; ctx.fillRect(x + SLOT_WIDTH - 40, y + 18, 16, 7);
}

function drawElevatorCabin(ctx, groundY, time, front = false, moving = false) {
  const cx = WORLD_LEFT + SLOT_WIDTH / 2;
  const top = groundY - ROOM_HEIGHT + 24;
  if (front) {
    const doorWidth = moving ? 38 : 27;
    for (const side of [-1, 1]) {
      const dx = side < 0 ? cx - 57 : cx + 57 - doorWidth;
      const steel = ctx.createLinearGradient(dx, top, dx + doorWidth, top);
      steel.addColorStop(0, '#292f2e'); steel.addColorStop(.55, '#78817b'); steel.addColorStop(1, '#2d3939');
      ctx.fillStyle = steel; ctx.fillRect(dx, top + 10, doorWidth, ROOM_HEIGHT - 43);
      ctx.strokeStyle = 'rgba(192,194,178,.55)'; ctx.lineWidth = 2;
      ctx.strokeRect(dx + 2, top + 13, doorWidth - 4, ROOM_HEIGHT - 49);
      ctx.fillStyle = 'rgba(9,16,16,.6)'; ctx.fillRect(dx + 6, top + 40, doorWidth - 12, 22);
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - 64, top + 6, 128, ROOM_HEIGHT - 31);
  const interior = ctx.createLinearGradient(cx - 55, top, cx + 55, top + ROOM_HEIGHT);
  interior.addColorStop(0, '#68706c'); interior.addColorStop(.4, '#273330'); interior.addColorStop(1, '#101c1d');
  ctx.fillStyle = interior; ctx.fillRect(cx - 55, top + 9, 110, ROOM_HEIGHT - 42);
  ctx.fillStyle = '#171d1d'; ctx.fillRect(cx - 63, top, 126, 10);
  ctx.fillRect(cx - 63, top + ROOM_HEIGHT - 34, 126, 12);
  ctx.fillStyle = '#c7a164'; ctx.fillRect(cx - 20, top + 7, 40, 5);
  const warning = .55 + Math.sin(time / 250) * .3;
  ctx.fillStyle = `rgba(248,104,61,${warning})`;
  ctx.fillRect(cx - 50, top + 22, 8, 5); ctx.fillRect(cx + 42, top + 22, 8, 5);
  ctx.fillStyle = '#222f30'; ctx.fillRect(cx + 37, top + 56, 12, 29);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 1 ? '#d8a96b' : '#95aaa2';
    ctx.fillRect(cx + 40, top + 60 + i * 8, 4, 4);
  }
  ctx.strokeStyle = '#8a918b'; ctx.lineWidth = 3; ctx.strokeRect(cx - 57, top + 5, 114, ROOM_HEIGHT - 32);
}

const ROOM_LIGHTS = Object.freeze({
  vault: Object.freeze({ glow: 'rgba(255,222,163,.45)', halo: 'rgba(243,173,93,.13)', fixture: '#ffe0a5' }),
  generator: Object.freeze({ glow: 'rgba(255,187,79,.57)', halo: 'rgba(244,154,48,.19)', fixture: '#ffc76b' }),
  greenhouse: Object.freeze({ glow: 'rgba(230,146,255,.45)', halo: 'rgba(119,231,167,.22)', fixture: '#ebb1fb' }),
  dormitory: Object.freeze({ glow: 'rgba(255,185,126,.36)', halo: 'rgba(235,133,78,.12)', fixture: '#e9b78f' }),
  arsenal: Object.freeze({ glow: 'rgba(244,126,101,.36)', halo: 'rgba(159,53,40,.13)', fixture: '#e6a08a' }),
  medical: Object.freeze({ glow: 'rgba(145,230,220,.43)', halo: 'rgba(95,192,183,.16)', fixture: '#abe4d9' }),
  radio: Object.freeze({ glow: 'rgba(158,202,240,.35)', halo: 'rgba(91,152,195,.14)', fixture: '#b5d2e0' }),
  office: Object.freeze({ glow: 'rgba(211,168,222,.38)', halo: 'rgba(168,111,187,.14)', fixture: '#d9b6d9' }),
});

export function getRoomLightPalette(type) {
  return ROOM_LIGHTS[type] ?? ROOM_LIGHTS.vault;
}

function drawRoomBackdrop(ctx, room, x, y, time) {
  const signature = room.column * 29 + room.floor * 13;
  for (let i = 0; i < 3; i++) {
    const px = x + 25 + (signature + i * 79) % (SLOT_WIDTH - 60);
    const py = y + 33 + (signature + i * 23) % 54;
    ctx.fillStyle = 'rgba(187,179,143,.1)';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 18, py - 3);
    ctx.lineTo(px + 14, py + 14); ctx.lineTo(px + 6, py + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(136,63,31,.22)';
    ctx.beginPath(); ctx.ellipse(px + 24, py + 11, 13, 6, -.4, 0, Math.PI * 2); ctx.fill();
  }
  for (const pipeY of [y + 39, y + 51]) {
    ctx.strokeStyle = '#111c1c'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(x + 6, pipeY);
    ctx.lineTo(x + SLOT_WIDTH - 30, pipeY); ctx.lineTo(x + SLOT_WIDTH - 30, pipeY + 10); ctx.stroke();
    ctx.strokeStyle = '#68726d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 6, pipeY - 3);
    ctx.lineTo(x + SLOT_WIDTH - 30, pipeY - 3); ctx.stroke();
    for (let brace = x + 34; brace < x + SLOT_WIDTH - 32; brace += 68) {
      ctx.fillStyle = '#8d8777'; ctx.fillRect(brace, pipeY - 8, 5, 14);
    }
  }
  const panelX = x + SLOT_WIDTH - 45;
  ctx.fillStyle = '#192424'; ctx.fillRect(panelX, y + 63, 27, 39);
  ctx.strokeStyle = '#889087'; ctx.lineWidth = 2; ctx.strokeRect(panelX, y + 63, 27, 39);
  for (let light = 0; light < 3; light++) {
    const blink = Math.sin(time / (260 + light * 110) + signature + light) > -.25;
    ctx.fillStyle = blink ? (light === 1 ? '#edbd69' : '#79c09f') : '#34453f';
    ctx.fillRect(panelX + 5 + light * 7, y + 72, 4, 4);
  }
  ctx.strokeStyle = '#3d453f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(panelX + 12, y + 102);
  ctx.bezierCurveTo(panelX + 20, y + 115, panelX - 5, y + 117, panelX + 8, y + 126); ctx.stroke();
}

function drawHydroponics(ctx, x, y, time) {
  for (const lampX of [x + 73, x + 191]) {
    const uv = ctx.createRadialGradient(lampX, y + 25, 3, lampX, y + 44, 80);
    uv.addColorStop(0, 'rgba(255,170,255,.42)');
    uv.addColorStop(1, 'rgba(178,91,208,0)');
    ctx.fillStyle = uv; ctx.fillRect(lampX - 80, y + 7, 160, 109);
    ctx.fillStyle = '#32333c'; ctx.fillRect(lampX - 22, y + 9, 44, 7);
    ctx.fillStyle = '#f0b5f2'; ctx.fillRect(lampX - 17, y + 15, 34, 3);
  }
  for (const [row, level] of [68, 105].entries()) {
    ctx.fillStyle = '#203e41'; ctx.fillRect(x + 32, y + level + 12, SLOT_WIDTH - 64, 16);
    const water = ctx.createLinearGradient(x, y + level + 11, x, y + level + 25);
    water.addColorStop(0, '#6ca7b2'); water.addColorStop(.5, '#315d6b'); water.addColorStop(1, '#142e39');
    ctx.fillStyle = water; ctx.fillRect(x + 37, y + level + 14, SLOT_WIDTH - 74, 10);
    ctx.fillStyle = 'rgba(182,223,231,.48)'; ctx.fillRect(x + 38, y + level + 15, SLOT_WIDTH - 76, 2);
    ctx.strokeStyle = '#9caeaa'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 31, y + level + 11, SLOT_WIDTH - 62, 18);
    for (let plant = 0; plant < 7; plant++) {
      const px = x + 48 + plant * 28;
      const sway = Math.sin(time / 1400 + plant + row) * 2;
      ctx.strokeStyle = '#6b9e69'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, y + level + 12);
      ctx.quadraticCurveTo(px + sway, y + level - 8, px + sway + 2, y + level - 20); ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = side < 0 ? '#557e5e' : '#8ab58a';
        ctx.beginPath();
        ctx.ellipse(px + sway + side * 7, y + level - 12, 9, 3.5, side * .48, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#bdd0a0'; ctx.beginPath();
      ctx.ellipse(px + sway + 2, y + level - 21, 4, 7, .15, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#172a2c'; ctx.fillRect(x + 21, y + 78, 10, 50);
  ctx.fillRect(x + SLOT_WIDTH - 30, y + 78, 10, 50);
}

function drawRoom(ctx, room, assets, time) {
  if (room.type === 'elevator') { drawElevatorBay(ctx, room); return; }
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  const wall = assets.get('wall_texture');
  drawTiled(ctx, wall, x, y, SLOT_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = 'rgba(12,16,15,.2)'; ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
  drawRoomBackdrop(ctx, room, x, y, time);
  const vignette = ctx.createRadialGradient(x + SLOT_WIDTH / 2, y + 54, 14, x + SLOT_WIDTH / 2, y + ROOM_HEIGHT / 2, SLOT_WIDTH * .7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.64)');
  ctx.fillStyle = vignette; ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
  drawTiled(ctx, assets.get('floor_texture'), x, y + ROOM_HEIGHT - 22, SLOT_WIDTH, 22);
  ctx.fillStyle = '#161c1c'; ctx.fillRect(x, y - 7, SLOT_WIDTH, 8);
  ctx.fillStyle = '#74716b'; ctx.fillRect(x, y - 7, SLOT_WIDTH, 2);
  ctx.fillStyle = '#111819'; ctx.fillRect(x, y + ROOM_HEIGHT, SLOT_WIDTH, 9);
  ctx.strokeStyle = 'rgba(162,171,158,.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 4, SLOT_WIDTH - 6, ROOM_HEIGHT - 8);
  if (room.type !== 'elevator') {
    // Distinct silhouettes make modules legible even before authored sprites arrive.
    const cx = x + SLOT_WIDTH / 2;
    if (room.type !== 'greenhouse') {
      ctx.fillStyle = '#172324'; ctx.fillRect(cx - 44, y + 66, 88, 56);
      const panel = ctx.createLinearGradient(cx - 44, y + 66, cx + 44, y + 122);
      panel.addColorStop(0, '#576464'); panel.addColorStop(1, '#222c2b');
      ctx.fillStyle = panel; ctx.fillRect(cx - 39, y + 69, 78, 50);
      ctx.fillStyle = room.type === 'medical' ? '#9ed5c8' : room.type === 'radio' ? '#84acbd' : room.type === 'arsenal' ? '#bd8767' : room.type === 'office' ? '#a996b9' : '#e3ad69';
      ctx.fillRect(cx - 28, y + 78, 56, 19);
      ctx.fillStyle = '#121819'; ctx.fillRect(cx - 23, y + 82, 46, 11);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? '#e5b66d' : '#78b9a4'; ctx.fillRect(cx - 23 + i * 17, y + 106, 6, 5); }
    } else drawHydroponics(ctx, x, y, time);
    ctx.fillStyle = 'rgba(9,14,13,.85)'; ctx.fillRect(x + 7, y + 9, SLOT_WIDTH - 14, 23);
    ctx.save();
    ctx.strokeStyle = 'rgba(181,188,172,.5)'; ctx.lineWidth = 3;
    if (room.type === 'dormitory') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#333b39'; ctx.fillRect(cx + side * 76 - 27, y + 89, 54, 32);
        ctx.fillStyle = '#8a7867'; ctx.fillRect(cx + side * 76 - 24, y + 92, 48, 8);
      }
    } else if (room.type === 'arsenal') {
      for (const side of [-1, 1]) {
        const rack = cx + side * 84;
        ctx.fillStyle = '#252c2b'; ctx.fillRect(rack - 24, y + 56, 48, 65);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#8c857a'; ctx.fillRect(rack - 18 + i * 14, y + 64, 5, 46); ctx.fillRect(rack - 22 + i * 14, y + 77, 13, 4); }
      }
    } else if (room.type === 'medical') {
      for (const side of [-1, 1]) {
        const bed = cx + side * 83;
        ctx.fillStyle = '#9bb6ac'; ctx.fillRect(bed - 27, y + 102, 54, 12);
        ctx.fillStyle = '#e2d7bd'; ctx.fillRect(bed - 20, y + 99, 17, 5);
        ctx.fillStyle = '#4b5e5a'; ctx.fillRect(bed - 24, y + 114, 4, 10); ctx.fillRect(bed + 20, y + 114, 4, 10);
      }
    } else if (room.type === 'radio') {
      ctx.strokeStyle = '#a7b0a7';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * 78, y + 115); ctx.lineTo(cx + side * 78, y + 50); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + side * 78, y + 44, 13, -1.15, 1.15); ctx.stroke(); }
    } else if (room.type === 'office') {
      ctx.fillStyle = '#5a4b40'; ctx.fillRect(cx - 83, y + 111, 166, 13);
      ctx.fillStyle = '#1a2020'; ctx.fillRect(cx - 16, y + 83, 32, 26);
      ctx.strokeStyle = '#b9ac94'; ctx.strokeRect(cx - 17, y + 81, 34, 29);
    } else if (room.type === 'generator') {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#b08b54'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(cx + side * 80, y + 91, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#384340'; ctx.fillRect(cx + side * 80 - 13, y + 80, 26, 22);
      }
    }
    ctx.restore();
    ctx.fillStyle = SHELTER_TYPES[room.type].accent; ctx.font = '13px monospace';
    ctx.fillText(`${SHELTER_TYPES[room.type].name.toUpperCase()}  /  N${room.level}`, x + 14, y + 25);
  } else {
    const cx = x + SLOT_WIDTH / 2;
    ctx.fillStyle = '#11191a'; ctx.fillRect(cx - 37, y + 8, 74, ROOM_HEIGHT - 30);
    ctx.strokeStyle = '#a5a8a0'; ctx.strokeRect(cx - 38, y + 7, 76, ROOM_HEIGHT - 29);
    ctx.fillStyle = '#c39759'; ctx.fillRect(cx - 7, y + 38, 14, 5);
  }
  const palette = getRoomLightPalette(room.type);
  const light = ctx.createRadialGradient(x + SLOT_WIDTH / 2, y + 22, 4, x + SLOT_WIDTH / 2, y + 64, 165);
  light.addColorStop(0, palette.glow);
  light.addColorStop(.45, palette.halo); light.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = light; ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = palette.fixture; ctx.fillRect(x + SLOT_WIDTH / 2 - 23, y + 3, 46, 5);
}

function drawPresident(ctx, player, assets, time) {
  const sprite = assets.get('player_sprite');
  if (sprite) { ctx.drawImage(sprite, player.x - 22, player.y - 73, 44, 73); return; }
  const bob = Math.abs(player.vx) > 1 ? Math.sin(time / 90) * 2 : 0;
  ctx.save(); ctx.translate(player.x, player.y + bob); ctx.scale(player.facing, 1);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.ellipse(0, 2, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#171d1e'; ctx.fillRect(-13, -27, 10, 27); ctx.fillRect(3, -27, 10, 27);
  const coat = ctx.createLinearGradient(-21, -72, 18, -12);
  coat.addColorStop(0, '#69716e'); coat.addColorStop(.45, '#273b3d'); coat.addColorStop(1, '#101b1d');
  ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(-17, -60); ctx.lineTo(17, -60); ctx.lineTo(21, -20); ctx.lineTo(-18, -20); ctx.fill();
  ctx.fillStyle = '#a58c73'; ctx.fillRect(-8, -77, 17, 19);
  ctx.fillStyle = '#303333'; ctx.fillRect(-11, -80, 22, 8);
  ctx.fillStyle = '#c99b69'; ctx.fillRect(10, -70, 3, 4);
  ctx.restore();
}

function drawHint(ctx, player, text, camera) {
  if (!text) return;
  const sx = player.x + camera.offset_x;
  const sy = player.y + camera.offset_y - 103;
  ctx.font = 'bold 13px monospace';
  const width = Math.min(ctx.canvas.width - 20, ctx.measureText(text).width + 24);
  const x = Math.max(10, Math.min(ctx.canvas.width - width - 10, sx - width / 2));
  ctx.fillStyle = 'rgba(7,14,13,.94)'; ctx.fillRect(x, sy - 21, width, 29);
  ctx.strokeStyle = '#dfa85d'; ctx.strokeRect(x, sy - 21, width, 29);
  ctx.fillStyle = '#ffe0a6'; ctx.fillText(text, x + 12, sy - 2, width - 20);
}

export function renderRpgBunker(ctx, { grid, player, camera, assets, inhabitants = [], cabinFloor = player.floor,
  buildMode = false, buildType = 'dormitory', time = 0 }) {
  const { width, height } = ctx.canvas;
  ctx.save(); ctx.translate(camera.offset_x, camera.offset_y);
  ctx.fillStyle = assets.getDirtPattern?.(ctx) ?? generateDirtPattern(ctx, assets.get('earth_texture'));
  ctx.fillRect(-camera.offset_x, -camera.offset_y, width, height);
  const depth = ctx.createLinearGradient(0, WORLD_TOP - 130, 0, WORLD_TOP + MAX_FLOORS * FLOOR_SPACING);
  depth.addColorStop(0, 'rgba(105,70,37,.08)'); depth.addColorStop(1, 'rgba(2,8,9,.55)');
  ctx.fillStyle = depth; ctx.fillRect(-camera.offset_x, -camera.offset_y, width, height);
  drawGeology(ctx);
  drawElevatorShaft(ctx, grid, assets);
  for (const room of grid.flat()) if (room) drawRoom(ctx, room, assets, time);
  if (buildMode) {
    for (const slot of findBuildSlots(grid, buildType)) {
      const x = WORLD_LEFT + slot.column * SLOT_WIDTH;
      const y = WORLD_TOP + slot.floor * FLOOR_SPACING;
      ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = '#aade96';
      ctx.strokeRect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8); ctx.setLineDash([]);
    }
  }
  const movingCabin = player.liftTarget !== null;
  const cabinGroundY = getElevatorCabinGroundY(player, cabinFloor);
  drawElevatorCabin(ctx, cabinGroundY, time, false, movingCabin);
  renderInhabitants(ctx, inhabitants, grid, time);
  drawPresident(ctx, player, assets, time);
  drawElevatorCabin(ctx, cabinGroundY, time, true, movingCabin);
  ctx.restore();
  drawHint(ctx, player, getElevatorPrompt(player, grid) || findNearbyTrigger(player, grid)?.label, camera);
  const edge = ctx.createRadialGradient(width / 2, height / 2, height * .2, width / 2, height / 2, width * .8);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.3)');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height);
}

export function createRpgBunkerEngine(canvas, { grid = INITIAL_SHELTER_GRID, player: savedPlayer,
  inhabitants = [], cabinFloor: savedCabinFloor, onBuild, onRoom, onPlayerChanged, assetUrls = {} } = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const assets = new AssetManager(assetUrls);
  let player = normalizeRpgPlayer(savedPlayer, grid);
  let cabinFloor = Number.isInteger(savedCabinFloor) && getRoom(grid, savedCabinFloor, 0)?.type === 'elevator'
    ? savedCabinFloor : player.floor;
  let camera = { offset_x: canvas.width / 2 - player.x, offset_y: canvas.height / 2 - player.y };
  let buildMode = false;
  let buildType = 'dormitory';
  let paused = false;
  let destroyed = false;
  let frameId = null;
  let lastTime = 0;
  let lastSave = 0;
  const keys = new Set();

  function savePlayer() { onPlayerChanged?.({ ...player, vx: 0, vy: 0, liftTarget: null }); }
  function frame(time) {
    if (destroyed) return;
    const dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    if (!paused && !buildMode) {
      const previousFloor = player.floor;
      player = updatePlayer(player, { left: keys.has('a') || keys.has('arrowleft'), right: keys.has('d') || keys.has('arrowright'),
        up: keys.has('w') || keys.has('arrowup'), down: keys.has('s') || keys.has('arrowdown') }, grid, dt);
      if (player.liftTarget !== null || getRoom(grid, player.floor, playerColumn(player))?.type === 'elevator') cabinFloor = player.floor;
      if (player.floor !== previousFloor) cabinFloor = player.floor;
      if (player.floor !== previousFloor) savePlayer();
      if (Math.abs(player.vx) > 0 && time - lastSave > 700) { savePlayer(); lastSave = time; }
    }
    const targetX = canvas.width / 2 - player.x;
    const targetY = canvas.height / 2 - player.y;
    camera.offset_x += (targetX - camera.offset_x) * Math.min(1, dt * 8);
    camera.offset_y += (targetY - camera.offset_y) * Math.min(1, dt * 8);
    renderRpgBunker(ctx, { grid, player, camera, assets, inhabitants, cabinFloor, buildMode, buildType, time });
    frameId = requestAnimationFrame(frame);
  }

  function editable() {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  }
  function keydown(event) {
    if (paused || buildMode || editable()) return;
    const key = event.key.toLowerCase();
    if (!['a', 'd', 'w', 's', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) return;
    event.preventDefault();
    if (key === 'e' && !event.repeat) {
      const trigger = findNearbyTrigger(player, grid);
      if (trigger) { paused = true; keys.clear(); onRoom?.(trigger.room); }
    } else keys.add(key);
  }
  function keyup(event) { keys.delete(event.key.toLowerCase()); }
  function click(event) {
    if (!buildMode) return;
    const rect = canvas.getBoundingClientRect();
    const point = getCellAtPoint((event.clientX - rect.left) * canvas.width / rect.width,
      (event.clientY - rect.top) * canvas.height / rect.height, camera);
    if (point && findBuildSlots(grid, buildType).some((slot) => slot.floor === point.floor && slot.column === point.column)) {
      onBuild?.(buildType, point.floor, point.column);
    }
  }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('click', click);
  frameId = requestAnimationFrame(frame);
  return {
    getSnapshot: () => ({ player: { ...player }, camera: { ...camera }, cabinFloor }),
    setBuildMode(value) { buildMode = Boolean(value); keys.clear(); },
    setBuildType(value) { if (SHELTER_TYPES[value]) buildType = value; },
    pause() { paused = true; keys.clear(); },
    resume() { paused = false; },
    destroy() {
      destroyed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      canvas.removeEventListener('click', click);
    },
  };
}
