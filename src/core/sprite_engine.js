import { cellCenter, FLOOR_SPACING, ROOM_HEIGHT, SLOT_WIDTH, WORLD_LEFT, WORLD_TOP } from './shelter_engine.js';
import { renderLootboxOverlay } from './lootbox_renderer.js';
import { getPresidentClass, getSkin } from './player_state.js';
import { hasReliableNightPower } from './environment.js';
import { getCriticalNeeds, NEED_CRITICAL_THRESHOLD, NEED_ICONS, NEED_KEYS, NEED_LABELS, normalizeNeeds } from './needs.js';

const SURFACE_Y = WORLD_TOP - 30;
const ATLAS_CELLS = Object.freeze({
  vault: [0, 0], elevator: [1, 0], dormitory: [2, 0],
  generator: [0, 1], greenhouse: [1, 1], arsenal: [2, 1],
  medical: [0, 2], radio: [1, 2], office: [2, 2], presidential_suite: [2, 2],
});
const ROOM_AMBIENT_LIGHTS = Object.freeze({
  medical: Object.freeze(['rgba(200, 240, 255, .3)', 'rgba(200, 240, 255, .12)']),
  laboratory: Object.freeze(['rgba(100, 255, 100, .2)', 'rgba(100, 255, 100, .08)']),
  life_support: Object.freeze(['rgba(150, 225, 255, .2)', 'rgba(100, 190, 225, .08)']),
});
const NPC_ROWS = Object.freeze({ resident: 0, engineer: 0, scientist: 1, medic: 2, guard: 3 });
const frameBoundsCache = new WeakMap();
const ROOM_CEILING_THICKNESS = 12;
const ELEVATOR_CABIN_HEIGHT = 129;
const ELEVATOR_ART_FLOOR_INSET = 19;
const ELEVATOR_SPRITE_FOOT_OFFSET = 3;

export const ROOM_FLOOR_THICKNESS = 13;
export const SPRITE_BOTTOM_PADDING = 2;

export const DEFAULT_ASSETS = Object.freeze({
  bg_sky: './assets/img/bg_sky.png',
  bg_mountains: './assets/img/bg_mountains.png',
  fg_wasteland: './assets/img/fg_wasteland.png',
  dirt_texture: './assets/img/dirt_texture.png',
  room_atlas: './assets/img/room_atlas.png',
  room_laboratory: './assets/img/room_laboratory.png',
  room_life_support: './assets/img/room_life_support.png',
  elevator_cabin: './assets/img/elevator_cabin.png',
  character_sheet: './assets/img/character_sheet.png',
  npc_walk_sheet: './assets/img/npc_walk_sheet.png',
  room_base_empty: './assets/img/room_base_empty.png',
  plant_prop_1: './assets/img/plant_prop_1.png',
  uv_light_prop: './assets/img/uv_light_prop.png',
  loot_crate: './assets/img/loot_crate.svg',
});

export class AssetManager {
  constructor(urls = DEFAULT_ASSETS, ImageClass = globalThis.Image) {
    this.urls = { ...urls };
    this.ImageClass = ImageClass;
    this.images = new Map();
    this.failedKeys = [];
  }

  async preload() {
    this.failedKeys = [];
    await Promise.all(Object.entries(this.urls).map(([key, url]) => new Promise((resolve) => {
      if (!this.ImageClass || !url) { this.failedKeys.push(key); resolve(); return; }
      const image = new this.ImageClass();
      image.onload = () => { this.images.set(key, image); resolve(); };
      image.onerror = () => { this.failedKeys.push(key); resolve(); };
      image.src = url;
    })));
    return this;
  }

  getImage(key) { return this.images.get(key) ?? null; }
}

function drawOrMissing(ctx, image, x, y, width, height, crop = null) {
  if (!image || !image.width || !image.height) {
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(x, y, width, height);
    return;
  }
  if (crop) ctx.drawImage(image, ...crop, x, y, width, height);
  else ctx.drawImage(image, x, y, width, height);
}

function drawRepeatingLayer(ctx, image, parallaxX, y, width, height) {
  if (!image) { drawOrMissing(ctx, null, 0, y, ctx.canvas.width, height); return; }
  const start = ((parallaxX % width) + width) % width - width;
  for (let x = start; x < ctx.canvas.width; x += width) drawOrMissing(ctx, image, x, y, width, height);
}

function renderSurface(ctx, camera, assets, { isNight = false, time = 0 } = {}) {
  const boundary = SURFACE_Y + camera.offset_y;
  if (boundary <= 0) return;
  drawRepeatingLayer(ctx, assets.getImage('bg_sky'), camera.offset_x * .08, boundary - 520, 1400, 540);
  drawRepeatingLayer(ctx, assets.getImage('bg_mountains'), camera.offset_x * .2, boundary - 230, 1400, 260);
  drawRepeatingLayer(ctx, assets.getImage('fg_wasteland'), camera.offset_x, boundary - 180, 1600, 210);
  if (isNight) renderNightSurface(ctx, camera, boundary, time);
}

// Superficie noturna radioativa: tinta azul-violeta, estrelas cintilantes, lua esverdeada e fogueiras.
const NIGHT_STARS = Object.freeze(Array.from({ length: 64 }, (_, index) => {
  const hash = (seed) => ((Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453) % 1 + 1) % 1;
  return Object.freeze({ x: hash(1) * 1400, y: hash(2) * 300, size: hash(3) > .85 ? 2 : 1, phase: hash(4) * Math.PI * 2 });
}));
// Fogueiras de sobreviventes espalhadas pelas ruinas, em coordenadas do tile de primeiro plano.
const NIGHT_FIRES = Object.freeze([[190, 22], [640, 30], [1010, 18], [1420, 26]]);

function renderNightSurface(ctx, camera, boundary, time) {
  const top = boundary - 520;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if (typeof ctx.createLinearGradient === 'function') {
    const tint = ctx.createLinearGradient(0, top, 0, boundary);
    tint.addColorStop(0, '#26306a');
    tint.addColorStop(.7, '#463c78');
    tint.addColorStop(1, '#7a5266');
    ctx.fillStyle = tint;
  } else ctx.fillStyle = '#3a3670';
  ctx.fillRect(0, 0, ctx.canvas.width, boundary);
  ctx.globalCompositeOperation = 'source-over';
  // Estrelas e lua ficam na faixa de ceu visivel, que costuma ser estreita com a camera no bunker.
  const skyBottom = Math.max(20, boundary - 120);
  const offset = camera.offset_x * .05;
  ctx.fillStyle = '#e8ecff';
  for (const star of NIGHT_STARS) {
    const x = ((star.x + offset) % 1400 + 1400) % 1400;
    if (x > ctx.canvas.width) continue;
    ctx.globalAlpha = .35 + (Math.sin(time / 700 + star.phase) + 1) * .3;
    ctx.fillRect(Math.round(x), Math.round(Math.max(top, 0) + star.y / 300 * (skyBottom - Math.max(top, 0))), star.size, star.size);
  }
  const moonX = ctx.canvas.width * .27 + camera.offset_x * .03;
  const moonY = Math.max(36, Math.min(top + 150, boundary - 150));
  ctx.globalAlpha = 1;
  if (typeof ctx.createRadialGradient === 'function') {
    const halo = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 90);
    halo.addColorStop(0, 'rgba(190, 255, 170, .35)');
    halo.addColorStop(1, 'rgba(190, 255, 170, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(moonX - 90, moonY - 90, 180, 180);
  }
  ctx.fillStyle = '#dff5c8';
  ctx.beginPath();
  ctx.arc?.(moonX, moonY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 150, 110, .45)';
  ctx.beginPath();
  ctx.arc?.(moonX - 7, moonY - 4, 5, 0, Math.PI * 2);
  ctx.arc?.(moonX + 8, moonY + 7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  if (typeof ctx.createRadialGradient === 'function') {
    const start = ((camera.offset_x % 1600) + 1600) % 1600 - 1600;
    for (let tileX = start; tileX < ctx.canvas.width; tileX += 1600) {
      for (const [index, [fireX, depth]] of NIGHT_FIRES.entries()) {
        const x = tileX + fireX;
        if (x < -80 || x > ctx.canvas.width + 80) continue;
        const y = boundary - depth;
        const flicker = .8 + Math.sin(time / 90 + index * 1.7) * .12 + Math.sin(time / 37 + index) * .08;
        const glow = ctx.createRadialGradient(x, y, 2, x, y, 60 * flicker);
        glow.addColorStop(0, 'rgba(255, 170, 70, .55)');
        glow.addColorStop(.4, 'rgba(230, 95, 35, .2)');
        glow.addColorStop(1, 'rgba(230, 95, 35, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 60, y - 60, 120, 120);
        ctx.fillStyle = 'rgba(255, 220, 140, .9)';
        ctx.fillRect(x - 2, y - 3 * flicker, 4, 4);
      }
    }
  }
  ctx.restore();
}

function renderDirt(ctx, camera, assets) {
  const top = Math.max(0, SURFACE_Y + camera.offset_y);
  if (top >= ctx.canvas.height) return;
  const image = assets.getImage('dirt_texture');
  const pattern = image && ctx.createPattern(image, 'repeat');
  if (pattern?.setTransform && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translate(camera.offset_x, camera.offset_y));
  }
  ctx.fillStyle = pattern || '#ff00ff';
  ctx.fillRect(0, top, ctx.canvas.width, ctx.canvas.height - top);
}

export function renderRoom(ctx, room, assets, time = 0) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  if (room.type === 'greenhouse') {
    drawOrMissing(ctx, assets.getImage('room_base_empty'), x, y, SLOT_WIDTH, ROOM_HEIGHT);
    const planter = assets.getImage('plant_prop_1');
    drawOrMissing(ctx, planter, x + 12, y + 67, 116, 66);
    drawOrMissing(ctx, planter, x + 136, y + 67, 116, 66);
    drawOrMissing(ctx, assets.getImage('uv_light_prop'), x + 55, y + 7, 154, 48);
    return;
  }
  if (room.type === 'detention') {
    drawOrMissing(ctx, assets.getImage('room_base_empty'), x, y, SLOT_WIDTH, ROOM_HEIGHT);
    renderDetentionInterior(ctx, x, y, time);
    return;
  }
  if (room.type === 'laboratory') {
    const laboratory = assets.getImage('room_laboratory');
    const emptyBase = assets.getImage('room_base_empty');
    drawOrMissing(ctx, laboratory ?? emptyBase, x, y, SLOT_WIDTH, ROOM_HEIGHT);
    renderRoomAmbientLight(ctx, room, x, y);
    return;
  }
  if (room.type === 'life_support') {
    const supportRoom = assets.getImage('room_life_support');
    const emptyBase = assets.getImage('room_base_empty');
    if (supportRoom || emptyBase) drawOrMissing(ctx, supportRoom ?? emptyBase, x, y, SLOT_WIDTH, ROOM_HEIGHT);
    else {
      const atlas = assets.getImage('room_atlas');
      const cellWidth = atlas?.width / 3;
      const cellHeight = atlas?.height / 3;
      drawOrMissing(ctx, atlas, x, y, SLOT_WIDTH, ROOM_HEIGHT,
        atlas ? [0, cellHeight * 2, cellWidth, cellHeight] : null);
    }
    renderLifeSupportDetails(ctx, x, y, time);
    renderRoomAmbientLight(ctx, room, x, y);
    return;
  }
  const individual = assets.getImage(`room_${room.type}`);
  if (individual) {
    drawOrMissing(ctx, individual, x, y, SLOT_WIDTH, ROOM_HEIGHT);
  } else {
    const atlas = assets.getImage('room_atlas');
    const [column, row] = ATLAS_CELLS[room.type] ?? ATLAS_CELLS.vault;
    const cellWidth = atlas?.width / 3;
    const cellHeight = atlas?.height / 3;
    drawOrMissing(ctx, atlas, x, y, SLOT_WIDTH, ROOM_HEIGHT,
      atlas ? [column * cellWidth, row * cellHeight, cellWidth, cellHeight] : null);
  }
  renderRoomAmbientLight(ctx, room, x, y);
}

function renderLifeSupportDetails(ctx, x, y, time = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(164, 224, 239, .82)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 28);
  ctx.lineTo(x + SLOT_WIDTH - 10, y + 28);
  ctx.lineTo(x + SLOT_WIDTH - 10, y + 50);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245, 250, 246, .72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 36);
  ctx.lineTo(x + SLOT_WIDTH - 20, y + 36);
  ctx.stroke();

  for (const centerX of [x + 57, x + 132, x + 207]) {
    const centerY = y + 91;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = 'rgba(18, 36, 42, .88)';
    ctx.strokeStyle = '#a8d8df';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(time * 0.006);
    ctx.fillStyle = 'rgba(154, 212, 222, .9)';
    for (let blade = 0; blade < 4; blade++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, -13, 6, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d9f0f1';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function renderRoomAmbientLight(ctx, room, x, y) {
  const colors = ROOM_AMBIENT_LIGHTS[room.type];
  if (!colors || typeof ctx.createRadialGradient !== 'function') return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const light = ctx.createRadialGradient(x + SLOT_WIDTH / 2, y + ROOM_HEIGHT * .38, 6,
    x + SLOT_WIDTH / 2, y + ROOM_HEIGHT * .48, SLOT_WIDTH * .56);
  light.addColorStop(0, colors[0]);
  light.addColorStop(.62, colors[1]);
  light.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, SLOT_WIDTH, ROOM_HEIGHT);
  ctx.restore();
}

function visibleFrameBounds(image, frame, row, rows) {
  const cellWidth = image.width / 4;
  const cellHeight = image.height / rows;
  const fallback = [frame * cellWidth, row * cellHeight, cellWidth, cellHeight];
  if (typeof document === 'undefined') return fallback;
  let cache = frameBoundsCache.get(image);
  if (!cache) { cache = new Map(); frameBoundsCache.set(image, cache); }
  const key = `${frame}:${row}:${rows}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const buffer = document.createElement('canvas');
    buffer.width = cellWidth;
    buffer.height = cellHeight;
    const probe = buffer.getContext('2d', { willReadFrequently: true });
    probe.drawImage(image, ...fallback, 0, 0, cellWidth, cellHeight);
    const pixels = probe.getImageData(0, 0, buffer.width, buffer.height).data;
    let minX = buffer.width, minY = buffer.height, maxX = -1, maxY = -1;
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        if (pixels[(y * buffer.width + x) * 4 + 3] < 24) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    const bounds = maxX < 0 ? fallback
      : [fallback[0] + minX, fallback[1] + minY, maxX - minX + 1, maxY - minY + 1];
    cache.set(key, bounds);
    return bounds;
  } catch {
    cache.set(key, fallback);
    return fallback;
  }
}

export function getActorPlacement(room, { liftY } = {}) {
  const physicalFloorY = cellCenter(room.floor, room.column).y;
  // Atores mantem o mesmo tamanho em todo o bunker, inclusive dentro da cabine do elevador.
  const innerHeight = ROOM_HEIGHT - ROOM_CEILING_THICKNESS - ROOM_FLOOR_THICKNESS;
  if (room.type === 'elevator') {
    return { innerHeight, height: innerHeight * .55,
      floorY: (liftY ?? physicalFloorY) + ELEVATOR_SPRITE_FOOT_OFFSET };
  }
  const roomY = WORLD_TOP + room.floor * FLOOR_SPACING;
  return { innerHeight, height: innerHeight * .55,
    floorY: roomY + ROOM_HEIGHT - ROOM_FLOOR_THICKNESS + SPRITE_BOTTOM_PADDING };
}

export function drawActorSprite(ctx, actor, image, time = 0, placement = { height: ROOM_HEIGHT * .55 }, filter = 'none') {
  const president = actor.role === 'president';
  const walking = president ? Math.abs(actor.vx ?? 0) > 1 : actor.currentState?.startsWith('walking_');
  const frame = walking ? 1 + Math.floor(time / 140) % 3 : 0;
  const row = president ? 0 : NPC_ROWS[actor.role] ?? 0;
  const crop = image ? visibleFrameBounds(image, frame, row, president ? 2 : 4) : null;
  const height = placement.height;
  const width = crop ? height * crop[2] / crop[3] : height * .45;
  ctx.save();
  ctx.globalAlpha = .4;
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(actor.x, actor.y, Math.max(7, width * .32), 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(actor.x, actor.y);
  if (actor.facing === -1) ctx.scale(-1, 1);
  ctx.filter = filter;
  drawOrMissing(ctx, image, -width / 2, -height, width, height, crop);
  ctx.restore();
}

export function drawPresident(ctx, actor, assets, { presidentClass, equippedSkin = 'default', time = 0,
  placement = { height: ROOM_HEIGHT * .55 } } = {}) {
  const skin = getSkin(equippedSkin);
  const filter = skin?.filter ?? 'none';
  const profile = getPresidentClass(presidentClass)
    ?? getPresidentClass('survivor');
  const role = profile.spriteRole;
  const currentState = Math.abs(actor.vx ?? 0) > 1
    ? (actor.vx < 0 ? 'walking_left' : 'walking_right') : 'idle';
  const image = assets?.getImage?.(profile.spriteSheet)
    ?? assets?.getImage?.('character_sheet');
  return drawActorSprite(ctx, { ...actor, role, currentState }, image, time, placement, filter);
}

function renderGreenhouseGlow(ctx, room) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const light = ctx.createRadialGradient(x + SLOT_WIDTH / 2, y + 43, 5,
    x + SLOT_WIDTH / 2, y + 73, SLOT_WIDTH * .45);
  light.addColorStop(0, 'rgba(171, 88, 255, .32)');
  light.addColorStop(.55, 'rgba(119, 49, 205, .12)');
  light.addColorStop(1, 'rgba(119, 49, 205, 0)');
  ctx.fillStyle = light;
  ctx.fillRect(x + 6, y + 8, SLOT_WIDTH - 12, ROOM_HEIGHT - 27);
  ctx.restore();
}

export function applyNightOverlay(ctx, width, height, isNight, { activeGenerators = 0, surfaceHeight = 0 } = {}) {
  if (!isNight || hasReliableNightPower(activeGenerators)) return;
  const top = Math.max(0, Math.min(height, Number(surfaceHeight) || 0));
  if (top >= height) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, top, width, height - top);
  ctx.restore();
}

export function applyOxygenDeprivationOverlay(ctx, width, height, oxygenDeprived, time = 0) {
  if (!oxygenDeprived) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.055 + (Math.sin(time / 520) + 1) * 0.018;
  ctx.fillStyle = '#9b275f';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function renderSpriteScene(ctx, { grid, player, camera, assets, inhabitants = [], cabinFloor = player.floor,
  time = 0, isNight = false, activeGenerators = 0, oxygenDeprived = false, lootbox = {},
  presidentClass = null, equippedSkin = 'default' }) {
  renderSurface(ctx, camera, assets, { isNight, time });
  renderDirt(ctx, camera, assets);
  ctx.save();
  ctx.translate(camera.offset_x, camera.offset_y);
  const atlas = assets.getImage('room_atlas');
  for (let floor = 0; floor < grid.length; floor++) {
    for (let column = 0; column < grid[floor].length; column++) {
      const room = grid[floor][column];
      if (!room) continue;
      renderRoom(ctx, room, assets, time);
      if (room.type === 'elevator' && atlas && grid[floor + 1]?.[column]?.type === 'elevator') {
        const cellWidth = atlas.width / 3;
        const cellHeight = atlas.height / 3;
        drawOrMissing(ctx, atlas, WORLD_LEFT + column * SLOT_WIDTH,
          WORLD_TOP + floor * FLOOR_SPACING + ROOM_HEIGHT, SLOT_WIDTH, FLOOR_SPACING - ROOM_HEIGHT,
          [cellWidth, 0, cellWidth, cellHeight]);
      }
    }
  }
  const cabinY = player.liftTarget !== null ? player.y : cellCenter(cabinFloor, 0).y;
  drawOrMissing(ctx, assets.getImage('elevator_cabin'), WORLD_LEFT + 74,
    cabinY + ELEVATOR_ART_FLOOR_INSET - ELEVATOR_CABIN_HEIGHT, 116, ELEVATOR_CABIN_HEIGHT);
  const npcSheet = assets.getImage('npc_walk_sheet');
  for (const npc of inhabitants) {
    if (npc.is_on_expedition) continue;
    const room = grid[npc.floor]?.[npc.column];
    if (!room) continue;
    const x = WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + npc.offsetX;
    const placement = getActorPlacement(room);
    const animationPhase = [...npc.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4 * 67;
    drawActorSprite(ctx, { ...npc, x, y: placement.floorY }, npcSheet, time + animationPhase, placement);
    if (npc.isVIP) {
      ctx.save();
      ctx.fillStyle = '#f4d36e';
      ctx.font = 'bold 12px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#f4d36e';
      ctx.shadowBlur = 5;
      ctx.fillText(`⭐ ${npc.name || 'Especialista'}`, x, placement.floorY - placement.height - 11);
      ctx.restore();
    }
    if (npc.currentState === 'rebel' && !npc.is_prisoner) {
      ctx.save();
      ctx.globalAlpha = .62 + (Math.sin(time / 180) + 1) * .19;
      ctx.fillStyle = '#ff263d';
      ctx.font = 'bold 25px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, placement.floorY - placement.height - 7);
      ctx.restore();
    } else if (!npc.is_prisoner && !npc.is_on_expedition) {
      const icons = [...(Number(npc.loyalty ?? 100) < 40 ? ['⚠'] : []),
        ...getCriticalNeeds(npc.needs).map((key) => NEED_ICONS[key])];
      if (icons.length) {
        ctx.save();
        ctx.globalAlpha = .55 + (Math.sin(time / 430) + 1) * .12;
        ctx.fillStyle = '#e6c75a';
        ctx.font = 'bold 17px monospace';
        ctx.textAlign = 'center';
        icons.forEach((icon, index) => ctx.fillText(icon, x + (index - (icons.length - 1) / 2) * 19,
          placement.floorY - placement.height - 7));
        ctx.restore();
      }
    }
  }
  const playerColumn = Math.max(0, Math.min(grid[player.floor]?.length - 1 ?? 0,
    Math.floor((player.x - WORLD_LEFT) / SLOT_WIDTH)));
  const playerRoom = grid[player.floor]?.[playerColumn] ?? { floor: player.floor, column: playerColumn, type: 'vault' };
  const placement = getActorPlacement(playerRoom,
    player.liftTarget !== null ? { liftY: player.y } : {});
  const playerY = placement.floorY;
  drawPresident(ctx, { ...player, y: playerY, role: 'president' }, assets,
    { presidentClass, equippedSkin, time, placement });
  for (const room of grid.flat()) if (room?.type === 'detention') renderDetentionBars(ctx, room, time);
  for (const room of grid.flat()) if (room?.type === 'greenhouse') renderGreenhouseGlow(ctx, room);
  ctx.restore();
  if (isNight && ctx.canvas) {
    const surfaceHeight = Math.max(0, Math.min(ctx.canvas.height, SURFACE_Y + camera.offset_y));
    applyNightOverlay(ctx, ctx.canvas.width, ctx.canvas.height, true, { activeGenerators, surfaceHeight });
  }
  if (ctx.canvas) applyOxygenDeprivationOverlay(ctx, ctx.canvas.width, ctx.canvas.height, oxygenDeprived, time);
  renderLootboxOverlay(ctx, { ...lootbox, time, crateImage: assets.getImage('loot_crate') });
}

function steelGradient(ctx, x0, y0, x1, y1, fallback) {
  if (typeof ctx.createLinearGradient !== 'function') return fallback;
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, '#16191a');
  gradient.addColorStop(.45, '#6e6a62');
  gradient.addColorStop(.6, '#4a4540');
  gradient.addColorStop(1, '#141617');
  return gradient;
}

// Cela de detencao: concreto frio com beliche, latrina de aco e lampada gradeada que falha.
function renderDetentionInterior(ctx, x, y, time = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect?.(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8);
  ctx.clip?.();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = .55;
  ctx.fillStyle = '#56677d';
  ctx.fillRect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  for (let stripeX = x + 44; stripeX < x + 220; stripeX += 12) {
    ctx.fillStyle = (stripeX - x) % 24 === 20 ? '#c9a227' : '#1b1b1a';
    ctx.fillRect(stripeX, y + 103, 12, 5);
  }

  ctx.fillStyle = '#b8962a';
  ctx.fillRect(x + 58, y + 54, 38, 11);
  ctx.fillStyle = '#1a1a18';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText?.('CELA 01', x + 77, y + 60);

  ctx.strokeStyle = 'rgba(225, 218, 200, .55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let group = 0; group < 3; group++) {
    const groupX = x + 122 + group * 17;
    for (let mark = 0; mark < 4; mark++) {
      ctx.moveTo(groupX + mark * 3, y + 64);
      ctx.lineTo(groupX + mark * 3, y + 76);
    }
    ctx.moveTo(groupX - 2, y + 74);
    ctx.lineTo(groupX + 11, y + 66);
  }
  ctx.stroke();

  ctx.fillStyle = '#16191a';
  ctx.fillRect(x + 46, y + 64, 4, 54);
  ctx.fillRect(x + 104, y + 64, 4, 54);
  for (const bunkY of [y + 76, y + 100]) {
    ctx.fillStyle = '#8a7f62';
    ctx.fillRect(x + 50, bunkY, 54, 7);
    ctx.fillStyle = '#c2b694';
    ctx.fillRect(x + 52, bunkY - 3, 13, 4);
    ctx.fillStyle = '#556238';
    ctx.fillRect(x + 70, bunkY - 1, 32, 7);
    ctx.fillStyle = '#16191a';
    ctx.fillRect(x + 48, bunkY + 7, 58, 3);
  }

  ctx.fillStyle = '#4e575b';
  ctx.fillRect(x + 197, y + 101, 3, 7);
  ctx.fillStyle = '#b5bcc0';
  ctx.fillRect(x + 188, y + 80, 20, 6);
  ctx.fillStyle = '#2b3134';
  ctx.fillRect(x + 196, y + 86, 4, 15);
  ctx.fillStyle = '#c3cacd';
  ctx.fillRect(x + 186, y + 108, 22, 5);
  ctx.fillStyle = '#8d969b';
  ctx.fillRect(x + 189, y + 113, 16, 6);
  ctx.fillStyle = '#20272a';
  ctx.fillRect(x + 189, y + 108, 16, 2);

  const lampX = x + 150;
  const lampY = y + 54;
  const lit = Math.sin(time / 53) < .92 || Math.sin(time / 211) < 0;
  ctx.fillStyle = '#1e2224';
  ctx.fillRect(lampX - 1, y + 40, 2, 10);
  ctx.fillStyle = lit ? '#e9f2ff' : '#59606a';
  ctx.fillRect(lampX - 5, lampY - 4, 10, 7);
  ctx.strokeStyle = '#2b3032';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const cageX of [lampX - 5, lampX, lampX + 5]) {
    ctx.moveTo(cageX, lampY - 4);
    ctx.lineTo(cageX, lampY + 3);
  }
  ctx.stroke();
  if (lit && typeof ctx.createRadialGradient === 'function') {
    const light = ctx.createRadialGradient(lampX, lampY, 4, lampX, lampY + 30, 90);
    light.addColorStop(0, 'rgba(215, 232, 255, .3)');
    light.addColorStop(.6, 'rgba(160, 190, 230, .1)');
    light.addColorStop(1, 'rgba(160, 190, 230, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(x + 20, y + 30, SLOT_WIDTH - 40, ROOM_HEIGHT - 40);
  }
  ctx.restore();
}

// Grade frontal desenhada depois dos atores: trilhos, barras de aco, rebites e porta trancada.
function renderDetentionBars(ctx, room, time = 0) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  const left = x + 10;
  const right = x + SLOT_WIDTH - 10;
  const top = y + 20;
  const bottom = y + ROOM_HEIGHT - 12;
  const crossY = y + 76;
  const doorLeft = x + 176;
  const doorRight = x + 240;
  ctx.save();
  for (let barX = left + 10; barX < right - 4; barX += 26) {
    ctx.fillStyle = steelGradient(ctx, barX, 0, barX + 5, 0, '#4a5254');
    ctx.fillRect(barX, top, 5, bottom - top);
    ctx.fillStyle = 'rgba(214, 200, 176, .22)';
    ctx.fillRect(barX + 2, top + 6, 1, bottom - top - 12);
    ctx.fillStyle = 'rgba(122, 64, 30, .45)';
    ctx.fillRect(barX, crossY + 6, 5, 9);
    ctx.fillRect(barX, bottom - 16, 5, 9);
  }
  for (const [railY, railHeight] of [[top, 7], [crossY, 6], [bottom - 7, 7]]) {
    ctx.fillStyle = steelGradient(ctx, 0, railY, 0, railY + railHeight, '#3d4446');
    ctx.fillRect(left, railY, right - left, railHeight);
    ctx.fillStyle = 'rgba(122, 64, 30, .35)';
    ctx.fillRect(left, railY + railHeight - 2, right - left, 2);
    ctx.fillStyle = '#9a8f7c';
    for (let rivetX = left + 11; rivetX < right - 4; rivetX += 26) ctx.fillRect(rivetX + 1, railY + railHeight / 2 - 1, 2, 2);
  }
  for (const postX of [doorLeft, doorRight]) {
    ctx.fillStyle = steelGradient(ctx, postX, 0, postX + 7, 0, '#353c3e');
    ctx.fillRect(postX, top, 7, bottom - top);
  }
  ctx.fillStyle = '#23292b';
  ctx.fillRect(doorLeft - 3, top + 14, 4, 10);
  ctx.fillRect(doorLeft - 3, bottom - 26, 4, 10);
  ctx.fillStyle = '#5e5a4c';
  ctx.fillRect(doorRight - 18, crossY - 7, 16, 20);
  ctx.fillStyle = '#2a2822';
  ctx.fillRect(doorRight - 12, crossY + 3, 4, 6);
  ctx.fillStyle = Math.sin(time / 260) > 0 ? '#ff3b30' : '#6b1b17';
  ctx.fillRect(doorRight - 11, crossY - 4, 3, 3);
  ctx.restore();
}

const NEED_BAR_COLORS = Object.freeze({ good: '#39ff14', warning: '#e6c75a', critical: '#ff263d' });

// Painel compacto de necessidades exibido sobre o habitante mais proximo do Presidente.
export function drawNeedsPanel(ctx, centerX, bottomY, needs) {
  const values = normalizeNeeds(needs);
  const width = 92;
  const rowHeight = 10;
  const height = NEED_KEYS.length * rowHeight + 8;
  const left = Math.round(centerX - width / 2);
  const top = Math.round(bottomY - height);
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 11, .82)';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = 'rgba(255, 176, 0, .65)';
  ctx.lineWidth = 1;
  ctx.strokeRect?.(left + .5, top + .5, width - 1, height - 1);
  ctx.font = '8px "Share Tech Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  NEED_KEYS.forEach((key, index) => {
    const rowY = top + 4 + index * rowHeight;
    const value = values[key];
    const tone = value < NEED_CRITICAL_THRESHOLD ? 'critical' : value < 60 ? 'warning' : 'good';
    ctx.fillStyle = '#ffd88a';
    ctx.fillText(NEED_LABELS[key], left + 4, rowY + 4);
    ctx.fillStyle = '#2a2f2c';
    ctx.fillRect(left + 46, rowY + 1, 42, 6);
    ctx.fillStyle = NEED_BAR_COLORS[tone];
    ctx.fillRect(left + 46, rowY + 1, Math.round(42 * value / 100), 6);
  });
  ctx.restore();
}
