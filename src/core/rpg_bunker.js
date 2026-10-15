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
  // Seeded flecks keep the fallback stable from one render to the next.
  let seed = kind.length * 607;
  for (let i = 0; i < 420; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % size;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % size;
    ctx.fillStyle = i % 7 ? 'rgba(222,219,202,.07)' : 'rgba(74,31,13,.25)';
    ctx.fillRect(x, y, 1 + i % 3, 1 + i % 2);
  }
  if (kind === 'earth_texture') {
    for (let y = 11; y < size; y += 39) {
      ctx.strokeStyle = y % 2 ? 'rgba(141,104,66,.17)' : 'rgba(6,10,9,.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(32, y + 7, 77, y - 8, size, y + 4); ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const x = (i * 71) % size;
      const y = (i * 47) % size;
      ctx.fillStyle = i % 3 ? 'rgba(10,13,12,.6)' : 'rgba(146,99,58,.13)';
      ctx.beginPath(); ctx.ellipse(x, y, 5 + i % 7, 2 + i % 3, -.3, 0, Math.PI * 2); ctx.fill();
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
    for (const key of ['earth_texture', 'wall_texture', 'floor_texture', 'elevator_shaft', 'player_sprite']) {
      this.assets[key] = key === 'player_sprite' ? null : textureCanvas(key);
      if (urls[key] && typeof Image !== 'undefined') {
        const image = new Image();
        image.onload = () => { this.assets[key] = image; };
        image.onerror = () => { /* Keep the procedural texture. */ };
        image.src = urls[key];
      }
    }
  }

  get(key) { return this.assets[key]; }
}

function drawTiled(ctx, image, x, y, width, height) {
  for (let py = y; py < y + height; py += 128) {
    for (let px = x; px < x + width; px += 128) {
      ctx.drawImage(image, px, py, Math.min(128, x + width - px), Math.min(128, y + height - py));
    }
  }
}

function drawRoom(ctx, room, assets, time) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  const wall = assets.get(room.type === 'elevator' ? 'elevator_shaft' : 'wall_texture');
  drawTiled(ctx, wall, x, y, SLOT_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = 'rgba(12,16,15,.34)'; ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
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
    ctx.fillStyle = '#172324'; ctx.fillRect(cx - 44, y + 66, 88, 56);
    const panel = ctx.createLinearGradient(cx - 44, y + 66, cx + 44, y + 122);
    panel.addColorStop(0, '#576464'); panel.addColorStop(1, '#222c2b');
    ctx.fillStyle = panel; ctx.fillRect(cx - 39, y + 69, 78, 50);
    ctx.fillStyle = room.type === 'medical' ? '#9ed5c8' : room.type === 'radio' ? '#84acbd' : room.type === 'greenhouse' ? '#8dae71' : room.type === 'arsenal' ? '#bd8767' : room.type === 'office' ? '#a996b9' : '#e3ad69';
    ctx.fillRect(cx - 28, y + 78, 56, 19);
    ctx.fillStyle = '#121819'; ctx.fillRect(cx - 23, y + 82, 46, 11);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? '#e5b66d' : '#78b9a4'; ctx.fillRect(cx - 23 + i * 17, y + 106, 6, 5); }
    ctx.fillStyle = 'rgba(9,14,13,.85)'; ctx.fillRect(x + 7, y + 9, SLOT_WIDTH - 14, 23);
    ctx.save();
    ctx.strokeStyle = 'rgba(181,188,172,.5)'; ctx.lineWidth = 3;
    if (room.type === 'dormitory') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#333b39'; ctx.fillRect(cx + side * 76 - 27, y + 89, 54, 32);
        ctx.fillStyle = '#8a7867'; ctx.fillRect(cx + side * 76 - 24, y + 92, 48, 8);
      }
    } else if (room.type === 'greenhouse') {
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#516052'; ctx.fillRect(cx + side * 82 - 24, y + 106, 48, 14);
        ctx.strokeStyle = '#95ac7d';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + side * 82 + i * 12, y + 107); ctx.quadraticCurveTo(cx + side * 82 + i * 13 - 7, y + 74, cx + side * 82 + i * 12 + 4, y + 68); ctx.stroke(); }
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
  const light = ctx.createRadialGradient(x + SLOT_WIDTH / 2, y + 22, 4, x + SLOT_WIDTH / 2, y + 64, 160);
  light.addColorStop(0, `rgba(255,223,156,${.33 + Math.sin(time / 1400 + room.column) * .025})`);
  light.addColorStop(.45, 'rgba(243,185,101,.09)'); light.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = light; ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
  ctx.fillStyle = '#ffe2a5'; ctx.fillRect(x + SLOT_WIDTH / 2 - 23, y + 3, 46, 5);
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

export function renderRpgBunker(ctx, { grid, player, camera, assets, buildMode = false, buildType = 'dormitory', time = 0 }) {
  const { width, height } = ctx.canvas;
  drawTiled(ctx, assets.get('earth_texture'), 0, 0, width, height);
  const depth = ctx.createLinearGradient(0, 0, 0, height);
  depth.addColorStop(0, 'rgba(0,0,0,.12)'); depth.addColorStop(1, 'rgba(0,0,0,.48)');
  ctx.fillStyle = depth; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.translate(camera.offset_x, camera.offset_y);
  for (const room of grid.flat()) if (room) drawRoom(ctx, room, assets, time);
  if (buildMode) {
    for (const slot of findBuildSlots(grid, buildType)) {
      const x = WORLD_LEFT + slot.column * SLOT_WIDTH;
      const y = WORLD_TOP + slot.floor * FLOOR_SPACING;
      ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = '#aade96';
      ctx.strokeRect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8); ctx.setLineDash([]);
    }
  }
  drawPresident(ctx, player, assets, time);
  ctx.restore();
  drawHint(ctx, player, getElevatorPrompt(player, grid) || findNearbyTrigger(player, grid)?.label, camera);
  const edge = ctx.createRadialGradient(width / 2, height / 2, height * .2, width / 2, height / 2, width * .8);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.3)');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height);
}

export function createRpgBunkerEngine(canvas, { grid = INITIAL_SHELTER_GRID, player: savedPlayer,
  onBuild, onRoom, onPlayerChanged, assetUrls = {} } = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const assets = new AssetManager(assetUrls);
  let player = normalizeRpgPlayer(savedPlayer, grid);
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
      if (player.floor !== previousFloor) savePlayer();
      if (Math.abs(player.vx) > 0 && time - lastSave > 700) { savePlayer(); lastSave = time; }
    }
    const targetX = canvas.width / 2 - player.x;
    const targetY = canvas.height / 2 - player.y;
    camera.offset_x += (targetX - camera.offset_x) * Math.min(1, dt * 8);
    camera.offset_y += (targetY - camera.offset_y) * Math.min(1, dt * 8);
    renderRpgBunker(ctx, { grid, player, camera, assets, buildMode, buildType, time });
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
    getSnapshot: () => ({ player: { ...player }, camera: { ...camera } }),
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
