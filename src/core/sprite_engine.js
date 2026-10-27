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

function renderSurface(ctx, camera, assets, { isNight = false, time = 0, weather = 'clear' } = {}) {
  const boundary = SURFACE_Y + camera.offset_y;
  if (boundary <= 0) return;
  drawRepeatingLayer(ctx, assets.getImage('bg_sky'), camera.offset_x * .08, boundary - 520, 1400, 540);
  drawRepeatingLayer(ctx, assets.getImage('bg_mountains'), camera.offset_x * .2, boundary - 230, 1400, 260);
  drawRepeatingLayer(ctx, assets.getImage('fg_wasteland'), camera.offset_x, boundary - 180, 1600, 210);
  if (isNight) renderNightSurface(ctx, camera, boundary, time, { overcast: weather !== 'clear' });
  if (weather !== 'clear') renderWeather(ctx, camera, boundary, time, weather);
}

// Superficie noturna radioativa: tinta azul-violeta, estrelas cintilantes, lua esverdeada e fogueiras.
const NIGHT_STARS = Object.freeze(Array.from({ length: 64 }, (_, index) => {
  const hash = (seed) => ((Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453) % 1 + 1) % 1;
  return Object.freeze({ x: hash(1) * 1400, y: hash(2) * 300, size: hash(3) > .85 ? 2 : 1, phase: hash(4) * Math.PI * 2 });
}));
// Fogueiras de sobreviventes espalhadas pelas ruinas, em coordenadas do tile de primeiro plano.
const NIGHT_FIRES = Object.freeze([[190, 22], [640, 30], [1010, 18], [1420, 26]]);

// Estrelas e lua ficam na faixa de ceu visivel, que costuma ser estreita com a camera no bunker.
function renderNightSkyLights(ctx, camera, boundary, time, top) {
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
}

function renderNightSurface(ctx, camera, boundary, time, { overcast = false } = {}) {
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
  if (!overcast) renderNightSkyLights(ctx, camera, boundary, time, top);
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

// Particulas fixas reaproveitadas pelas tempestades; cada uma guarda posicao, velocidade e tamanho relativos.
const WEATHER_PARTICLES = Object.freeze(Array.from({ length: 140 }, (_, index) => {
  const hash = (seed) => ((Math.sin(seed * 91.7 + index * 47.13) * 24634.6345) % 1 + 1) % 1;
  return Object.freeze({ x: hash(1), y: hash(2), speed: .6 + hash(3) * .8, size: hash(4) });
}));

function renderWeather(ctx, camera, boundary, time, weather) {
  const width = ctx.canvas.width;
  const height = Math.min(boundary, ctx.canvas.height);
  if (height <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect?.(0, 0, width, height);
  ctx.clip?.();
  const drift = camera.offset_x * .6;
  if (weather === 'dust') {
    ctx.fillStyle = 'rgba(168, 98, 42, .5)';
    ctx.fillRect(0, 0, width, height);
    if (typeof ctx.createLinearGradient === 'function') {
      const haze = ctx.createLinearGradient(0, height * .35, 0, height);
      haze.addColorStop(0, 'rgba(196, 126, 62, 0)');
      haze.addColorStop(1, 'rgba(196, 126, 62, .55)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);
    }
    for (const particle of WEATHER_PARTICLES) {
      const x = ((particle.x * (width + 80) + time * .45 * particle.speed + drift) % (width + 80) + width + 80) % (width + 80) - 40;
      const y = particle.y * height + Math.sin(time / 300 + particle.x * 20) * 3;
      ctx.fillStyle = `rgba(${200 + Math.round(particle.size * 40)}, ${128 + Math.round(particle.size * 40)}, 70, ${.2 + particle.size * .35})`;
      ctx.fillRect(x, y, 3 + particle.size * 9, 1 + Math.round(particle.size * 1.4));
    }
  } else if (weather === 'acid_rain') {
    ctx.fillStyle = 'rgba(58, 104, 52, .26)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(176, 255, 140, .55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const particle of WEATHER_PARTICLES) {
      const y = (particle.y * height + time * .55 * particle.speed) % height;
      const x = ((particle.x * width - y * .3 + drift) % width + width) % width;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 9 + particle.size * 6);
    }
    ctx.stroke();
    for (let index = 0; index < 9; index++) {
      const x = ((index * 131 + drift) % width + width) % width;
      ctx.globalAlpha = .35 + (Math.sin(time / 240 + index * 2.1) + 1) * .2;
      ctx.fillStyle = '#b8ff8f';
      ctx.fillRect(x, height - 7, 14, 2);
    }
  } else if (weather === 'radstorm') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#6fae74';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(80, 255, 130, .1)';
    ctx.fillRect(0, 0, width, height);
    const strike = Math.floor(time / 4_200);
    if (time % 4_200 < 160) {
      ctx.fillStyle = 'rgba(205, 255, 215, .38)';
      ctx.fillRect(0, 0, width, height);
      const hash = (seed) => ((Math.sin((strike + seed) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      let boltX = width * (.15 + hash(1) * .7);
      ctx.strokeStyle = '#e9ffe9';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#6dff9a';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(boltX, 0);
      for (let segment = 1; segment <= 7; segment++) {
        boltX += (hash(segment + 2) - .5) * 46;
        ctx.lineTo(boltX, height * .62 * segment / 7);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160, 255, 170, .5)';
    for (const particle of WEATHER_PARTICLES.slice(0, 50)) {
      const y = (particle.y * height + time * .08 * particle.speed) % height;
      const x = ((particle.x * width + Math.sin(time / 900 + particle.size * 6) * 12 + drift) % width + width) % width;
      ctx.fillRect(x, y, 2, 2);
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

const headAnchorCache = new WeakMap();
const skinCanvasCache = new Map();

// Localiza a cabeca no quadro recortado: centro horizontal dos pixels opacos no topo do sprite.
function findHeadAnchor(image, crop) {
  const fallback = { x: .55, y: .08, r: .075 };
  if (typeof document === 'undefined' || !image || !crop) return fallback;
  let cache = headAnchorCache.get(image);
  if (!cache) { cache = new Map(); headAnchorCache.set(image, cache); }
  const key = crop.join(':');
  if (cache.has(key)) return cache.get(key);
  let anchor = fallback;
  try {
    const width = Math.max(1, Math.round(crop[2]));
    const height = Math.max(1, Math.round(crop[3]));
    const buffer = document.createElement('canvas');
    buffer.width = width;
    buffer.height = height;
    const probe = buffer.getContext('2d', { willReadFrequently: true });
    probe.drawImage(image, ...crop, 0, 0, width, height);
    const rows = Math.max(1, Math.round(height * .13));
    const pixels = probe.getImageData(0, 0, width, rows).data;
    let sumX = 0;
    let count = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] < 40) continue;
        sumX += x;
        count++;
      }
    }
    if (count) anchor = { x: sumX / count / width, y: .075, r: .075 };
  } catch {
    anchor = fallback;
  }
  cache.set(key, anchor);
  return anchor;
}

function particleRandom(seed) {
  return ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;
}

// Padroes pintados no tecido; o chamador aplica a mascara de alfa do sprite depois, entao nada vaza para fora do corpo.
function drawBodyPattern(off, pattern, w, h, anchor, time) {
  const headX = anchor.x * w;
  const bodyTop = Math.round((anchor.y + anchor.r * 1.4) * h);
  off.save();
  off.globalCompositeOperation = 'source-over';
  if (pattern === 'soot') {
    for (let index = 0; index < 7; index++) {
      const cx = w * (.15 + particleRandom(index + 40) * .7);
      const cy = bodyTop + (h - bodyTop) * (.05 + particleRandom(index + 50) * .85);
      const radius = Math.max(2, w * (.12 + particleRandom(index + 60) * .16));
      const blot = off.createRadialGradient(cx, cy, 0, cx, cy, radius);
      blot.addColorStop(0, 'rgba(18, 10, 4, .6)');
      blot.addColorStop(1, 'rgba(18, 10, 4, 0)');
      off.fillStyle = blot;
      off.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    const scorch = off.createLinearGradient(0, h * .45, 0, h * .62);
    scorch.addColorStop(0, 'rgba(255, 120, 30, 0)');
    scorch.addColorStop(.5, 'rgba(255, 120, 30, .28)');
    scorch.addColorStop(1, 'rgba(255, 120, 30, 0)');
    off.fillStyle = scorch;
    off.fillRect(headX, h * .45, w - headX, h * .17);
  } else if (pattern === 'hazmat') {
    const rubber = off.createLinearGradient(0, bodyTop, w, h);
    rubber.addColorStop(0, 'rgba(255, 222, 40, .62)');
    rubber.addColorStop(1, 'rgba(236, 176, 0, .62)');
    off.fillStyle = rubber;
    off.fillRect(0, 0, w, h);
    off.strokeStyle = 'rgba(120, 80, 0, .32)';
    off.lineWidth = Math.max(.7, w / 34);
    off.beginPath();
    for (let fold = 0; fold < 7; fold++) {
      const fx = w * (.12 + fold * .12) + (particleRandom(fold + 300) - .5) * w * .05;
      const fy = bodyTop + (h - bodyTop) * (.1 + particleRandom(fold + 310) * .5);
      off.moveTo(fx, fy);
      off.quadraticCurveTo(fx + w * .04, fy + h * .05, fx - w * .01, fy + h * .1);
    }
    off.stroke();
    const shine = off.createLinearGradient(0, 0, w, 0);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shine.addColorStop(.62, 'rgba(255, 255, 230, .32)');
    shine.addColorStop(.75, 'rgba(255, 255, 255, 0)');
    off.fillStyle = shine;
    off.fillRect(0, bodyTop, w, h - bodyTop);
    const tapeY = h * .5;
    off.fillStyle = '#8f9497';
    off.fillRect(0, tapeY, w, Math.max(1.5, h * .022));
    off.fillStyle = 'rgba(255, 255, 255, .35)';
    off.fillRect(0, tapeY, w, Math.max(.6, h * .006));
    const bootTop = h * .855;
    const boots = off.createLinearGradient(0, bootTop, 0, h);
    boots.addColorStop(0, '#2a2a2a');
    boots.addColorStop(1, '#0b0b0b');
    off.fillStyle = boots;
    off.fillRect(0, bootTop, w, h - bootTop);
    off.fillStyle = 'rgba(255, 255, 255, .18)';
    off.fillRect(0, bootTop, w, Math.max(.6, h * .006));
    const signX = Math.min(w * .82, headX + w * .02);
    const signY = bodyTop + h * .12;
    const signR = Math.max(2.2, w * .085);
    off.fillStyle = '#111';
    off.beginPath();
    off.arc(signX, signY, signR, 0, Math.PI * 2);
    off.fill();
    off.fillStyle = '#ffd400';
    off.beginPath();
    off.arc(signX, signY, signR * .82, 0, Math.PI * 2);
    off.fill();
    off.fillStyle = '#111';
    for (let blade = 0; blade < 3; blade++) {
      const angle = -Math.PI / 2 + blade * (Math.PI * 2 / 3);
      off.beginPath();
      off.moveTo(signX, signY);
      off.arc(signX, signY, signR * .72, angle - .5, angle + .5);
      off.closePath();
      off.fill();
    }
    off.fillStyle = '#ffd400';
    off.beginPath();
    off.arc(signX, signY, signR * .22, 0, Math.PI * 2);
    off.fill();
    off.fillStyle = '#111';
    off.beginPath();
    off.arc(signX, signY, signR * .13, 0, Math.PI * 2);
    off.fill();
  } else if (pattern === 'camo') {
    const cell = Math.max(2, Math.round(w / 17));
    const tones = ['#7d8c84', '#a3b1a8', '#5b6862', '#c3cdc6'];
    off.globalCompositeOperation = 'multiply';
    off.globalAlpha = .7;
    for (let y = bodyTop; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const pick = particleRandom(x * 7.13 + y * 3.71 + 1);
        if (pick < .28) continue;
        off.fillStyle = tones[Math.floor(pick * tones.length) % tones.length];
        off.fillRect(x, y, cell, cell);
      }
    }
  } else if (pattern === 'hazard') {
    const bands = [[.53, .065], [.36, .035]];
    for (const [start, size] of bands) {
      const top = h * start;
      const height = Math.max(2, h * size);
      off.save();
      off.beginPath();
      off.rect(0, top, w, height);
      off.clip();
      const stripe = Math.max(2, Math.round(w / 9));
      for (let x = -h; x < w + h; x += stripe * 2) {
        off.fillStyle = '#f2c230';
        off.beginPath();
        off.moveTo(x, top + height);
        off.lineTo(x + stripe, top + height);
        off.lineTo(x + stripe + height, top);
        off.lineTo(x + height, top);
        off.closePath();
        off.fill();
      }
      off.restore();
      off.fillStyle = 'rgba(20, 20, 20, .9)';
      off.fillRect(0, top, w, 1);
      off.fillRect(0, top + height - 1, w, 1);
    }
  } else if (pattern === 'braid') {
    const chestX = Math.min(w * .92, headX + w * .08);
    off.strokeStyle = '#f0c14b';
    off.lineWidth = Math.max(1, w / 30);
    for (let loop = 0; loop < 2; loop++) {
      off.beginPath();
      off.moveTo(chestX - w * .1, bodyTop + h * .03);
      off.quadraticCurveTo(chestX - w * (.02 - loop * .03), bodyTop + h * (.12 + loop * .04), chestX + w * .06, bodyTop + h * .04);
      off.stroke();
    }
    off.fillStyle = '#ffd86b';
    for (let button = 0; button < 4; button++) {
      off.fillRect(chestX, bodyTop + h * (.07 + button * .055), Math.max(1, w / 26), Math.max(1, w / 26));
    }
  } else if (pattern === 'scars') {
    const pulse = .55 + (Math.sin(time / 260) + 1) * .22;
    off.lineCap = 'round';
    off.shadowColor = '#ff7a1a';
    off.shadowBlur = 4;
    for (let crack = 0; crack < 9; crack++) {
      let x = w * (.1 + particleRandom(crack + 70) * .8);
      let y = bodyTop + (h - bodyTop) * particleRandom(crack + 80) * .8;
      off.strokeStyle = `rgba(255, ${120 + Math.round(particleRandom(crack + 90) * 80)}, 40, ${pulse})`;
      off.lineWidth = Math.max(.8, w / 40);
      off.beginPath();
      off.moveTo(x, y);
      for (let step = 0; step < 4; step++) {
        x += (particleRandom(crack * 5 + step + 100) - .5) * w * .3;
        y += h * (.02 + particleRandom(crack * 3 + step + 120) * .05);
        off.lineTo(x, y);
      }
      off.stroke();
    }
  }
  off.restore();
}

// Retinge apenas os pixels do sprite: filtro base, camada de cor com blend, padrao do tecido e mascara de alfa do recorte.
function renderSkinnedSprite(image, crop, skin, width, height, time) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const animated = Boolean(skin.tint?.shimmer || skin.pattern === 'scars');
  const key = `${skin.id}:${crop.join(':')}:${w}x${h}`;
  let canvas = skinCanvasCache.get(key);
  if (canvas && !animated) return canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    if (skinCanvasCache.size > 240) skinCanvasCache.clear();
    skinCanvasCache.set(key, canvas);
  }
  const off = canvas.getContext('2d');
  off.clearRect(0, 0, w, h);
  off.filter = skin.filter && skin.filter !== 'none' ? skin.filter : 'none';
  off.drawImage(image, ...crop, 0, 0, w, h);
  off.filter = 'none';
  if (skin.tint) {
    const gradient = off.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, skin.tint.colors[0]);
    gradient.addColorStop(1, skin.tint.colors[1]);
    off.globalCompositeOperation = skin.tint.blend;
    off.globalAlpha = skin.tint.alpha;
    off.fillStyle = gradient;
    off.fillRect(0, 0, w, h);
    if (skin.tint.shimmer) {
      const band = ((time / 900) % 1) * (h * 1.8) - h * .4;
      const shine = off.createLinearGradient(0, band - h * .25, w * .4, band + h * .25);
      shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
      shine.addColorStop(.5, 'rgba(255, 255, 255, .55)');
      shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
      off.globalCompositeOperation = 'screen';
      off.globalAlpha = 1;
      off.fillStyle = shine;
      off.fillRect(0, 0, w, h);
    }
    off.globalAlpha = 1;
    off.globalCompositeOperation = 'source-over';
  }
  if (skin.pattern) drawBodyPattern(off, skin.pattern, w, h, findHeadAnchor(image, crop), time);
  if (skin.tint || skin.pattern) {
    off.globalCompositeOperation = 'destination-in';
    off.drawImage(image, ...crop, 0, 0, w, h);
    off.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

function metalGradient(ctx, x0, y0, x1, y1, light, dark) {
  const gradient = ctx.createLinearGradient?.(x0, y0, x1, y1);
  if (!gradient) return dark;
  gradient.addColorStop(0, light);
  gradient.addColorStop(1, dark);
  return gradient;
}

// Acessorios desenhados no sistema local do sprite (virado para +x), ancorados na cabeca detectada.
function drawSkinAccessory(ctx, skin, head, time) {
  const { x, y, r } = head;
  const line = Math.max(.6, r * .12);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (skin.accessory === 'crown') {
    const base = y - r * .4;
    const half = r * 1.05;
    ctx.fillStyle = metalGradient(ctx, 0, base - r * 1.2, 0, base, '#fff2a0', '#c8900f');
    ctx.strokeStyle = '#7a4d00';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(x - half, base);
    ctx.lineTo(x - half, base - r * .9);
    ctx.lineTo(x - half * .45, base - r * .45);
    ctx.lineTo(x, base - r * 1.25);
    ctx.lineTo(x + half * .45, base - r * .45);
    ctx.lineTo(x + half, base - r * .9);
    ctx.lineTo(x + half, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff3b4a';
    ctx.fillRect(x - r * .12, base - r * .5, r * .25, r * .25);
  } else if (skin.accessory === 'eyes') {
    ctx.globalAlpha = .75 + Math.sin(time / 260) * .25;
    ctx.fillStyle = skin.eyeColor ?? '#ff3b30';
    ctx.shadowColor = skin.eyeColor ?? '#ff3b30';
    ctx.shadowBlur = 6;
    ctx.fillRect(x + r * .35, y - r * .05, Math.max(2, r * .35), Math.max(1.5, r * .22));
  } else if (skin.accessory === 'visor') {
    ctx.beginPath();
    ctx.ellipse?.(x + r * .1, y + r * .1, r * 1.35, r * 1.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150, 230, 255, .28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(225, 250, 255, .85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .7)';
    ctx.fillRect(x + r * .45, y - r * .7, Math.max(1.5, r * .25), r * .6);
  } else if (skin.accessory === 'hazmat_hood') {
    ctx.fillStyle = metalGradient(ctx, x - r * 1.4, y - r * 1.3, x + r * 1.3, y + r * 1.4, '#fff07a', '#d39a00');
    ctx.strokeStyle = '#8a6200';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.3, y + r * 1.55);
    ctx.quadraticCurveTo(x - r * 1.55, y - r * .4, x - r * .6, y - r * 1.35);
    ctx.quadraticCurveTo(x + r * .4, y - r * 1.75, x + r * 1.2, y - r * .95);
    ctx.quadraticCurveTo(x + r * 1.6, y - r * .1, x + r * 1.35, y + r * .85);
    ctx.quadraticCurveTo(x + r * .9, y + r * 1.6, x - r * 1.3, y + r * 1.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(138, 98, 0, .55)';
    ctx.lineWidth = Math.max(.5, r * .08);
    ctx.beginPath();
    ctx.moveTo(x - r * .55, y - r * 1.3);
    ctx.quadraticCurveTo(x - r * .9, y + r * .1, x - r * .5, y + r * 1.4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .35)';
    ctx.beginPath();
    ctx.ellipse?.(x - r * .25, y - r * 1.05, r * .55, r * .16, -.25, 0, Math.PI * 2);
    ctx.fill();
    const glass = ctx.createLinearGradient?.(x + r * .2, y - r * .7, x + r * 1.3, y + r * .4);
    if (glass) {
      glass.addColorStop(0, '#3d5a63');
      glass.addColorStop(.55, '#142026');
      glass.addColorStop(1, '#0a1114');
      ctx.fillStyle = glass;
    } else ctx.fillStyle = '#142026';
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = Math.max(.7, r * .14);
    ctx.beginPath();
    ctx.moveTo(x + r * .2, y - r * .72);
    ctx.lineTo(x + r * 1.18, y - r * .62);
    ctx.quadraticCurveTo(x + r * 1.38, y - r * .1, x + r * 1.2, y + r * .35);
    ctx.lineTo(x + r * .25, y + r * .3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210, 245, 255, .75)';
    ctx.lineWidth = Math.max(.5, r * .1);
    ctx.beginPath();
    ctx.moveTo(x + r * .45, y - r * .52);
    ctx.lineTo(x + r * .95, y - r * .45);
    ctx.moveTo(x + r * .4, y - r * .3);
    ctx.lineTo(x + r * .62, y - r * .27);
    ctx.stroke();
    ctx.fillStyle = metalGradient(ctx, x + r * .4, y + r * .3, x + r * 1.3, y + r * 1.1, '#3a3a3a', '#0e0e0e');
    ctx.beginPath();
    ctx.moveTo(x + r * .45, y + r * .32);
    ctx.lineTo(x + r * 1.15, y + r * .4);
    ctx.quadraticCurveTo(x + r * 1.3, y + r * .8, x + r * .95, y + r * 1.1);
    ctx.lineTo(x + r * .5, y + r * 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metalGradient(ctx, x + r, y + r * .5, x + r * 1.7, y + r * 1.2, '#4d4d4d', '#121212');
    ctx.beginPath();
    ctx.arc?.(x + r * 1.28, y + r * .82, r * .4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = Math.max(.6, r * .11);
    ctx.beginPath();
    ctx.arc?.(x + r * 1.28, y + r * .82, r * .32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#060606';
    ctx.beginPath();
    ctx.arc?.(x + r * 1.28, y + r * .82, r * .16, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.accessory === 'mohawk') {
    ctx.fillStyle = '#e8322a';
    ctx.strokeStyle = '#7a0f0b';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(x - r * .8, y - r * .6);
    for (let spike = 0; spike < 4; spike++) {
      const sx = x - r * .8 + spike * r * .38;
      ctx.lineTo(sx + r * .14, y - r * (1.15 + (spike % 2) * .12));
      ctx.lineTo(sx + r * .3, y - r * .72);
    }
    ctx.lineTo(x + r * .55, y - r * .55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (skin.accessory === 'tie') {
    ctx.fillStyle = '#c4161c';
    ctx.beginPath();
    ctx.moveTo(x + r * .45, y + r * 1.45);
    ctx.lineTo(x + r * .68, y + r * 1.45);
    ctx.lineTo(x + r * .72, y + r * 3.2);
    ctx.lineTo(x + r * .57, y + r * 3.55);
    ctx.lineTo(x + r * .42, y + r * 3.2);
    ctx.closePath();
    ctx.fill();
  } else if (skin.accessory === 'medals') {
    const colors = ['#ffd34d', '#d9d9d9', '#cd7f32'];
    colors.forEach((color, index) => {
      const mx = x - r * .1 + index * r * .34;
      const my = y + r * 3.1;
      ctx.fillStyle = index === 1 ? '#2b5bd7' : '#c4161c';
      ctx.fillRect(mx - .9, my - r * .38, 1.8, r * .38);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc?.(mx, my + .6, Math.max(1.1, r * .15), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#3c4520';
    ctx.beginPath();
    ctx.moveTo(x - r * 1.05, y - r * .25);
    ctx.lineTo(x - r * .95, y - r * 1.05);
    ctx.lineTo(x + r * .75, y - r * 1.15);
    ctx.lineTo(x + r * .95, y - r * .3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c4161c';
    ctx.fillRect(x - r * 1.02, y - r * .5, r * 1.95, Math.max(1.2, r * .22));
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(x + r * .05, y - r * .9, Math.max(1.2, r * .2), Math.max(1.2, r * .2));
    ctx.fillStyle = '#111';
    ctx.fillRect(x + r * .55, y - r * .3, r * .75, Math.max(1.2, r * .16));
  } else if (skin.accessory === 'welding_mask') {
    ctx.strokeStyle = '#141412';
    ctx.lineWidth = line * 1.4;
    ctx.beginPath();
    ctx.arc?.(x - r * .1, y - r * .05, r * 1.02, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
    ctx.fillStyle = metalGradient(ctx, x, y - r, x + r * 1.2, y + r, '#5a5a52', '#1c1c19');
    ctx.strokeStyle = '#0b0b0a';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(x - r * .15, y - r * 1.0);
    ctx.lineTo(x + r * .95, y - r * .95);
    ctx.quadraticCurveTo(x + r * 1.35, y, x + r * 1.0, y + r * 1.05);
    ctx.lineTo(x - r * .15, y + r * 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const glow = .75 + Math.sin(time / 90) * .15 + Math.sin(time / 37) * .1;
    ctx.fillStyle = metalGradient(ctx, x + r * .3, 0, x + r * 1.1, 0, `rgba(255, 210, 120, ${glow})`, `rgba(255, 90, 10, ${glow})`);
    ctx.shadowColor = '#ff8a1a';
    ctx.shadowBlur = 7;
    ctx.fillRect(x + r * .35, y - r * .32, r * .72, r * .38);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9a968a';
    ctx.fillRect(x + r * .05, y + r * .55, r * .18, r * .18);
    ctx.fillRect(x + r * .05, y - r * .7, r * .18, r * .18);
  } else if (skin.accessory === 'headlamp') {
    const lampX = x + r * .8;
    const lampY = y - r * .65;
    const flicker = .85 + Math.sin(time / 140) * .08;
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient?.(lampX, lampY, lampX + r * 7, lampY);
    if (beam) {
      beam.addColorStop(0, `rgba(255, 240, 180, ${.42 * flicker})`);
      beam.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lampX, lampY - r * .2);
      ctx.lineTo(lampX + r * 7, lampY - r * 2.2);
      ctx.lineTo(lampX + r * 7, lampY + r * 1.9);
      ctx.lineTo(lampX, lampY + r * .2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = metalGradient(ctx, lampX - r * .3, lampY - r * .3, lampX + r * .3, lampY + r * .3, '#e6e2d4', '#5b584f');
    ctx.beginPath();
    ctx.arc?.(lampX, lampY, r * .34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6c8';
    ctx.shadowColor = '#fff1a0';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc?.(lampX + r * .12, lampY, r * .2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.accessory === 'nvg') {
    ctx.strokeStyle = '#111513';
    ctx.lineWidth = line * 1.6;
    ctx.beginPath();
    ctx.moveTo(x - r * .9, y - r * .55);
    ctx.lineTo(x + r * .45, y - r * .45);
    ctx.stroke();
    for (const [offset, depth] of [[-.18, .9], [.12, 1]]) {
      const tubeY = y - r * (.42 - offset);
      ctx.fillStyle = metalGradient(ctx, 0, tubeY - r * .25, 0, tubeY + r * .25, '#4a524e', '#151816');
      ctx.fillRect(x + r * .35, tubeY - r * .24, r * (1.05 * depth), r * .48);
      ctx.fillStyle = 'rgba(255, 255, 255, .25)';
      ctx.fillRect(x + r * .4, tubeY - r * .22, r * .8 * depth, Math.max(.6, r * .07));
    }
    const pulse = .7 + (Math.sin(time / 300) + 1) * .15;
    ctx.fillStyle = `rgba(110, 255, 150, ${pulse})`;
    ctx.shadowColor = '#5dff8a';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc?.(x + r * 1.42, y - r * .3, r * .24, 0, Math.PI * 2);
    ctx.arc?.(x + r * 1.32, y - r * .62, r * .2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.accessory === 'beret') {
    ctx.save();
    ctx.translate(x - r * .1, y - r * .72);
    ctx.rotate(-.18);
    ctx.fillStyle = metalGradient(ctx, -r, -r * .5, r, r * .5, '#e8333d', '#6e0b12');
    ctx.beginPath();
    ctx.ellipse?.(0, 0, r * 1.2, r * .52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a070c';
    ctx.fillRect(-r * 1.05, r * .2, r * 2.1, Math.max(.8, r * .18));
    ctx.restore();
    ctx.fillStyle = '#ffd34d';
    ctx.shadowColor = '#ffd34d';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc?.(x + r * .55, y - r * .78, Math.max(1, r * .2), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const shoulderX = x - r * .35;
    const shoulderY = y + r * 1.75;
    ctx.fillStyle = metalGradient(ctx, 0, shoulderY - r * .2, 0, shoulderY + r * .3, '#ffe28a', '#b07d12');
    ctx.fillRect(shoulderX - r * .75, shoulderY - r * .2, r * 1.5, r * .45);
    ctx.strokeStyle = '#e8b93a';
    ctx.lineWidth = Math.max(.6, r * .1);
    ctx.beginPath();
    for (let fringe = 0; fringe < 5; fringe++) {
      const fx = shoulderX - r * .65 + fringe * r * .32;
      ctx.moveTo(fx, shoulderY + r * .25);
      ctx.lineTo(fx, shoulderY + r * .65);
    }
    ctx.stroke();
  } else if (skin.accessory === 'respirator') {
    ctx.strokeStyle = '#1f2324';
    ctx.lineWidth = line * 1.3;
    ctx.beginPath();
    ctx.moveTo(x - r * .7, y + r * .1);
    ctx.lineTo(x + r * .3, y + r * .3);
    ctx.stroke();
    ctx.fillStyle = metalGradient(ctx, x, y, x + r, y + r, '#6d7477', '#262b2d');
    ctx.beginPath();
    ctx.moveTo(x + r * .2, y + r * .05);
    ctx.quadraticCurveTo(x + r * 1.15, y + r * .05, x + r * 1.1, y + r * .55);
    ctx.quadraticCurveTo(x + r * 1.0, y + r * 1.05, x + r * .3, y + r * .95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = metalGradient(ctx, x + r * .8, y + r * .3, x + r * 1.5, y + r, '#c4cbcd', '#596164');
    ctx.beginPath();
    ctx.arc?.(x + r * 1.15, y + r * .62, r * .42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1f20';
    ctx.beginPath();
    ctx.arc?.(x + r * 1.15, y + r * .62, r * .22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160, 235, 255, .45)';
    ctx.strokeStyle = '#d9dfe0';
    ctx.lineWidth = Math.max(.5, r * .08);
    ctx.beginPath();
    ctx.arc?.(x + r * .62, y - r * .28, r * .3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (skin.accessory === 'plague_mask') {
    ctx.fillStyle = '#0d0b09';
    ctx.beginPath();
    ctx.ellipse?.(x, y - r * .62, r * 2.0, r * .34, -.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metalGradient(ctx, x - r, y - r * 1.8, x + r, y - r * .6, '#2a241e', '#0a0806');
    ctx.fillRect(x - r * .85, y - r * 1.65, r * 1.7, r * 1.05);
    ctx.fillStyle = '#5e1a1a';
    ctx.fillRect(x - r * .85, y - r * .95, r * 1.7, Math.max(1, r * .22));
    ctx.fillStyle = metalGradient(ctx, x + r * .5, y - r * .2, x + r * 2.7, y + r, '#d0b07a', '#5e4630');
    ctx.strokeStyle = '#2b1f14';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(x + r * .55, y - r * .15);
    ctx.quadraticCurveTo(x + r * 1.9, y + r * .05, x + r * 2.75, y + r * 1.05);
    ctx.quadraticCurveTo(x + r * 1.7, y + r * .95, x + r * .55, y + r * .7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(43, 31, 20, .7)';
    ctx.beginPath();
    ctx.moveTo(x + r * 1.1, y + r * .1);
    ctx.lineTo(x + r * 1.0, y + r * .75);
    ctx.stroke();
    const lens = ctx.createRadialGradient?.(x + r * .45, y - r * .25, r * .05, x + r * .5, y - r * .2, r * .38);
    if (lens) {
      lens.addColorStop(0, 'rgba(255, 255, 255, .9)');
      lens.addColorStop(.35, 'rgba(150, 120, 255, .55)');
      lens.addColorStop(1, 'rgba(40, 20, 60, .85)');
      ctx.fillStyle = lens;
    } else ctx.fillStyle = '#7a5fd0';
    ctx.strokeStyle = '#b8892c';
    ctx.lineWidth = Math.max(.6, r * .12);
    ctx.beginPath();
    ctx.arc?.(x + r * .5, y - r * .2, r * .36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (skin.accessory === 'poncho') {
    const wave = (index) => Math.sin(time / 210 + index * 1.3) * r * .22;
    const neckX = x - r * .15;
    const neckY = y + r * 1.15;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(neckX - r * .3, neckY);
    ctx.lineTo(x - r * 2.5, y + r * 4.6 + wave(0));
    ctx.lineTo(x - r * 1.2, y + r * 5.0 + wave(1));
    ctx.lineTo(x + r * .1, y + r * 5.3 + wave(2));
    ctx.lineTo(x + r * 1.3, y + r * 4.9 + wave(3));
    ctx.lineTo(x + r * .75, neckY);
    ctx.closePath();
    ctx.globalAlpha = .94;
    ctx.fillStyle = metalGradient(ctx, x - r * 2.6, 0, x + r * 1.3, 0, '#4a3020', '#9a6a40');
    ctx.fill();
    ctx.clip();
    const stripes = [['#8e3b28', 2.7], ['#b8893f', 3.05], ['#3c4f57', 3.35], ['#b8893f', 3.65], ['#8e3b28', 4.25]];
    for (const [color, offset] of stripes) {
      ctx.fillStyle = color;
      ctx.globalAlpha = .8;
      ctx.fillRect(x - r * 3, y + r * offset + wave(offset), r * 5, Math.max(.7, r * .16));
    }
    ctx.globalAlpha = .35;
    ctx.strokeStyle = '#24160b';
    ctx.lineWidth = Math.max(.6, r * .14);
    ctx.beginPath();
    for (const fold of [-1.7, -.9, -.1, .7]) {
      ctx.moveTo(x + r * fold * .6, neckY + r * .4);
      ctx.lineTo(x + r * fold, y + r * 4.9 + wave(fold));
    }
    ctx.stroke();
    const shade = ctx.createLinearGradient?.(0, neckY, 0, y + r * 5.3);
    if (shade) {
      shade.addColorStop(0, 'rgba(255, 220, 170, .18)');
      shade.addColorStop(1, 'rgba(0, 0, 0, .3)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade;
      ctx.fillRect(x - r * 3, neckY, r * 5, r * 5);
    }
    ctx.restore();
    ctx.strokeStyle = '#3a220f';
    ctx.lineWidth = Math.max(.5, r * .09);
    ctx.beginPath();
    for (let fringe = 0; fringe < 9; fringe++) {
      const t = fringe / 8;
      const fx = x - r * 2.5 + t * r * 3.8;
      const fy = y + r * (4.6 + Math.sin(t * Math.PI) * .7) + wave(fringe * .4);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - r * .1, fy + r * .45);
    }
    ctx.stroke();
    const flutter = Math.sin(time / 160) * r * .5;
    ctx.fillStyle = metalGradient(ctx, x - r * 3, 0, x, 0, '#7a2a18', '#c4522f');
    ctx.beginPath();
    ctx.moveTo(x - r * .5, y + r * .9);
    ctx.quadraticCurveTo(x - r * 2.0, y + r * 1.0 + flutter, x - r * 3.4, y + r * 1.4 + flutter * 1.4);
    ctx.lineTo(x - r * 3.3, y + r * 1.85 + flutter * 1.4);
    ctx.quadraticCurveTo(x - r * 1.9, y + r * 1.5 + flutter, x - r * .45, y + r * 1.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c4522f';
    ctx.fillRect(x - r * .55, y + r * .9, r * 1.35, r * .55);
  }
  ctx.restore();
}

function drawSkinEffect(ctx, skin, width, height, time) {
  if (!skin.effect) return;
  ctx.save();
  if (skin.effect === 'sparkle') {
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = 1;
    for (let index = 0; index < 5; index++) {
      const phase = (time / 700 + particleRandom(index + 1)) % 1;
      const size = Math.sin(phase * Math.PI) * 3.5;
      if (size < .4) continue;
      const px = (particleRandom(index + 11) - .5) * width * 1.3;
      const py = -height * (.15 + particleRandom(index + 21) * .8);
      ctx.globalAlpha = Math.sin(phase * Math.PI);
      ctx.beginPath();
      ctx.moveTo(px - size, py); ctx.lineTo(px + size, py);
      ctx.moveTo(px, py - size); ctx.lineTo(px, py + size);
      ctx.stroke();
    }
  } else if (skin.effect === 'embers' || skin.effect === 'radiation' || skin.effect === 'embers_fire' || skin.effect === 'bio') {
    const color = { embers: '#c38bff', radiation: '#6dff9a', embers_fire: '#ff8a2a', bio: '#9dff6a' }[skin.effect];
    const count = skin.effect === 'embers_fire' ? 11 : 7;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    for (let index = 0; index < count; index++) {
      const phase = (time / (1_400 + index * 90) + particleRandom(index + 3)) % 1;
      const px = (particleRandom(index + 7) - .5) * width * 1.1 + Math.sin(time / 300 + index) * 2;
      const py = -height * phase;
      ctx.globalAlpha = (1 - phase) * .85;
      if (skin.effect === 'bio') {
        ctx.beginPath();
        ctx.arc?.(px, py, 1.2 + particleRandom(index + 30) * 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(px, py, 2, 2);
    }
    if (skin.effect === 'radiation') {
      ctx.globalAlpha = .35 + Math.sin(time / 300) * .15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse?.(0, -1, width * .55, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (skin.effect === 'sparks') {
    const originX = width * .32;
    const originY = -height * .5;
    ctx.lineWidth = 1;
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 5;
    for (let index = 0; index < 9; index++) {
      const phase = (time / 520 + particleRandom(index + 200)) % 1;
      const angle = -Math.PI * (.15 + particleRandom(index + 210) * .7);
      const speed = width * (.5 + particleRandom(index + 220) * .9);
      const px = originX + Math.cos(angle) * speed * phase;
      const py = originY + Math.sin(angle) * speed * phase + height * .35 * phase * phase;
      ctx.globalAlpha = 1 - phase;
      ctx.strokeStyle = phase < .4 ? '#fff4c2' : '#ff8a1a';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(angle) * 3, py - Math.sin(angle) * 3);
      ctx.stroke();
    }
  } else if (skin.effect === 'smoke' || skin.effect === 'incense' || skin.effect === 'dust') {
    const style = { smoke: ['#120808', .35, .1], incense: ['#8c6cc8', .28, .55], dust: ['#b8936a', .32, .02] }[skin.effect];
    for (let index = 0; index < 6; index++) {
      const phase = (time / 1_800 + particleRandom(index + 5)) % 1;
      const px = (particleRandom(index + 9) - .5) * width * 1.4 - phase * (skin.effect === 'dust' ? 14 : -6);
      const py = -height * style[2] - phase * height * (skin.effect === 'dust' ? .15 : .5);
      ctx.globalAlpha = (1 - phase) * style[1];
      ctx.fillStyle = style[0];
      ctx.beginPath();
      ctx.arc?.(px, py, 2 + phase * (skin.effect === 'dust' ? 4 : 7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

const BEHIND_EFFECTS = new Set(['smoke', 'dust']);

function drawSkinnedActor(ctx, image, crop, width, height, skin, time) {
  const sprite = renderSkinnedSprite(image, crop, skin, width, height, time);
  if (BEHIND_EFFECTS.has(skin.effect)) drawSkinEffect(ctx, skin, width, height, time);
  ctx.save();
  if (skin.aura) {
    ctx.shadowColor = skin.aura.color;
    ctx.shadowBlur = skin.aura.blur * (skin.aura.pulse ? .65 + (Math.sin(time / 320) + 1) * .25 : 1);
  }
  ctx.drawImage(sprite, -width / 2, -height, width, height);
  ctx.restore();
  const anchor = findHeadAnchor(image, crop);
  if (skin.accessory) drawSkinAccessory(ctx, skin, { x: -width / 2 + anchor.x * width, y: -height + anchor.y * height, r: anchor.r * height }, time);
  if (!BEHIND_EFFECTS.has(skin.effect)) drawSkinEffect(ctx, skin, width, height, time);
}

// Vitrine do guarda-roupa: o presidente andando com a vestimenta aplicada.
export function drawSkinPreview(ctx, { assets, presidentClass = null, skinId = 'default', time = 0, width = 120, height = 150 } = {}) {
  ctx.clearRect(0, 0, width, height);
  const backdrop = ctx.createLinearGradient?.(0, 0, 0, height);
  if (backdrop) {
    backdrop.addColorStop(0, '#1d2420');
    backdrop.addColorStop(1, '#0c100e');
    ctx.fillStyle = backdrop;
  } else ctx.fillStyle = '#111a16';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 176, 0, .18)';
  ctx.fillRect(0, height - 14, width, 2);
  drawPresident(ctx, { x: width / 2, y: height - 13, vx: 40, facing: 1, role: 'president' }, assets,
    { presidentClass, equippedSkin: skinId, time, placement: { height: height * .74 } });
}

export function drawActorSprite(ctx, actor, image, time = 0, placement = { height: ROOM_HEIGHT * .55 }, filter = 'none', skin = null) {
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
  if (skin && skin.id !== 'default' && image && crop && typeof document !== 'undefined') {
    drawSkinnedActor(ctx, image, crop, width, height, skin, time);
  } else {
    ctx.filter = filter;
    drawOrMissing(ctx, image, -width / 2, -height, width, height, crop);
  }
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
  return drawActorSprite(ctx, { ...actor, role, currentState }, image, time, placement, filter, skin);
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
  presidentClass = null, equippedSkin = 'default', weather = 'clear' }) {
  renderSurface(ctx, camera, assets, { isNight, time, weather });
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
