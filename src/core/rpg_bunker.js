import {
  cellCenter, findBuildSlots, getCellAtPoint, getRoom, INITIAL_SHELTER_GRID,
  MAX_COLUMNS, MAX_FLOORS, ROOM_HEIGHT, SHELTER_TYPES, SLOT_WIDTH,
  FLOOR_SPACING, WORLD_LEFT, WORLD_TOP,
} from './shelter_engine.js';

const WALK_SPEED = 170;
const LIFT_SPEED = 280;
const PLAYER_RADIUS = 14;
const TRIGGER_RADIUS = 70;
const SURFACE_Y = WORLD_TOP - 30;
const TERRAIN_CHUNK_SIZE = 256;
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

function lattice(x, y) {
  let seed = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((seed ^ (seed >>> 16)) >>> 0) / 0xffffffff;
}

function smoothNoise(x, y, scale) {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const tx = (sx - ix) ** 2 * (3 - 2 * (sx - ix));
  const ty = (sy - iy) ** 2 * (3 - 2 * (sy - iy));
  const upper = lattice(ix, iy) * (1 - tx) + lattice(ix + 1, iy) * tx;
  const lower = lattice(ix, iy + 1) * (1 - tx) + lattice(ix + 1, iy + 1) * tx;
  return upper * (1 - ty) + lower * ty;
}

export function terrainColorAt(x, y) {
  const depth = Math.max(0, y - SURFACE_Y);
  const strata = smoothNoise(x, y, 175) * .47 + smoothNoise(x + 291, y, 61) * .33 + smoothNoise(x, y + 117, 19) * .2;
  const rock = smoothNoise(x - 1157, y + 73, 74);
  const cave = depth > 130 && smoothNoise(x + 427, y - 377, 115) > .79;
  const radiation = depth > 300 && smoothNoise(x - 882, y + 131, 89) > .83;
  if (cave) return [11 + rock * 10, 15 + rock * 12, 15 + rock * 9].map(Math.round);
  if (radiation) return [24 + strata * 15, 47 + rock * 27, 26 + strata * 12].map(Math.round);
  const shade = (strata - .5) * 41 - Math.min(17, depth / 72);
  return [58 + shade + rock * 8, 48 + shade + rock * 7, 36 + shade + rock * 8].map((channel) => Math.max(0, Math.round(channel)));
}

export function generateTerrainChunk(chunkX, chunkY, canvasFactory = () => document.createElement('canvas'), size = TERRAIN_CHUNK_SIZE) {
  const canvas = canvasFactory();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const color = terrainColorAt(chunkX * size + x, chunkY * size + y);
      image.data[offset] = color[0]; image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2]; image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (size < 128) return canvas;
  for (let i = 0; i < 12; i++) {
    const seed = lattice(chunkX * 31 + i * 17, chunkY * 43 - i * 23);
    const x = 17 + seed * (size - 34);
    const y = 17 + lattice(chunkX * 19 - i * 13, chunkY * 29 + i * 7) * (size - 34);
    const radius = 4 + lattice(i + chunkX * 7, chunkY * 11) * 11;
    ctx.fillStyle = i % 4 ? 'rgba(99,91,75,.64)' : 'rgba(10,17,16,.83)';
    ctx.beginPath(); ctx.moveTo(x - radius, y + radius * .17);
    ctx.lineTo(x - radius * .38, y - radius * .9); ctx.lineTo(x + radius * .68, y - radius * .55);
    ctx.lineTo(x + radius, y + radius * .35); ctx.lineTo(x + radius * .15, y + radius * .73);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(178,152,113,.22)'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (chunkY > 0 && lattice(chunkX * 11, chunkY * 31) > .75) {
    const glow = ctx.createRadialGradient(size * .48, size * .6, 3, size * .48, size * .6, size * .44);
    glow.addColorStop(0, 'rgba(120,236,84,.42)'); glow.addColorStop(1, 'rgba(120,236,84,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(162,228,124,.62)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(size * .25, size * .74);
    ctx.quadraticCurveTo(size * .45, size * .41, size * .77, size * .58); ctx.stroke();
  } else if (chunkY > 0 && lattice(chunkX * 23, chunkY * 13) > .83) {
    ctx.strokeStyle = 'rgba(183,170,137,.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(size * .55, size * .52, 24, .15, Math.PI * 1.5); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(size * .55 + i * 5, size * .53);
      ctx.lineTo(size * .55 + i * 5 + 7, size * .66); ctx.stroke();
    }
  }
  return canvas;
}

export class TerrainChunkCache {
  constructor(generate = generateTerrainChunk) {
    this.generate = generate;
    this.chunks = new Map();
    this.budget = 0;
  }

  beginFrame() { this.budget = 1; }

  get(x, y) {
    const key = `${x}:${y}`;
    if (this.chunks.has(key)) {
      const chunk = this.chunks.get(key);
      this.chunks.delete(key); this.chunks.set(key, chunk);
      return chunk;
    }
    if (this.budget === 0) return null;
    this.budget--;
    const chunk = this.generate(x, y);
    if (this.chunks.size >= 96) this.chunks.delete(this.chunks.keys().next().value);
    this.chunks.set(key, chunk);
    return chunk;
  }
}

export function getParallaxLayers(camera) {
  return { farX: camera.offset_x * .18, nearX: camera.offset_x * .56,
    farY: camera.offset_y * .2, nearY: camera.offset_y * .55 };
}

export function getRuinProfile(index, layer) {
  return { x: index * 87 + (lattice(index * 17, layer + 9) - .5) * 24,
    width: 52 + Math.floor(lattice(index * 29, layer + 37) * 50),
    height: (layer ? 45 : 71) + Math.floor(lattice(index * 53, layer + 71) * 51),
    fracture: lattice(index * 31, layer + 13) };
}

export function renderWastelandSurface(ctx, camera, viewport, time = 0) {
  const ground = SURFACE_Y + camera.offset_y;
  if (ground <= 0) return;
  const visible = Math.min(viewport.height, ground);
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#1c1d23'); sky.addColorStop(.52, '#593629'); sky.addColorStop(1, '#b16437');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, viewport.width, visible);
  const layers = getParallaxLayers(camera);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, viewport.width, visible); ctx.clip();
  for (let i = -2; i < 12; i++) {
    const x = i * 185 + (layers.farX % 185) + Math.sin(time / 9000 + i) * 5;
    const y = ground - 110 + layers.farY * .12 + i % 3 * 11;
    const ash = ctx.createRadialGradient(x, y, 5, x, y, 104);
    ash.addColorStop(0, 'rgba(28,25,27,.53)'); ash.addColorStop(1, 'rgba(28,25,27,0)');
    ctx.fillStyle = ash; ctx.beginPath(); ctx.ellipse(x, y, 115, 35, -.12, 0, Math.PI * 2); ctx.fill();
  }
  for (const [layer, factor, tone] of [[0, layers.farX, 'rgba(26,28,29,.52)'], [1, layers.nearX, '#272322']]) {
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = '#170f0d'; ctx.fillStyle = tone;
    for (let i = -4; i < 28; i++) {
      const profile = getRuinProfile(i, layer);
      const x = profile.x + factor;
      const roof = ground - profile.height;
      const width = profile.width;
      ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x + 2, roof + 15);
      ctx.lineTo(x + width * .18, roof + 7); ctx.lineTo(x + width * .26, roof + 25 * profile.fracture);
      ctx.lineTo(x + width * .39, roof); ctx.lineTo(x + width * .52, roof + 18);
      ctx.lineTo(x + width * .7, roof + 5 + 16 * profile.fracture);
      ctx.lineTo(x + width * .82, roof + 18); ctx.lineTo(x + width, ground);
      ctx.closePath(); ctx.fill();
      if (layer && i % 3 === 0) {
        ctx.strokeStyle = '#6b4634'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + width * .39, roof);
        ctx.lineTo(x + width * .39, roof - 13 - profile.fracture * 18); ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

const CHARACTER_COLORS = Object.freeze({
  president: '#354e50', resident: '#81705b', engineer: '#9d7247',
  scientist: '#b9beb7', medic: '#8faea5', guard: '#64776d',
});
const CHARACTER_ROWS = Object.freeze({ president: 0, resident: 1, engineer: 2, scientist: 3, medic: 4, guard: 5 });

function drawLimb(ctx, x, y, angle, length, color, bent = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(bent ? 8 : -2, length * .52, bent ? 11 : 1, length);
  ctx.stroke();
  ctx.fillStyle = '#2b302e'; ctx.beginPath(); ctx.ellipse(bent ? 11 : 2, length + 3, 9, 4, -.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawCharacter(ctx, actor, time = 0, sheet = null) {
  const role = actor.role ?? 'resident';
  const walking = Math.abs(actor.vx ?? 0) > 1;
  const working = actor.pose === 'working';
  const seated = actor.pose === 'seated';
  const phase = time / (walking ? 115 : working ? 215 : 690);
  const swing = Math.sin(phase) * (walking ? .65 : working ? .28 : .06);
  const bob = walking ? Math.abs(Math.sin(phase)) * 2 : Math.sin(time / 560) * 1.1;
  ctx.save(); ctx.translate(actor.x, actor.y + bob + (seated ? 10 : 0));
  ctx.scale(actor.facing === -1 ? -1 : 1, 1);
  if (sheet?.width >= 64 && sheet?.height >= 96) {
    const columns = Math.floor(sheet.width / 64);
    const rows = Math.floor(sheet.height / 96);
    const row = Math.min(CHARACTER_ROWS[role] ?? 1, rows - 1);
    const frame = Math.floor(time / (walking ? 110 : working ? 190 : 760)) % Math.min(columns, walking ? 6 : 2);
    ctx.drawImage(sheet, frame * 64, row * 96, 64, 96, -32, -95, 64, 96);
    ctx.restore(); return;
  }
  const coat = CHARACTER_COLORS[role] ?? CHARACTER_COLORS.resident;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
  drawLimb(ctx, -6, -31, swing, seated ? 17 : 30, '#303938', seated);
  drawLimb(ctx, 6, -31, -swing, seated ? 17 : 30, '#263231', seated);
  drawLimb(ctx, -12, -60, -swing * .7 - .08, 25, coat, working);
  const fabric = ctx.createLinearGradient(-15, -67, 17, -24);
  fabric.addColorStop(0, role === 'scientist' ? '#e0e5db' : '#b1aa91');
  fabric.addColorStop(.4, coat); fabric.addColorStop(1, '#1b2828');
  ctx.fillStyle = fabric;
  ctx.beginPath(); ctx.moveTo(-10, -65);
  ctx.bezierCurveTo(-20, -60, -15, -45, -13, -31);
  ctx.quadraticCurveTo(0, -26, 14, -31);
  ctx.bezierCurveTo(17, -46, 18, -60, 8, -65); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(226,213,175,.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-5, -62); ctx.quadraticCurveTo(-1, -42, 4, -32); ctx.stroke();
  drawLimb(ctx, 12, -60, swing * .8 + (working ? -.43 : .08), 25, coat, working);
  ctx.fillStyle = '#b59a7d'; ctx.beginPath(); ctx.ellipse(0, -77, 10, 12, -.06, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = role === 'engineer' ? '#9a784b' : role === 'guard' ? '#4f6259' : '#303a39';
  ctx.beginPath(); ctx.moveTo(-11, -81);
  ctx.quadraticCurveTo(-8, -95, 2, -91); ctx.quadraticCurveTo(13, -91, 11, -81);
  ctx.quadraticCurveTo(1, -84, -11, -81); ctx.fill();
  ctx.fillStyle = '#1a2827'; ctx.beginPath(); ctx.arc(5, -78, 1.2, 0, Math.PI * 2); ctx.fill();
  if (['scientist', 'medic'].includes(role)) {
    ctx.strokeStyle = '#d9dcd0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -58); ctx.quadraticCurveTo(-13, -42, -13, -27);
    ctx.moveTo(10, -58); ctx.quadraticCurveTo(13, -42, 13, -27); ctx.stroke();
  }
  ctx.restore();
}

export function renderInhabitants(ctx, inhabitants, grid, time = 0, sheet = null) {
  for (let index = 0; index < (inhabitants?.length ?? 0); index++) {
    const npc = inhabitants[index];
    if (!getRoom(grid, npc.floor, npc.column) || getRoom(grid, npc.floor, npc.column).type === 'elevator') continue;
    const center = cellCenter(npc.floor, npc.column);
    drawCharacter(ctx, { ...npc, x: center.x + (npc.offsetX ?? 0), y: center.y, vx: 0 }, time + index * 270, sheet);
  }
}

function textureCanvas(kind, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, size, size);
  const colors = kind === 'wall_texture' ? ['#464543', '#242927', '#5b554c']
    : kind === 'elevator_shaft' ? ['#333c3d', '#1b2223', '#505457']
      : ['#62615b', '#343b3b', '#58524a'];
  colors.forEach((color, index) => base.addColorStop(index / (colors.length - 1), color));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Seeded details prevent shimmering as the camera moves.
  let seed = kind.length * 607;
  for (let i = 0; i < 420; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % size;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % size;
    ctx.fillStyle = i % 7 ? 'rgba(222,219,202,.07)' : 'rgba(74,31,13,.25)';
    ctx.fillRect(x, y, 1 + i % 4, 1 + i % 3);
  }
  if (kind === 'floor_texture') {
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
    this.terrainChunks = new TerrainChunkCache();
    for (const key of ['wall_texture', 'floor_texture', 'elevator_shaft', 'player_sprite', 'character_sheet']) {
      this.assets[key] = ['player_sprite', 'character_sheet'].includes(key) ? null : textureCanvas(key);
      if (urls[key] && typeof Image !== 'undefined') {
        const image = new Image();
        image.onload = () => { this.assets[key] = image; };
        image.onerror = () => { /* Keep the procedural texture. */ };
        image.src = urls[key];
      }
    }
  }

  get(key) { return this.assets[key]; }

  beginTerrainFrame() { this.terrainChunks.beginFrame(); }
  getTerrainChunk(x, y) { return this.terrainChunks.get(x, y); }
}

function drawTiled(ctx, image, x, y, width, height) {
  for (let py = y; py < y + height; py += 128) {
    for (let px = x; px < x + width; px += 128) {
      ctx.drawImage(image, px, py, Math.min(128, x + width - px), Math.min(128, y + height - py));
    }
  }
}

function renderTerrain(ctx, camera, viewport, assets) {
  const xMin = -camera.offset_x;
  const yMin = Math.max(SURFACE_Y, -camera.offset_y);
  const yMax = -camera.offset_y + viewport.height;
  if (yMax <= yMin) return;
  ctx.save(); ctx.beginPath(); ctx.rect(xMin, yMin, viewport.width, yMax - yMin); ctx.clip();
  const xStart = Math.floor(xMin / TERRAIN_CHUNK_SIZE);
  const xEnd = Math.floor((xMin + viewport.width) / TERRAIN_CHUNK_SIZE);
  const yStart = Math.floor(yMin / TERRAIN_CHUNK_SIZE);
  const yEnd = Math.floor(yMax / TERRAIN_CHUNK_SIZE);
  const visible = [];
  const centerX = (xMin + viewport.width / 2) / TERRAIN_CHUNK_SIZE;
  const centerY = (yMin + (yMax - yMin) / 2) / TERRAIN_CHUNK_SIZE;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) visible.push({ x, y, distance: (x - centerX) ** 2 + (y - centerY) ** 2 });
  }
  visible.sort((a, b) => a.distance - b.distance);
  for (const { x, y } of visible) {
    const px = x * TERRAIN_CHUNK_SIZE;
    const py = y * TERRAIN_CHUNK_SIZE;
    const chunk = assets.getTerrainChunk(x, y);
    if (chunk) ctx.drawImage(chunk, px, py);
    else {
      const top = terrainColorAt(px + 128, py + 20);
      const bottom = terrainColorAt(px + 128, py + 236);
      const fill = ctx.createLinearGradient(px, py, px, py + TERRAIN_CHUNK_SIZE);
      fill.addColorStop(0, `rgb(${top.join(',')})`);
      fill.addColorStop(1, `rgb(${bottom.join(',')})`);
      ctx.fillStyle = fill; ctx.fillRect(px, py, TERRAIN_CHUNK_SIZE, TERRAIN_CHUNK_SIZE);
    }
  }
  ctx.restore();
}

function drawSurfaceForeground(ctx, time) {
  ctx.fillStyle = '#1d1c18'; ctx.fillRect(-450, SURFACE_Y - 4, 2800, 8);
  ctx.strokeStyle = '#98704c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-450, SURFACE_Y - 5);
  for (let x = -450; x <= 2350; x += 30) ctx.lineTo(x, SURFACE_Y - 5 - (lattice(x, 7) - .5) * 8);
  ctx.stroke();
  for (let i = 0; i < 28; i++) {
    const x = -350 + i * 93 + lattice(i, 8) * 34;
    ctx.fillStyle = i % 3 ? '#635443' : '#2e302b';
    ctx.beginPath(); ctx.ellipse(x, SURFACE_Y - 6, 5 + i % 6, 2 + i % 3, .2, 0, Math.PI * 2); ctx.fill();
  }
  for (const x of [95, 870, 1620]) {
    ctx.strokeStyle = '#1d1b18'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x, SURFACE_Y); ctx.bezierCurveTo(x - 13, SURFACE_Y - 34, x + 18, SURFACE_Y - 70, x - 6, SURFACE_Y - 91); ctx.stroke();
    ctx.lineWidth = 4;
    for (const branch of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + 4, SURFACE_Y - 48);
      ctx.quadraticCurveTo(x + branch * 35, SURFACE_Y - 66, x + branch * 47, SURFACE_Y - 86); ctx.stroke();
    }
  }
  const carX = 675;
  ctx.fillStyle = '#1c2020'; ctx.beginPath(); ctx.ellipse(carX, SURFACE_Y - 4, 68, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b4233'; ctx.beginPath(); ctx.moveTo(carX - 62, SURFACE_Y - 12);
  ctx.lineTo(carX - 43, SURFACE_Y - 32); ctx.lineTo(carX + 8, SURFACE_Y - 29);
  ctx.lineTo(carX + 29, SURFACE_Y - 13); ctx.lineTo(carX + 61, SURFACE_Y - 8);
  ctx.lineTo(carX + 47, SURFACE_Y); ctx.lineTo(carX - 54, SURFACE_Y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a17554'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#172020'; ctx.fillRect(carX - 34, SURFACE_Y - 28, 27, 15);
  for (const wheel of [-38, 39]) { ctx.beginPath(); ctx.arc(carX + wheel, SURFACE_Y - 2, 8, 0, Math.PI * 2); ctx.fill(); }
  const craterX = 1260;
  ctx.fillStyle = '#121819'; ctx.beginPath(); ctx.ellipse(craterX, SURFACE_Y, 87, 14, 0, Math.PI, Math.PI * 2); ctx.fill();
  const smoke = ctx.createRadialGradient(craterX, SURFACE_Y - 15, 2, craterX, SURFACE_Y - 32, 65);
  smoke.addColorStop(0, 'rgba(91,116,66,.2)'); smoke.addColorStop(1, 'rgba(67,61,46,0)');
  ctx.fillStyle = smoke; ctx.beginPath(); ctx.ellipse(craterX + Math.sin(time / 2800) * 5, SURFACE_Y - 36, 58, 43, 0, 0, Math.PI * 2); ctx.fill();
}

function drawVaultHatch(ctx) {
  const cx = cellCenter(0, 1).x;
  const cy = SURFACE_Y - 26;
  ctx.fillStyle = '#252b2b'; ctx.fillRect(cx - 36, SURFACE_Y - 10, 72, WORLD_TOP - SURFACE_Y + 10);
  ctx.fillStyle = '#191d1d'; ctx.beginPath(); ctx.arc(cx, cy, 41, 0, Math.PI * 2); ctx.fill();
  const steel = ctx.createRadialGradient(cx - 11, cy - 14, 5, cx, cy, 42);
  steel.addColorStop(0, '#7a8076'); steel.addColorStop(.64, '#424e4a'); steel.addColorStop(1, '#171c1d');
  ctx.fillStyle = steel; ctx.beginPath(); ctx.arc(cx, cy, 35, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d4ad70'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 29, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#182021'; ctx.lineWidth = 7;
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = spoke * Math.PI / 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9);
    ctx.lineTo(cx + Math.cos(angle) * 26, cy + Math.sin(angle) * 26); ctx.stroke();
  }
  ctx.fillStyle = '#acb3a8'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
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

export function drawElevatorCabin(ctx, groundY, time, front = false, moving = false) {
  const cx = WORLD_LEFT + SLOT_WIDTH / 2;
  const top = groundY - ROOM_HEIGHT + 24;
  if (front) {
    const doorWidth = moving ? 53 : 32;
    for (const side of [-1, 1]) {
      const dx = side < 0 ? cx - 57 : cx + 57 - doorWidth;
      const gateTop = top + 13;
      const gateBottom = top + ROOM_HEIGHT - 37;
      ctx.strokeStyle = '#a3aaa0'; ctx.lineWidth = 3;
      ctx.strokeRect(dx, gateTop, doorWidth, gateBottom - gateTop);
      ctx.strokeStyle = '#53615d'; ctx.lineWidth = 3;
      for (let row = 0; row < 5; row++) {
        const y = gateTop + row * (gateBottom - gateTop) / 5;
        const next = gateTop + (row + 1) * (gateBottom - gateTop) / 5;
        ctx.beginPath(); ctx.moveTo(dx + 3, y); ctx.lineTo(dx + doorWidth - 3, next);
        ctx.moveTo(dx + doorWidth - 3, y); ctx.lineTo(dx + 3, next); ctx.stroke();
        ctx.fillStyle = '#c7c6b0'; ctx.beginPath(); ctx.arc(dx + doorWidth / 2, (y + next) / 2, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - 64, top + 6, 128, ROOM_HEIGHT - 31);
  const interior = ctx.createLinearGradient(cx - 55, top, cx + 55, top + ROOM_HEIGHT);
  interior.addColorStop(0, '#68706c'); interior.addColorStop(.4, '#273330'); interior.addColorStop(1, '#101c1d');
  ctx.fillStyle = interior; ctx.fillRect(cx - 55, top + 9, 110, ROOM_HEIGHT - 42);
  ctx.fillStyle = '#171d1d'; ctx.fillRect(cx - 63, top, 126, 10);
  ctx.fillRect(cx - 63, top + ROOM_HEIGHT - 34, 126, 12);
  for (let line = 0; line < 7; line++) {
    ctx.strokeStyle = line % 2 ? '#596563' : '#a5a99b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 56 + line * 18, top + ROOM_HEIGHT - 33);
    ctx.lineTo(cx - 44 + line * 18, top + ROOM_HEIGHT - 22); ctx.stroke();
  }
  ctx.fillStyle = '#c7a164'; ctx.fillRect(cx - 20, top + 7, 40, 5);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lamp = ctx.createRadialGradient(cx, top + 22, 2, cx, top + 48, 75);
  lamp.addColorStop(0, 'rgba(247,193,110,.27)'); lamp.addColorStop(1, 'rgba(247,193,110,0)');
  ctx.fillStyle = lamp; ctx.fillRect(cx - 60, top + 8, 120, ROOM_HEIGHT - 46); ctx.restore();
  for (let speck = 0; speck < 7; speck++) {
    const dustY = top + 18 + ((time / 85 + speck * 19) % (ROOM_HEIGHT - 61));
    ctx.fillStyle = 'rgba(225,205,164,.34)'; ctx.beginPath();
    ctx.arc(cx - 40 + (speck * 29) % 81, dustY, .8 + speck % 2, 0, Math.PI * 2); ctx.fill();
  }
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

export function drawWaterDrips(ctx, x, y, time) {
  ctx.fillStyle = '#38636b'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const travel = ((time / 750 + i / 3) % 1) * 57;
    ctx.fillStyle = `rgba(127,198,205,${.65 - travel / 140})`;
    ctx.beginPath(); ctx.arc(x + i * 1.3, y + travel, 1.5 + travel / 55, 0, Math.PI * 2); ctx.fill();
  }
}

function drawCableSparks(ctx, x, y, time) {
  const pulse = Math.sin(time / 310 + x * .04);
  if (pulse < .45) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 22);
  glow.addColorStop(0, 'rgba(255,198,106,.55)'); glow.addColorStop(1, 'rgba(255,198,106,0)');
  ctx.fillStyle = glow; ctx.fillRect(x - 23, y - 23, 46, 46);
  ctx.strokeStyle = '#f5c86d'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const angle = i * 2.4 + time / 550;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * (6 + i * 2), y + Math.sin(angle) * (6 + i * 2)); ctx.stroke();
  }
  ctx.restore();
}

function drawRoomClutter(ctx, room, x, y, time) {
  for (const side of [-1, 1]) {
    const corner = side < 0 ? x + 8 : x + SLOT_WIDTH - 8;
    const mold = ctx.createRadialGradient(corner, y + ROOM_HEIGHT - 13, 2, corner, y + ROOM_HEIGHT - 13, 52);
    mold.addColorStop(0, 'rgba(10,24,20,.58)'); mold.addColorStop(1, 'rgba(10,24,20,0)');
    ctx.fillStyle = mold; ctx.fillRect(corner - 52, y + ROOM_HEIGHT - 65, 104, 65);
    for (let speck = 0; speck < 5; speck++) {
      const px = corner - side * (7 + speck * 8);
      ctx.fillStyle = speck % 2 ? '#5f584b' : '#222e2c';
      ctx.beginPath(); ctx.ellipse(px, y + ROOM_HEIGHT - 23 - speck % 3, 3 + speck % 3, 2, -.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (room.type !== 'greenhouse' && room.type !== 'medical') drawWaterDrips(ctx, x + 69, y + 54, time);
  ctx.strokeStyle = '#141c1d'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x + SLOT_WIDTH - 35, y + 105);
  ctx.bezierCurveTo(x + SLOT_WIDTH - 68, y + 138, x + SLOT_WIDTH - 49, y + 116, x + SLOT_WIDTH - 74, y + 128); ctx.stroke();
  drawCableSparks(ctx, x + SLOT_WIDTH - 74, y + 128, time);
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
  drawRoomClutter(ctx, room, x, y, time);
}

export function drawHydroponics(ctx, x, y, time) {
  for (const lampX of [x + 73, x + 191]) {
    const uv = ctx.createRadialGradient(lampX, y + 25, 3, lampX, y + 44, 80);
    uv.addColorStop(0, 'rgba(255,170,255,.42)');
    uv.addColorStop(1, 'rgba(178,91,208,0)');
    ctx.fillStyle = uv; ctx.fillRect(lampX - 80, y + 7, 160, 109);
    ctx.fillStyle = '#32333c'; ctx.fillRect(lampX - 22, y + 9, 44, 7);
    ctx.fillStyle = '#f0b5f2'; ctx.fillRect(lampX - 17, y + 15, 34, 3);
  }
  ctx.strokeStyle = '#90a4a0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 27, y + 35); ctx.lineTo(x + SLOT_WIDTH - 27, y + 35); ctx.stroke();
  for (const nozzle of [x + 72, x + 133, x + 194]) {
    ctx.fillStyle = '#a3b9b3'; ctx.beginPath(); ctx.arc(nozzle, y + 37, 3, 0, Math.PI * 2); ctx.fill();
    const drop = (time / 620 + nozzle / 70) % 1;
    ctx.fillStyle = 'rgba(139,208,229,.65)'; ctx.beginPath();
    ctx.ellipse(nozzle, y + 40 + drop * 20, 1.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const [row, level] of [48, 76, 104].entries()) {
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
      ctx.fillStyle = '#5a4334'; ctx.beginPath(); ctx.moveTo(px - 8, y + level + 7);
      ctx.lineTo(px + 8, y + level + 7); ctx.lineTo(px + 5, y + level + 13);
      ctx.lineTo(px - 5, y + level + 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#362e25'; ctx.beginPath(); ctx.ellipse(px, y + level + 8, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b9e69'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, y + level + 12);
      ctx.quadraticCurveTo(px + sway, y + level - 8, px + sway + 2, y + level - 20); ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = side < 0 ? '#557e5e' : '#8ab58a';
        ctx.beginPath();
        ctx.moveTo(px + sway, y + level - 12);
        ctx.quadraticCurveTo(px + sway + side * 13, y + level - 23, px + sway + side * 15, y + level - 12);
        ctx.quadraticCurveTo(px + sway + side * 9, y + level - 7, px + sway, y + level - 12); ctx.fill();
      }
      ctx.fillStyle = '#bdd0a0'; ctx.beginPath();
      ctx.ellipse(px + sway + 2, y + level - 21, 4, 7, .15, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#172a2c'; ctx.fillRect(x + 21, y + 53, 10, 76);
  ctx.fillRect(x + SLOT_WIDTH - 30, y + 53, 10, 76);
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
  const sheet = assets.get('character_sheet');
  if (!sheet && assets.get('player_sprite')) {
    ctx.drawImage(assets.get('player_sprite'), player.x - 22, player.y - 73, 44, 73);
    return;
  }
  drawCharacter(ctx, { ...player, role: 'president' }, time, sheet);
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
  ctx.fillStyle = '#211b19'; ctx.fillRect(0, 0, width, height);
  renderWastelandSurface(ctx, camera, { width, height }, time);
  ctx.save(); ctx.translate(camera.offset_x, camera.offset_y);
  assets.beginTerrainFrame?.();
  renderTerrain(ctx, camera, { width, height }, assets);
  drawSurfaceForeground(ctx, time);
  drawElevatorShaft(ctx, grid, assets);
  for (const room of grid.flat()) if (room) drawRoom(ctx, room, assets, time);
  drawVaultHatch(ctx);
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
  renderInhabitants(ctx, inhabitants, grid, time, assets.get('character_sheet'));
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
