import { cellCenter, FLOOR_SPACING, ROOM_HEIGHT, SLOT_WIDTH, WORLD_LEFT, WORLD_TOP } from './shelter_engine.js';
import { renderLootboxOverlay } from './lootbox_renderer.js';
import { renderOilField, renderOilFieldOverlay } from './oil_renderer.js';
import { renderFort, renderFortOverlay } from './defense_renderer.js';
import { DOG_HEIGHT, drawDog, warmDogFrames } from './dog_renderer.js';
import { gradeStructure } from './art.js';
import { renderMarket, renderMarketOverlay } from './market_renderer.js';
import { getPresidentClass, getSkin } from './player_state.js';
import { hasReliableNightPower } from './environment.js';
import { getCriticalNeeds, NEED_CRITICAL_THRESHOLD, NEED_ICONS, NEED_KEYS, NEED_LABELS, normalizeNeeds } from './needs.js';
import { translateUiText } from './i18n.js';

const SURFACE_Y = WORLD_TOP - 30;
const ATLAS_CELLS = Object.freeze({
  vault: [0, 0], elevator: [1, 0], dormitory: [2, 0],
  generator: [0, 1], greenhouse: [1, 1], arsenal: [2, 1],
  medical: [0, 2], radiation_clinic: [0, 2], radio: [1, 2], office: [2, 2], presidential_suite: [2, 2],
});
const ROOM_AMBIENT_LIGHTS = Object.freeze({
  medical: Object.freeze(['rgba(200, 240, 255, .3)', 'rgba(200, 240, 255, .12)']),
  laboratory: Object.freeze(['rgba(100, 255, 100, .2)', 'rgba(100, 255, 100, .08)']),
  radiation_clinic: Object.freeze(['rgba(120, 255, 110, .3)', 'rgba(120, 255, 110, .1)']),
  life_support: Object.freeze(['rgba(150, 225, 255, .2)', 'rgba(100, 190, 225, .08)']),
});
const NPC_ROWS = Object.freeze({ resident: 0, engineer: 0, scientist: 1, medic: 2, guard: 3 });
const frameBoundsCache = new WeakMap();
const dirtPatternCache = new WeakMap();
const proceduralRoomFrameCache = new Map();
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
  // Forte externo em alta fidelidade; a guarnição continua renderizada por cima.
  surface_fort: './assets/img/surface_fort.png',
  loot_crate: './assets/img/loot_crate.svg',
  // Arte pintada opcional: quando o arquivo existe ele substitui o desenho em codigo; sem ele o jogo usa o desenho.
  layd_sheet: './assets/img/layd_sheet.png',
  dark_market_stall: './assets/img/dark_market_stall.png',
  dark_market_merchant: './assets/img/dark_market_merchant.png',
  room_radiation_clinic: './assets/img/room_radiation_clinic.png',
  cover_art: './assets/img/cover_art.png',
});

export const OPTIONAL_ASSETS = Object.freeze(new Set(['room_laboratory', 'room_life_support', 'room_radiation_clinic',
  'layd_sheet', 'dark_market_stall', 'dark_market_merchant', 'cover_art']));

// A arte pintada nova vem em alta resolucao (ate 1900px) mas aparece pequena na tela. Reduzir uma vez ao carregar
// evita redimensionar milhares de pixels a cada quadro (cada sala grande custava ~2ms de desenho).
const PRESCALE = Object.freeze({
  room_laboratory: { width: 700 }, room_life_support: { width: 700 }, room_radiation_clinic: { width: 700 },
  dark_market_stall: { width: 700 }, dark_market_merchant: { height: 320 }, layd_sheet: { width: 960 },
  // Arte original: tambem aparece bem menor na tela do que o arquivo. Os fundos viram do tamanho exato em que sao desenhados.
  bg_sky: { width: 1400, height: 540 }, bg_mountains: { width: 1400, height: 260 }, fg_wasteland: { width: 1600, height: 210 },
  room_atlas: { width: 1200 }, room_base_empty: { width: 1000 }, plant_prop_1: { width: 700 }, uv_light_prop: { width: 600 },
  elevator_cabin: { height: 360 }, npc_walk_sheet: { width: 1000 }, character_sheet: { width: 900 },
});

export function prescaleImage(image, limit) {
  if (typeof document === 'undefined' || !limit || !image?.width || !image?.height) return image;
  const scaleX = limit.width ? limit.width / image.width : limit.height / image.height;
  const scaleY = limit.width && limit.height ? limit.height / image.height : scaleX;
  if (!(scaleX < 1 || scaleY < 1)) return image;
  let source = image;
  let width = image.width;
  let height = image.height;
  const targetWidth = Math.max(1, Math.round(image.width * Math.min(1, scaleX)));
  const targetHeight = Math.max(1, Math.round(image.height * Math.min(1, scaleY)));
  // Reducao em passos de metade: mantem a nitidez que um unico passo grande perderia.
  while (width / 2 > targetWidth || height / 2 > targetHeight) {
    width = Math.max(targetWidth, Math.ceil(width / 2));
    height = Math.max(targetHeight, Math.ceil(height / 2));
    const step = document.createElement('canvas');
    step.width = width;
    step.height = height;
    const stepContext = step.getContext('2d');
    if (!stepContext) return image;
    stepContext.drawImage(source, 0, 0, width, height);
    source = step;
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) return image;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  return canvas;
}

export class AssetManager {
  constructor(urls = DEFAULT_ASSETS, ImageClass = globalThis.Image) {
    this.urls = { ...urls };
    this.ImageClass = ImageClass;
    this.images = new Map();
    this.failedKeys = [];
  }

  async preload() {
    if (this.preloadPromise) return this.preloadPromise;
    this.failedKeys = [];
    this.preloadPromise = Promise.all(Object.entries(this.urls).map(([key, url]) => new Promise((resolve) => {
      if (!this.ImageClass || !url) { if (!OPTIONAL_ASSETS.has(key)) this.failedKeys.push(key); resolve(); return; }
      const image = new this.ImageClass();
      image.onload = () => { this.images.set(key, prescaleImage(image, PRESCALE[key])); resolve(); };
      image.onerror = () => { if (!OPTIONAL_ASSETS.has(key)) this.failedKeys.push(key); resolve(); };
      image.src = url;
    })));
    await this.preloadPromise;
    return this;
  }

  getImage(key) { return this.images.get(key) ?? null; }
}

// O dashboard recria o controlador do Vault quando um modal ou uma ação muda
// o estado. Reutilizar o mesmo preload evita baixar e reduzir dezenas de PNGs
// novamente a cada clique.
const SHARED_ASSET_MANAGERS = new Map();

export function getSharedAssetManager(urls = DEFAULT_ASSETS) {
  const manifest = Object.entries(urls).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify(manifest);
  let manager = SHARED_ASSET_MANAGERS.get(key);
  if (!manager) {
    manager = new AssetManager(urls);
    SHARED_ASSET_MANAGERS.set(key, manager);
  }
  return manager;
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

function renderSurface(ctx, camera, assets, { isNight = false, time = 0, weather = 'clear', lowQuality = false } = {}) {
  const boundary = SURFACE_Y + camera.offset_y;
  if (boundary <= 0) return;
  drawRepeatingLayer(ctx, assets.getImage('bg_sky'), camera.offset_x * .08, boundary - 520, 1400, 540);
  drawRepeatingLayer(ctx, assets.getImage('bg_mountains'), camera.offset_x * .2, boundary - 230, 1400, 260);
  drawRepeatingLayer(ctx, assets.getImage('fg_wasteland'), camera.offset_x, boundary - 180, 1600, 210);
  if (isNight) renderNightSurface(ctx, camera, boundary, time, { overcast: weather !== 'clear' });
  if (weather !== 'clear') renderWeather(ctx, camera, boundary, time, weather, lowQuality);
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

const DUST_BUCKETS = Object.freeze([[], [], []].map((bucket, index) => WEATHER_PARTICLES.filter((particle) => (particle.size < .34 ? 0 : particle.size < .67 ? 1 : 2) === index)));
const DUST_COLORS = Object.freeze(['rgba(208, 136, 70, .26)', 'rgba(220, 148, 70, .38)', 'rgba(232, 160, 70, .52)']);

// Qualidade baixa (ativada sozinha quando o jogo roda abaixo de ~24 quadros por segundo): o clima vira so uma
// tinta por cima do ceu, sem particulas, raios nem poças, para nao pesar em computadores mais fracos.
const WEATHER_TINTS = Object.freeze({ dust: 'rgba(168, 98, 42, .5)', acid_rain: 'rgba(58, 104, 52, .3)', radstorm: 'rgba(38, 86, 52, .5)' });

export function renderWeather(ctx, camera, boundary, time, weather, low = false) {
  const width = ctx.canvas.width;
  const height = Math.min(boundary, ctx.canvas.height);
  if (height <= 0) return;
  if (low) {
    ctx.fillStyle = WEATHER_TINTS[weather] ?? 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, width, height);
    return;
  }
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
    // Tres faixas de tamanho: cada faixa e um unico caminho preenchido de uma vez (antes eram 140 preenchimentos).
    DUST_BUCKETS.forEach((bucket, index) => {
      ctx.fillStyle = DUST_COLORS[index];
      ctx.beginPath();
      for (const particle of bucket) {
        const x = ((particle.x * (width + 80) + time * .45 * particle.speed + drift) % (width + 80) + width + 80) % (width + 80) - 40;
        const y = particle.y * height + Math.sin(time / 300 + particle.x * 20) * 3;
        ctx.rect(x, y, 3 + particle.size * 9, 1 + Math.round(particle.size * 1.4));
      }
      ctx.fill();
    });
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
    // Um tom verde escuro por cima (parecido com o multiply de antes, mas sem a mistura cara em tela cheia).
    ctx.fillStyle = 'rgba(38, 86, 52, .46)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(80, 255, 130, .1)';
    ctx.fillRect(0, 0, width, height);
    const strike = Math.floor(time / 4_200);
    if (time % 4_200 < 160) {
      ctx.fillStyle = 'rgba(205, 255, 215, .38)';
      ctx.fillRect(0, 0, width, height);
      const hash = (seed) => ((Math.sin((strike + seed) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      let boltX = width * (.15 + hash(1) * .7);
      // O brilho do raio e um traco largo e transparente por baixo do traco fino (shadowBlur custava caro a cada quadro).
      ctx.beginPath();
      ctx.moveTo(boltX, 0);
      for (let segment = 1; segment <= 7; segment++) {
        boltX += (hash(segment + 2) - .5) * 46;
        ctx.lineTo(boltX, height * .62 * segment / 7);
      }
      ctx.strokeStyle = 'rgba(109, 255, 154, .35)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = '#e9ffe9';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160, 255, 170, .5)';
    ctx.beginPath();
    for (const particle of WEATHER_PARTICLES.slice(0, 50)) {
      const y = (particle.y * height + time * .08 * particle.speed) % height;
      const x = ((particle.x * width + Math.sin(time / 900 + particle.size * 6) * 12 + drift) % width + width) % width;
      ctx.rect(x, y, 2, 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

function renderDirt(ctx, camera, assets) {
  const top = Math.max(0, SURFACE_Y + camera.offset_y);
  if (top >= ctx.canvas.height) return;
  const image = assets.getImage('dirt_texture');
  // Criar um CanvasPattern em toda frame e caro em mapas grandes. O padrao so muda quando a textura muda.
  let cached = dirtPatternCache.get(ctx);
  if (!cached || cached.image !== image) {
    cached = { image, pattern: image && ctx.createPattern?.(image, 'repeat') };
    dirtPatternCache.set(ctx, cached);
  }
  const pattern = cached.pattern;
  if (pattern?.setTransform && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().translate(camera.offset_x, camera.offset_y));
  }
  ctx.fillStyle = pattern || '#ff00ff';
  ctx.fillRect(0, top, ctx.canvas.width, ctx.canvas.height - top);
}

function isWorldAreaVisible(ctx, camera, x, y, width, height, padding = 72) {
  const canvas = ctx.canvas;
  if (!canvas) return true;
  const left = -camera.offset_x - padding;
  const top = -camera.offset_y - padding;
  const right = left + canvas.width + padding * 2;
  const bottom = top + canvas.height + padding * 2;
  return x + width >= left && x <= right && y + height >= top && y <= bottom;
}

// As salas montadas em Canvas (quando a arte final ainda nao existe) sao caras. Atualiza as animacoes
// a 10 FPS e reaproveita o quadro entre frames; o movimento geral continua a 60 FPS.
function renderCachedProceduralInterior(ctx, key, x, y, time, draw) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    draw(ctx, x, y, time);
    return;
  }
  const frame = Math.floor(time / 100);
  let cached = proceduralRoomFrameCache.get(key);
  if (!cached || cached.frame !== frame) {
    const canvas = cached?.canvas ?? document.createElement('canvas');
    if (canvas.width !== SLOT_WIDTH) canvas.width = SLOT_WIDTH;
    if (canvas.height !== ROOM_HEIGHT) canvas.height = ROOM_HEIGHT;
    const buffer = canvas.getContext?.('2d');
    if (!buffer) {
      draw(ctx, x, y, time);
      return;
    }
    buffer.clearRect(0, 0, SLOT_WIDTH, ROOM_HEIGHT);
    draw(buffer, 0, 0, frame * 100);
    gradeStructure(canvas, frame % 7);
    cached = { canvas, frame };
    proceduralRoomFrameCache.set(key, cached);
  }
  ctx.drawImage(cached.canvas, x, y, SLOT_WIDTH, ROOM_HEIGHT);
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
    // Sem arte dedicada, o laboratorio e montado por cima da sala base.
    if (!laboratory) renderCachedProceduralInterior(ctx, 'laboratory', x, y, time, renderLaboratoryInterior);
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
    // A arte pintada já contém as ventoinhas, tubagens e iluminação da sala.
    // Não desenhe uma segunda camada por cima: além de duplicar os elementos,
    // isso fazia as ventoinhas parecerem flutuar/animação sobre a imagem realista.
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
  if (room.type === 'radiation_clinic' && !individual) renderCachedProceduralInterior(ctx, 'radiation_clinic', x, y, time, renderRadiationClinicDetails);
  renderRoomAmbientLight(ctx, room, x, y);
}

// Sala de Tratamento de Radiacao: o Centro Medico ganha placa de risco, contador Geiger, mesa forrada de chumbo e geladeira de vacinas.
function renderRadiationClinicDetails(ctx, x, y, time = 0) {
  const floorY = y + ROOM_HEIGHT - 14;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8);
  ctx.clip();
  // Placa de risco na parede.
  const signX = x + SLOT_WIDTH - 52;
  const signY = y + 40;
  ctx.fillStyle = '#e8c53a';
  ctx.beginPath();
  ctx.moveTo(signX, signY - 22);
  ctx.lineTo(signX + 22, signY + 16);
  ctx.lineTo(signX - 22, signY + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1a1408';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#1a1408';
  ctx.beginPath();
  ctx.arc(signX, signY + 1, 2.6, 0, Math.PI * 2);
  ctx.fill();
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(signX, signY + 1);
    ctx.arc(signX, signY + 1, 9, a - .5, a + .5);
    ctx.closePath();
    ctx.fill();
  }
  // Mesa de exame forrada de chumbo, com manta de cachorro.
  const tableX = x + 38;
  ctx.fillStyle = '#5c646a';
  ctx.fillRect(tableX, floorY - 34, 92, 9);
  ctx.fillStyle = '#2f3438';
  ctx.fillRect(tableX + 8, floorY - 25, 6, 25);
  ctx.fillRect(tableX + 78, floorY - 25, 6, 25);
  ctx.fillStyle = '#8a4a3a';
  ctx.fillRect(tableX + 6, floorY - 40, 60, 7);
  ctx.fillStyle = 'rgba(255, 220, 190, .5)';
  for (const px of [18, 30, 42, 54]) {
    ctx.beginPath();
    ctx.arc(tableX + px, floorY - 37, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Geladeira de vacinas com luz azul.
  const fridgeX = x + 150;
  ctx.fillStyle = '#b7c3c8';
  ctx.fillRect(fridgeX, floorY - 52, 34, 52);
  ctx.strokeStyle = '#1a2224';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(fridgeX + .5, floorY - 51.5, 33, 51);
  ctx.fillStyle = 'rgba(120, 190, 255, .55)';
  ctx.fillRect(fridgeX + 5, floorY - 44, 24, 22);
  ctx.fillStyle = '#e8f4ff';
  for (const vy of [-40, -33, -26]) ctx.fillRect(fridgeX + 9, floorY + vy, 16, 3);
  // Contador Geiger piscando.
  const blink = Math.sin(time / 140) > .3;
  ctx.fillStyle = '#1b2a1b';
  ctx.fillRect(x + 196, floorY - 46, 24, 18);
  ctx.fillStyle = blink ? '#7bff6a' : '#2f6a2a';
  ctx.fillRect(x + 200, floorY - 42, 16, 4);
  ctx.fillStyle = '#e8c53a';
  ctx.fillRect(x + 200, floorY - 35, 7, 3);
  ctx.restore();
}

// Laboratorio desenhado sobre a sala base: azulejos clinicos, tanque de especime, terminal, bancada com vidraria,
// quadro de formulas e servidor. Tudo animado pelo tempo (bolhas, dados correndo, LEDs, vapor).
function renderLaboratoryInterior(ctx, x, y, time = 0) {
  const floorY = y + ROOM_HEIGHT - 14;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, SLOT_WIDTH - 8, ROOM_HEIGHT - 8);
  ctx.clip();

  // Parede de azulejos claros, com luz fria de laboratorio.
  ctx.fillStyle = 'rgba(196, 226, 230, .32)';
  ctx.fillRect(x + 4, y + 14, SLOT_WIDTH - 8, floorY - y - 14);
  ctx.strokeStyle = 'rgba(60, 90, 96, .35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let tileY = y + 22; tileY < floorY - 30; tileY += 10) { ctx.moveTo(x + 4, tileY); ctx.lineTo(x + SLOT_WIDTH - 4, tileY); }
  for (let tileX = x + 12; tileX < x + SLOT_WIDTH - 4; tileX += 12) { ctx.moveTo(tileX, y + 14); ctx.lineTo(tileX, floorY - 34); }
  ctx.stroke();
  ctx.fillStyle = '#2f4a4e';
  ctx.fillRect(x + 4, floorY - 34, SLOT_WIDTH - 8, 3);

  // Calha de luz fluorescente no teto.
  ctx.fillStyle = '#2a3133';
  ctx.fillRect(x + 72, y + 13, 120, 6);
  ctx.fillStyle = '#eafcff';
  ctx.fillRect(x + 76, y + 18, 112, 3);
  const glow = ctx.createLinearGradient(0, y + 20, 0, y + 70);
  glow.addColorStop(0, 'rgba(210, 250, 255, .32)');
  glow.addColorStop(1, 'rgba(210, 250, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x + 50, y + 20, 164, 50);

  // Tanque de especime: cilindro de vidro com liquido verde, organismo e bolhas subindo.
  const tankX = x + 14;
  const tankTop = y + 30;
  const tankBottom = floorY - 6;
  const liquid = ctx.createLinearGradient(tankX, 0, tankX + 34, 0);
  liquid.addColorStop(0, 'rgba(40, 160, 90, .85)');
  liquid.addColorStop(.5, 'rgba(110, 255, 150, .9)');
  liquid.addColorStop(1, 'rgba(30, 130, 80, .85)');
  ctx.fillStyle = liquid;
  ctx.fillRect(tankX + 2, tankTop + 6, 30, tankBottom - tankTop - 12);
  ctx.fillStyle = 'rgba(20, 60, 40, .75)';
  ctx.beginPath();
  ctx.ellipse(tankX + 17, tankTop + 52 + Math.sin(time / 900) * 3, 7, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(tankX + 15, tankTop + 64 + Math.sin(time / 900) * 3, 4, 18);
  ctx.fillStyle = 'rgba(220, 255, 230, .8)';
  for (let bubble = 0; bubble < 6; bubble++) {
    const phase = (time / (1_400 + bubble * 170) + bubble * .37) % 1;
    const bubbleY = tankBottom - 10 - phase * (tankBottom - tankTop - 22);
    const bubbleX = tankX + 8 + (bubble * 7) % 20 + Math.sin(time / 300 + bubble) * 2;
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, 1.2 + (bubble % 3) * .6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, .28)';
  ctx.fillRect(tankX + 5, tankTop + 8, 3, tankBottom - tankTop - 16);
  ctx.fillStyle = '#5c6669';
  ctx.fillRect(tankX - 2, tankTop, 38, 7);
  ctx.fillRect(tankX - 2, tankBottom - 6, 38, 7);
  ctx.fillStyle = '#8b979a';
  ctx.fillRect(tankX - 2, tankTop, 38, 2);
  ctx.strokeStyle = '#3a4447';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tankX + 17, tankTop);
  ctx.lineTo(tankX + 17, y + 14);
  ctx.stroke();
  const tankGlow = ctx.createRadialGradient(tankX + 17, tankTop + 50, 4, tankX + 17, tankTop + 50, 48);
  tankGlow.addColorStop(0, 'rgba(110, 255, 150, .3)');
  tankGlow.addColorStop(1, 'rgba(110, 255, 150, 0)');
  ctx.fillStyle = tankGlow;
  ctx.fillRect(tankX - 32, tankTop, 100, tankBottom - tankTop);

  // Terminal na parede com dados correndo e um grafico de onda.
  const screenX = x + 62;
  const screenY = y + 32;
  ctx.fillStyle = '#1c2224';
  ctx.fillRect(screenX - 3, screenY - 3, 58, 42);
  ctx.fillStyle = '#04150c';
  ctx.fillRect(screenX, screenY, 52, 36);
  ctx.fillStyle = 'rgba(80, 255, 140, .85)';
  const scroll = Math.floor(time / 180);
  for (let line = 0; line < 4; line++) {
    const length = 8 + ((scroll + line * 7) * 13) % 30;
    ctx.fillRect(screenX + 3, screenY + 4 + line * 4, length, 1.5);
  }
  ctx.strokeStyle = 'rgba(120, 220, 255, .9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let px = 0; px <= 46; px += 2) {
    const wave = Math.sin(px / 4 + time / 220) * 4 + Math.sin(px / 1.7 + time / 90) * 1.5;
    if (px === 0) ctx.moveTo(screenX + 3 + px, screenY + 27 + wave); else ctx.lineTo(screenX + 3 + px, screenY + 27 + wave);
  }
  ctx.stroke();

  // Quadro com formulas e uma helice de DNA.
  const boardX = x + 130;
  const boardY = y + 30;
  ctx.fillStyle = '#e8eee9';
  ctx.fillRect(boardX, boardY, 62, 38);
  ctx.strokeStyle = '#7b8582';
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, boardY, 62, 38);
  ctx.fillStyle = '#1d4fa8';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText?.('E=mc²', boardX + 4, boardY + 4);
  ctx.fillStyle = '#b3261e';
  ctx.fillText?.('Rad↓0.3', boardX + 4, boardY + 15);
  ctx.fillStyle = '#37474f';
  ctx.fillText?.('∑ n²', boardX + 4, boardY + 26);
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 1.2;
  for (const offset of [0, Math.PI]) {
    ctx.beginPath();
    for (let step = 0; step <= 30; step++) {
      const px = boardX + 52 + Math.sin(step / 5 + offset) * 5;
      const py = boardY + 4 + step;
      if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(46, 125, 50, .6)';
  ctx.beginPath();
  for (let rung = 2; rung < 30; rung += 5) {
    ctx.moveTo(boardX + 52 + Math.sin(rung / 5) * 5, boardY + 4 + rung);
    ctx.lineTo(boardX + 52 + Math.sin(rung / 5 + Math.PI) * 5, boardY + 4 + rung);
  }
  ctx.stroke();

  // Simbolo de risco biologico.
  ctx.fillStyle = '#f2c230';
  ctx.beginPath();
  ctx.moveTo(boardX + 72, boardY + 4);
  ctx.lineTo(boardX + 86, boardY + 28);
  ctx.lineTo(boardX + 58 + 0, boardY + 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText?.('☣', boardX + 72, boardY + 13);

  // Bancada de trabalho com armarios.
  const benchY = floorY - 32;
  ctx.fillStyle = '#d9e2e3';
  ctx.fillRect(x + 56, benchY, 150, 6);
  ctx.fillStyle = '#6f7d80';
  ctx.fillRect(x + 56, benchY + 6, 150, 2);
  ctx.fillStyle = '#4d5a5d';
  ctx.fillRect(x + 60, benchY + 8, 142, floorY - benchY - 8);
  ctx.strokeStyle = '#2c3537';
  ctx.lineWidth = 1;
  for (const doorX of [x + 60, x + 96, x + 132, x + 168]) ctx.strokeRect(doorX + 2, benchY + 11, 32, floorY - benchY - 14);
  ctx.fillStyle = '#b8c4c6';
  for (const doorX of [x + 60, x + 96, x + 132, x + 168]) ctx.fillRect(doorX + 15, benchY + 14, 6, 2);

  // Vidraria: frascos Erlenmeyer coloridos, um borbulhando com vapor, e uma estante de tubos.
  const flasks = [[x + 70, '#4fc3f7'], [x + 86, '#e040fb'], [x + 150, '#ffb300']];
  flasks.forEach(([fx, color], index) => {
    ctx.fillStyle = 'rgba(230, 245, 250, .55)';
    ctx.beginPath();
    ctx.moveTo(fx - 1, benchY - 22);
    ctx.lineTo(fx + 3, benchY - 22);
    ctx.lineTo(fx + 3, benchY - 14);
    ctx.lineTo(fx + 9, benchY);
    ctx.lineTo(fx - 7, benchY);
    ctx.lineTo(fx - 1, benchY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx - 4, benchY - 7);
    ctx.lineTo(fx + 6, benchY - 7);
    ctx.lineTo(fx + 9, benchY);
    ctx.lineTo(fx - 7, benchY);
    ctx.closePath();
    ctx.fill();
    if (index === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, .7)';
      for (let bubble = 0; bubble < 3; bubble++) {
        const phase = (time / 500 + bubble / 3) % 1;
        ctx.beginPath();
        ctx.arc(fx + 1 + (bubble - 1) * 2, benchY - 2 - phase * 6, .9, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let puff = 0; puff < 3; puff++) {
        const phase = (time / 1_300 + puff / 3) % 1;
        ctx.fillStyle = `rgba(230, 160, 255, ${.35 * (1 - phase)})`;
        ctx.beginPath();
        ctx.arc(fx + 1 + Math.sin(time / 400 + puff) * 3, benchY - 24 - phase * 18, 2 + phase * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  ctx.fillStyle = '#7a8689';
  ctx.fillRect(x + 104, benchY - 4, 26, 4);
  ['#ff5252', '#69f0ae', '#40c4ff', '#ffd740'].forEach((color, index) => {
    const tubeX = x + 107 + index * 6;
    ctx.fillStyle = 'rgba(230, 245, 250, .6)';
    ctx.fillRect(tubeX, benchY - 16, 3, 12);
    ctx.fillStyle = color;
    ctx.fillRect(tubeX, benchY - 9, 3, 5);
  });

  // Microscopio.
  const microX = x + 176;
  ctx.fillStyle = '#2b3335';
  ctx.fillRect(microX - 7, benchY - 3, 16, 3);
  ctx.fillRect(microX + 4, benchY - 18, 3, 15);
  ctx.fillStyle = '#e0e6e7';
  ctx.save();
  ctx.translate(microX + 3, benchY - 20);
  ctx.rotate(-.5);
  ctx.fillRect(-2, -10, 5, 14);
  ctx.restore();
  ctx.fillStyle = '#2b3335';
  ctx.fillRect(microX - 3, benchY - 9, 9, 2);

  // Servidor com LEDs piscando.
  const rackX = x + 214;
  ctx.fillStyle = '#20272a';
  ctx.fillRect(rackX, y + 34, 38, floorY - y - 34);
  ctx.strokeStyle = '#3c474a';
  ctx.strokeRect(rackX + 1, y + 35, 36, floorY - y - 36);
  for (let slot = 0; slot < 8; slot++) {
    const slotY = y + 40 + slot * 10;
    ctx.fillStyle = '#2d363a';
    ctx.fillRect(rackX + 4, slotY, 30, 7);
    for (let led = 0; led < 3; led++) {
      const on = Math.sin(time / (160 + led * 70) + slot * 1.7 + led) > .1;
      ctx.fillStyle = on ? (led === 2 ? '#ff5252' : '#69f0ae') : '#1b2224';
      ctx.fillRect(rackX + 7 + led * 5, slotY + 2, 3, 3);
    }
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
    const opaque = (x, y) => pixels[(y * buffer.width + x) * 4 + 3] >= 24;
    // Pedacos de personagens vizinhos invadem a celula (ex.: um capacete da fileira de baixo);
    // fica so o maior bloco continuo de linhas opacas, que e o personagem do quadro.
    let runStart = -1, bestStart = 0, bestEnd = -1;
    for (let y = 0; y <= buffer.height; y++) {
      let filled = false;
      for (let x = 0; y < buffer.height && x < buffer.width && !filled; x++) filled = opaque(x, y);
      if (filled && runStart < 0) runStart = y;
      if (!filled && runStart >= 0) {
        if (y - runStart > bestEnd - bestStart + 1) { bestStart = runStart; bestEnd = y - 1; }
        runStart = -1;
      }
    }
    let minX = buffer.width, minY = buffer.height, maxX = -1, maxY = -1;
    for (let y = bestStart; y <= bestEnd; y++) {
      for (let x = 0; x < buffer.width; x++) {
        if (!opaque(x, y)) continue;
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
  if (room.floor < 0) {
    const surfaceInner = ROOM_HEIGHT - ROOM_CEILING_THICKNESS - ROOM_FLOOR_THICKNESS;
    return { innerHeight: surfaceInner, height: surfaceInner * .55, floorY: (liftY ?? SURFACE_Y) + ELEVATOR_SPRITE_FOOT_OFFSET };
  }
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
  if (NEW_ACCESSORIES[skin.accessory]) {
    NEW_ACCESSORIES[skin.accessory](ctx, head, time);
  } else if (skin.accessory === 'crown') {
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
  } else if (skin.accessory === 'laurel') {
    // Coroa de louros dourados contornando a cabeca, de tras para a frente, com uma fita caindo pela nuca.
    const leaves = 12;
    for (let index = 0; index < leaves; index++) {
      const angle = Math.PI * (1.08 + index / (leaves - 1) * .84);
      ctx.save();
      ctx.translate(x + Math.cos(angle) * r * 1.02, y + Math.sin(angle) * r - r * .08);
      ctx.rotate(angle + Math.PI / 2 + (index % 2 ? .35 : -.35));
      ctx.fillStyle = metalGradient(ctx, 0, -r * .4, 0, r * .1, '#fff2a0', '#b8860b');
      ctx.strokeStyle = '#7a4d00';
      ctx.lineWidth = Math.max(.4, r * .06);
      ctx.beginPath();
      ctx.ellipse?.(0, 0, r * .3, r * .13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = '#c4283a';
    ctx.lineWidth = Math.max(.8, r * .14);
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * .1);
    ctx.quadraticCurveTo(x - r * 1.6 + Math.sin(time / 240) * r * .15, y + r * .5, x - r * 1.4, y + r * 1.1);
    ctx.stroke();
  } else if (skin.accessory === 'halo') {
    // Anel de brasa dourada flutuando acima da cabeca.
    const pulse = .75 + Math.sin(time / 320) * .25;
    ctx.shadowColor = 'rgba(255, 220, 110, .95)';
    ctx.shadowBlur = r * 1.2;
    ctx.strokeStyle = `rgba(255, 232, 140, ${pulse})`;
    ctx.lineWidth = Math.max(1, r * .18);
    ctx.beginPath();
    ctx.ellipse?.(x, y - r * 1.55, r, r * .3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, .7)';
    ctx.lineWidth = Math.max(.5, r * .06);
    ctx.beginPath();
    ctx.ellipse?.(x, y - r * 1.55, r, r * .3, 0, 0, Math.PI * 2);
    ctx.stroke();

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

// ---------- Roupas das skins da Trilha de Niveis ----------
// Pecas desenhadas em coordenadas da cabeca: (0, 0) e o centro da cabeca, +x e a frente, e a unidade e o raio da cabeca (r).
// Ombros em y ~ 1,3, cintura em 4,4, joelhos em 8, pes em 12. "Atras" fica por tras do corpo e muda a silhueta;
// "frente" fica por cima e so cobre o que uma peca real cobriria (faixas, lapelas, dragonas), para nao esconder o braco.
const gp = (head, px, py) => [head.x + px * head.r, head.y + py * head.r];

function garmentPath(ctx, head, points) {
  ctx.beginPath();
  points.forEach(([px, py], index) => {
    const [x, y] = gp(head, px, py);
    if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function paintGarment(ctx, head, points, fill, stroke = null, width = .09) {
  garmentPath(ctx, head, points);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(.5, head.r * width);
    ctx.stroke();
  }
}

const garmentGradient = (ctx, head, from, to, light, dark) => metalGradient(ctx, 0, head.y + from * head.r, 0, head.y + to * head.r, light, dark);
const garmentSide = (ctx, head, from, to, light, dark) => metalGradient(ctx, head.x + from * head.r, 0, head.x + to * head.r, 0, light, dark);

function garmentDot(ctx, head, px, py, size, fill, stroke = null) {
  const [x, y] = gp(head, px, py);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc?.(x, y, Math.max(.6, head.r * size), 0, Math.PI * 2);
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(.4, head.r * .05); ctx.stroke(); }
}

function garmentLines(ctx, head, lines, color, width = .07) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(.4, head.r * width);
  ctx.beginPath();
  for (const [a, b, c, d] of lines) {
    const [x0, y0] = gp(head, a, b);
    const [x1, y1] = gp(head, c, d);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

// Dragona de ombro com franja, ancorada no ponto (px, py).
function epaulette(ctx, head, px, py, base, trim) {
  paintGarment(ctx, head, [[px - .62, py], [px + .62, py - .08], [px + .6, py + .5], [px - .6, py + .55]], garmentGradient(ctx, head, py, py + .6, base, trim), '#2a1a05', .05);
  garmentLines(ctx, head, [[px - .4, py + .5, px - .4, py + .95], [px - .1, py + .52, px - .1, py + 1.0], [px + .2, py + .5, px + .2, py + .95], [px + .5, py + .48, px + .5, py + .9]], trim, .06);
  garmentLines(ctx, head, [[px - .5, py + .22, px + .5, py + .2]], '#fff4c0', .05);
}

const GARMENT_BACK = {
  // Cauda de casaco azul-marinho com barra dourada, descendo ate os joelhos.
  statesman_coat(ctx, head, time) {
    const w = (index) => Math.sin(time / 260 + index) * .22;
    paintGarment(ctx, head, [[-.9, 1.7], [-2.4, 4.8], [-3 + w(1), 8.6 + w(0)], [-1, 9 + w(2)], [.9, 8.7 + w(3)], [1, 4.6], [.3, 2]],
      garmentGradient(ctx, head, 1.5, 9, '#7690c4', '#2a3b66'), '#e6c25a', .12);
    garmentLines(ctx, head, [[-1.1, 3.6, -1.7 + w(1), 8.7], [-.4, 3.8, -.8 + w(2), 8.9], [.3, 4, .1 + w(3), 8.8]], 'rgba(0, 0, 0, .45)', .09);
  },
  // Lenco vermelho puido voando atras do pescoco.
  veteran_gear(ctx, head, time) {
    const w = (index) => Math.sin(time / 190 + index * 1.3) * .35;
    paintGarment(ctx, head, [[-.5, 1.1], [-1.9, 1.5 + w(0)], [-3.4 + w(1), 2.2 + w(2)], [-3.1 + w(1), 3.1 + w(2)], [-1.8, 2.5 + w(0)], [-.2, 1.9]],
      garmentSide(ctx, head, -3.4, -.3, '#7a1d14', '#d4442e'), '#3a0c07', .06);
    garmentLines(ctx, head, [[-3.3 + w(1), 2.5 + w(2), -3.5 + w(1), 3.1 + w(2)], [-3.1 + w(1), 2.8 + w(2), -3.2 + w(1), 3.4 + w(2)]], '#7a1d14', .06);
  },
  // Tunica de linho creme com barra dourada.
  founder_tunic(ctx, head, time) {
    const w = (index) => Math.sin(time / 280 + index) * .2;
    paintGarment(ctx, head, [[-.9, 2.2], [-2.1, 5], [-2.4 + w(1), 7.6 + w(0)], [-.6, 8 + w(2)], [.9, 7.7 + w(3)], [.95, 4.6], [.3, 2.3]],
      garmentGradient(ctx, head, 2, 8, '#fff7df', '#cdbb8a'), '#c99a2e', .12);
    garmentLines(ctx, head, [[-1.2, 4.4, -1.5 + w(1), 7.8], [-.5, 4.5, -.7 + w(2), 8], [.2, 4.6, .1 + w(3), 7.9]], 'rgba(120, 100, 60, .45)', .07);
  },
  // Cauda longa de casaco preto com barra bordada a ouro e fios rasgados.
  legend_coat(ctx, head, time) {
    const w = (index) => Math.sin(time / 250 + index) * .25;
    paintGarment(ctx, head, [[-.9, 1.7], [-2.5, 5], [-3.3 + w(1), 9.4 + w(0)], [-2.2, 9 + w(1)], [-1.6, 9.7 + w(2)], [-.4, 9.1 + w(3)], [.5, 9.6 + w(0)], [1, 8.9], [1, 4.6], [.3, 2]],
      garmentGradient(ctx, head, 1.5, 9.7, '#5a5a68', '#17171d'), '#f0c64a', .13);
    garmentLines(ctx, head, [[-2.7 + w(1), 8.9 + w(0), -1.5, 8.7 + w(2)], [-1.2, 8.8, .6, 8.7 + w(3)]], '#e0b43a', .08);
    garmentLines(ctx, head, [[-1.8, 3.4, -2.3 + w(1), 8.2 + w(0)], [-1.2, 3.2, -1.5 + w(2), 8.4]], 'rgba(255, 240, 190, .35)', .1);
    for (let step = 0; step < 5; step++) {
      const py = 4.6 + step * .85;
      const px = -1.5 - step * .22;
      paintGarment(ctx, head, [[px, py - .22], [px + .22, py], [px, py + .22], [px - .22, py]], 'rgba(240, 198, 74, .85)');
    }
  },
  // Capa carmim com forro escuro, gola de pele branca e barra de ouro.
  president_regalia(ctx, head, time) {
    const w = (index) => Math.sin(time / 230 + index * 1.1) * .3;
    paintGarment(ctx, head, [[-.8, 1.3], [-2.9, 3.4 + w(0)], [-4.1 + w(1), 8.2 + w(2)], [-3.2 + w(1), 11.2 + w(3)], [-1.4, 10.8 + w(2)], [.3, 10 + w(1)], [.8, 4.6], [.3, 1.7]],
      garmentGradient(ctx, head, 1.3, 11, '#c42a3c', '#4a0814'), '#ffd86a', .14);
    paintGarment(ctx, head, [[-3.6 + w(1), 8.6 + w(2)], [-3 + w(1), 11 + w(3)], [-2.2, 10.9 + w(2)], [-2.9, 8.4 + w(1)]], 'rgba(20, 0, 8, .5)');
    garmentLines(ctx, head, [[-1.3, 3.2, -2.1 + w(1), 10.4 + w(2)], [-.6, 3.8, -.7 + w(3), 10.5 + w(1)], [-2.2, 3.6, -3.1 + w(1), 10.7 + w(2)]], 'rgba(40, 0, 10, .45)', .09);
  },
};

const GARMENT_FRONT = {
  statesman_coat(ctx, head) {
    paintGarment(ctx, head, [[.05, 1.1], [1.05, 1.2], [.72, 2.8]], '#f4f1e8', '#8a8a8a', .05);
    const cloth = garmentGradient(ctx, head, 1.2, 4, '#7088c0', '#2a3a66');
    paintGarment(ctx, head, [[-.35, 1.2], [.12, 1.1], [.74, 3.6], [.36, 4], [-.7, 1.9]], cloth, '#d6b04c', .07);
    paintGarment(ctx, head, [[1, 1.2], [1.35, 1.55], [1.15, 3.9], [.78, 3.6]], cloth, '#d6b04c', .07);
    for (const y of [4.3, 5.1, 5.9]) garmentDot(ctx, head, .8, y, .15, '#f2c94c', '#6a4a00');
    paintGarment(ctx, head, [[-.55, 2.8], [-.1, 2.7], [-.15, 3.25], [-.6, 3.2]], '#ffffff', '#b8b8b8', .04);
    epaulette(ctx, head, -.15, 1.25, '#d6b04c', '#7a5a10');
  },
  veteran_gear(ctx, head) {
    // Bandoleira de couro com cartuchos de latao, do ombro ao quadril.
    paintGarment(ctx, head, [[.7, 1.3], [1.2, 1.45], [-.5, 5.1], [-1, 4.7]], garmentGradient(ctx, head, 1.3, 5, '#a9733c', '#4a2c14'), '#2a160a', .05);
    for (let index = 0; index < 5; index++) {
      const t = .12 + index * .18;
      const px = .95 - t * 1.6;
      const py = 1.4 + t * 3.5;
      paintGarment(ctx, head, [[px - .12, py - .1], [px + .12, py - .1], [px + .12, py + .32], [px - .12, py + .32]], '#d8a640', '#5a3a08', .03);
    }
    epaulette(ctx, head, -.2, 1.3, '#6b7a42', '#2f3a1a');
    garmentLines(ctx, head, [[-.65, 1.65, -.65, 2], [-.4, 1.62, -.4, 1.97]], '#f0e2a0', .09);
    // Cantil no quadril e remendo no peito.
    paintGarment(ctx, head, [[-1.1, 4.6], [-.45, 4.6], [-.4, 5.6], [-1.15, 5.6]], '#5a6b3a', '#26301a', .06);
    garmentDot(ctx, head, -.78, 4.55, .12, '#c8c8c8');
    garmentDot(ctx, head, .35, 2.4, .26, '#e8d9a0', '#4a3a10');
    garmentDot(ctx, head, .35, 2.4, .1, '#7a1d14');
  },
  founder_tunic(ctx, head) {
    // Faixa verde-azulada com borda dourada e medalhao, do ombro ao quadril, e cinto com rolo de plantas.
    paintGarment(ctx, head, [[.6, 1.3], [1.2, 1.4], [-.4, 5], [-1, 4.7]], garmentGradient(ctx, head, 1.3, 5, '#2aa59a', '#0e4a48'), '#e8c14a', .09);
    garmentDot(ctx, head, -.55, 4.8, .3, '#f2c94c', '#6a4a00');
    garmentDot(ctx, head, -.55, 4.8, .12, '#2aa59a');
    paintGarment(ctx, head, [[-1.35, 4.2], [1.2, 4.3], [1.2, 4.7], [-1.35, 4.65]], '#7a5230', '#2a180a', .05);
    paintGarment(ctx, head, [[.55, 4.2], [.95, 4.2], [.95, 4.7], [.55, 4.7]], '#f2c94c', '#6a4a00', .05);
    paintGarment(ctx, head, [[-1.3, 3.9], [-.2, 5.7], [.05, 5.45], [-1.05, 3.7]], '#f1ead2', '#8a7a52', .05);
    garmentLines(ctx, head, [[-1.1, 4.1, -.2, 5.5]], '#6a5a38', .04);
  },
  architect_vest(ctx, head, time) {
    // Colete refletivo de obra: suspensorios laranja com faixas prateadas, cinto de ferramentas e cracha.
    const orange = garmentGradient(ctx, head, 1.2, 4.6, '#ff9a2e', '#c25a0a');
    paintGarment(ctx, head, [[-.5, 1.25], [.05, 1.2], [.28, 4.4], [-.35, 4.5]], orange, '#6a2f00', .05);
    paintGarment(ctx, head, [[.8, 1.25], [1.3, 1.45], [1.15, 4.4], [.7, 4.35]], orange, '#6a2f00', .05);
    paintGarment(ctx, head, [[-.6, 2.5], [1.25, 2.6], [1.25, 3], [-.6, 2.9]], orange, '#6a2f00', .04);
    for (const [y, h] of [[1.8, .24], [3.1, .24], [3.75, .2]]) paintGarment(ctx, head, [[-.5, y], [1.25, y + .06], [1.25, y + h], [-.5, y + h - .04]], '#e8eef2', '#8a959b', .03);
    paintGarment(ctx, head, [[-1.35, 4.35], [1.25, 4.45], [1.25, 4.95], [-1.35, 4.85]], '#5a4630', '#1a1006', .05);
    paintGarment(ctx, head, [[-.2, 4.9], [.4, 4.95], [.4, 5.9], [-.2, 5.85]], '#4a3a28', '#1a1006', .05);
    garmentLines(ctx, head, [[-1.05, 4.85, -1.05, 6.3], [.8, 4.9, .8, 6]], '#c9d0d4', .09);
    garmentDot(ctx, head, -1.05, 6.5, .18, '#c9d0d4', '#3a4044');
    paintGarment(ctx, head, [[.5, 1.9], [.9, 1.95], [.9, 2.4], [.5, 2.35]], '#ffffff', '#555', .03);
    const pulse = .55 + Math.sin(time / 320) * .3;
    garmentDot(ctx, head, 1.0, 1.55, .13, `rgba(110, 230, 255, ${pulse})`);
  },
  legend_coat(ctx, head, time) {
    // Dragonas e gola alta bordadas a ouro, brasao no peito e punhos dourados.
    paintGarment(ctx, head, [[-.5, .95], [.25, .9], [.2, 1.8], [-.6, 1.8]], garmentGradient(ctx, head, .9, 1.8, '#3a3a44', '#0a0a0e'), '#e0b43a', .08);
    epaulette(ctx, head, -.2, 1.3, '#e0b43a', '#8a5a08');
    garmentLines(ctx, head, [[.75, 1.5, .85, 5], [.55, 1.6, .62, 4.8]], '#e0b43a', .09);
    const [cx, cy] = gp(head, .25, 2.9);
    ctx.fillStyle = metalGradient(ctx, cx - head.r, cy - head.r, cx + head.r, cy + head.r, '#fff2a0', '#b8860b');
    ctx.strokeStyle = '#4a2a00';
    ctx.lineWidth = Math.max(.5, head.r * .08);
    ctx.beginPath();
    ctx.arc?.(cx, cy, head.r * .5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1006';
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 ? head.r * .13 : head.r * .32;
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    garmentLines(ctx, head, [[-.2, 4.4, 1.15, 4.5]], '#e0b43a', .1);
    const glow = .5 + Math.sin(time / 380) * .25;
    garmentDot(ctx, head, .25, 2.9, .62, `rgba(255, 210, 90, ${glow * .18})`);
  },
  president_regalia(ctx, head) {
    // Gola de pele branca, faixa presidencial dourada com medalhao, dragonas e fileira de medalhas.
    paintGarment(ctx, head, [[-.85, 1.0], [.75, .95], [1, 1.55], [.3, 1.85], [-.9, 1.6]], garmentGradient(ctx, head, .9, 1.9, '#ffffff', '#cfcfd4'), '#9a9aa2', .05);
    for (const px of [-.6, -.2, .2, .6]) garmentDot(ctx, head, px, 1.4, .12, '#2a2a30');
    paintGarment(ctx, head, [[.65, 1.7], [1.2, 1.8], [-.35, 5.1], [-.95, 4.7]], garmentGradient(ctx, head, 1.7, 5, '#fff4c0', '#c8900f'), '#6a4a00', .07);
    garmentLines(ctx, head, [[.5, 1.95, -.75, 4.7]], '#2a6ac4', .1);
    garmentDot(ctx, head, -.62, 4.9, .34, '#f2c94c', '#6a4a00');
    garmentDot(ctx, head, -.62, 4.9, .14, '#c42a3c');
    epaulette(ctx, head, -.25, 1.3, '#f2c94c', '#8a5a08');
    [['#c42a3c', 0], ['#2a6ac4', .38], ['#f2c94c', .76]].forEach(([ribbon, offset]) => {
      paintGarment(ctx, head, [[offset - .5, 2.3], [offset - .26, 2.3], [offset - .26, 2.75], [offset - .5, 2.75]], ribbon);
      garmentDot(ctx, head, offset - .38, 2.95, .16, '#ffe27a', '#6a4a00');
    });
  },
};

// Chapeus e adornos novos da trilha.
const NEW_ACCESSORIES = {
  trilby(ctx, head) {
    const { x, y, r } = head;
    ctx.fillStyle = metalGradient(ctx, 0, y - r * 1.6, 0, y - r * .5, '#4a4a56', '#16161c');
    ctx.beginPath();
    ctx.moveTo(x - r * .98, y - r * .5);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 1.55, x - r * .1, y - r * 1.6);
    ctx.quadraticCurveTo(x + r * 1.0, y - r * 1.6, x + r * .98, y - r * .5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c42a3c';
    ctx.fillRect(x - r * 1.0, y - r * .85, r * 2, r * .26);
    ctx.fillStyle = '#0e0e12';
    ctx.beginPath();
    ctx.ellipse?.(x + r * .1, y - r * .5, r * 1.55, r * .3, -.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, .22)';
    ctx.lineWidth = Math.max(.5, r * .07);
    ctx.beginPath();
    ctx.ellipse?.(x + r * .1, y - r * .56, r * 1.5, r * .25, -.04, Math.PI * 1.05, Math.PI * 1.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, .5)';
    ctx.beginPath();
    ctx.moveTo(x - r * .15, y - r * 1.6);
    ctx.lineTo(x - r * .05, y - r * 1.05);
    ctx.stroke();
  },
  hardhat(ctx, head, time) {
    const { x, y, r } = head;
    ctx.fillStyle = metalGradient(ctx, 0, y - r * 1.6, 0, y - r * .35, '#ffe45a', '#d49a00');
    ctx.strokeStyle = '#6a4a00';
    ctx.lineWidth = Math.max(.5, r * .1);
    ctx.beginPath();
    ctx.moveTo(x - r * 1.12, y - r * .4);
    ctx.quadraticCurveTo(x - r * 1.2, y - r * 1.75, x, y - r * 1.75);
    ctx.quadraticCurveTo(x + r * 1.25, y - r * 1.75, x + r * 1.15, y - r * .4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c98a00';
    ctx.beginPath();
    ctx.ellipse?.(x + r * .35, y - r * .38, r * 1.6, r * .2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, .45)';
    ctx.fillRect(x - r * .12, y - r * 1.72, r * .24, r * 1.1);
    const pulse = .7 + Math.sin(time / 280) * .3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255, 250, 200, ${pulse * .35})`;
    ctx.beginPath();
    ctx.moveTo(x + r * .95, y - r * .85);
    ctx.lineTo(x + r * 4, y - r * 1.6);
    ctx.lineTo(x + r * 4, y + r * .2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath();
    ctx.arc?.(x + r * .95, y - r * .85, r * .22, 0, Math.PI * 2);
    ctx.fill();
  },
  circlet(ctx, head) {
    const { x, y, r } = head;
    ctx.fillStyle = metalGradient(ctx, 0, y - r * 1.2, 0, y - r * .4, '#fff2a0', '#c8900f');
    ctx.strokeStyle = '#6a4a00';
    ctx.lineWidth = Math.max(.5, r * .08);
    ctx.beginPath();
    ctx.moveTo(x - r * .95, y - r * .5);
    ctx.lineTo(x - r * .95, y - r * .8);
    ctx.lineTo(x - r * .6, y - r * .62);
    ctx.lineTo(x - r * .3, y - r * 1.0);
    ctx.lineTo(x, y - r * .65);
    ctx.lineTo(x + r * .3, y - r * 1.15);
    ctx.lineTo(x + r * .6, y - r * .65);
    ctx.lineTo(x + r * .95, y - r * .85);
    ctx.lineTo(x + r * .95, y - r * .5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d6203a';
    ctx.beginPath();
    ctx.arc?.(x + r * .3, y - r * .75, r * .14, 0, Math.PI * 2);
    ctx.fill();
  },
};

const BEHIND_EFFECTS = new Set(['smoke', 'dust']);

function drawSkinnedActor(ctx, image, crop, width, height, skin, time) {
  const sprite = renderSkinnedSprite(image, crop, skin, width, height, time);
  const anchor = findHeadAnchor(image, crop);
  const head = { x: -width / 2 + anchor.x * width, y: -height + anchor.y * height, r: anchor.r * height };
  if (BEHIND_EFFECTS.has(skin.effect)) drawSkinEffect(ctx, skin, width, height, time);
  // Pecas de tras (caudas, capas) ficam por tras do corpo; as da frente so cobrem o que uma roupa real cobriria.
  if (skin.garment && GARMENT_BACK[skin.garment]) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    GARMENT_BACK[skin.garment](ctx, head, time);
    ctx.restore();
  }
  ctx.save();
  if (skin.aura) {
    ctx.shadowColor = skin.aura.color;
    ctx.shadowBlur = skin.aura.blur * (skin.aura.pulse ? .65 + (Math.sin(time / 320) + 1) * .25 : 1);
  }
  ctx.drawImage(sprite, -width / 2, -height, width, height);
  ctx.restore();
  if (skin.keepFace && image && crop) {
    ctx.save();
    ctx.beginPath();
    ctx.arc?.(head.x + head.r * .05, head.y + head.r * .1, head.r * 1.12, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, ...crop, -width / 2, -height, width, height);
    ctx.restore();
  }
  if (skin.garment && GARMENT_FRONT[skin.garment]) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    GARMENT_FRONT[skin.garment](ctx, head, time);
    ctx.restore();
  }
  if (skin.accessory) drawSkinAccessory(ctx, skin, head, time);
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
  // Preto a 40% por cima equivale ao multiply antigo, mas e bem mais barato de compor.
  ctx.globalAlpha = 0.4;
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
  presidentClass = null, equippedSkin = 'default', weather = 'clear', oilDerricks = null, oilNow = Date.now(), oilFeedback = null, surfaceFort = undefined, companion = null, darkMarket = null, language = 'pt-BR', lowQuality = false }) {
  renderSurface(ctx, camera, assets, { isNight, time, weather, lowQuality });
  renderDirt(ctx, camera, assets);
  ctx.save();
  ctx.translate(camera.offset_x, camera.offset_y);
  const surfaceVisible = isWorldAreaVisible(ctx, camera, 0, SURFACE_Y - 320, 1_250, 360, 96);
  if (oilDerricks && surfaceVisible) {
    renderFort(ctx, surfaceFort ?? null, { time, now: oilNow, night: isNight, language,
      soldierImage: assets.getImage('npc_walk_sheet'), fortImage: assets.getImage('surface_fort') });
    renderOilField(ctx, oilDerricks, { time, now: oilNow, language });
  }
  if (darkMarket && surfaceVisible) renderMarket(ctx, darkMarket, { stallImage: assets.getImage('dark_market_stall'), merchantImage: assets.getImage('dark_market_merchant'), time, night: isNight, language });
  const atlas = assets.getImage('room_atlas');
  for (let floor = 0; floor < grid.length; floor++) {
    for (let column = 0; column < grid[floor].length; column++) {
      const room = grid[floor][column];
      if (!room) continue;
      const roomX = WORLD_LEFT + column * SLOT_WIDTH;
      const roomY = WORLD_TOP + floor * FLOOR_SPACING;
      if (!isWorldAreaVisible(ctx, camera, roomX, roomY, SLOT_WIDTH, FLOOR_SPACING, 32)) continue;
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
  const cabinY = player.liftTarget !== null ? player.y : cabinFloor < 0 ? SURFACE_Y : cellCenter(cabinFloor, 0).y;
  drawOrMissing(ctx, assets.getImage('elevator_cabin'), WORLD_LEFT + 74,
    cabinY + ELEVATOR_ART_FLOOR_INSET - ELEVATOR_CABIN_HEIGHT, 116, ELEVATOR_CABIN_HEIGHT);
  const npcSheet = assets.getImage('npc_walk_sheet');
  for (const npc of inhabitants) {
    if (npc.is_on_expedition) continue;
    const room = grid[npc.floor]?.[npc.column];
    if (!room) continue;
    const x = WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + npc.offsetX;
    const placement = getActorPlacement(room);
    if (!isWorldAreaVisible(ctx, camera, x - 34, placement.floorY - placement.height - 16, 68, placement.height + 32, 32)) continue;
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
  const playerColumn = player.floor < 0 ? 0 : Math.max(0, Math.min(grid[player.floor]?.length - 1 ?? 0,
    Math.floor((player.x - WORLD_LEFT) / SLOT_WIDTH)));
  const playerRoom = grid[player.floor]?.[playerColumn] ?? { floor: player.floor, column: playerColumn, type: 'vault' };
  const placement = getActorPlacement(playerRoom,
    player.liftTarget !== null ? { liftY: player.y } : {});
  const playerY = placement.floorY;
  drawPresident(ctx, { ...player, y: playerY, role: 'president' }, assets,
    { presidentClass, equippedSkin, time, placement });
  if (companion) drawCompanion(ctx, companion, grid, time, placement.height, player, assets.getImage('layd_sheet'));
  for (const room of grid.flat()) {
    if (!room) continue;
    const x = WORLD_LEFT + room.column * SLOT_WIDTH;
    const y = WORLD_TOP + room.floor * FLOOR_SPACING;
    if (!isWorldAreaVisible(ctx, camera, x, y, SLOT_WIDTH, ROOM_HEIGHT, 24)) continue;
    if (room.type === 'detention') renderDetentionBars(ctx, room, time);
    if (room.type === 'greenhouse') renderGreenhouseGlow(ctx, room);
  }
  ctx.restore();
  if (isNight && ctx.canvas) {
    const surfaceHeight = Math.max(0, Math.min(ctx.canvas.height, SURFACE_Y + camera.offset_y));
    applyNightOverlay(ctx, ctx.canvas.width, ctx.canvas.height, true, { activeGenerators, surfaceHeight });
  }
  if (oilDerricks && surfaceVisible) {
    ctx.save();
    ctx.translate(camera.offset_x, camera.offset_y);
    renderOilFieldOverlay(ctx, oilDerricks, { time, now: oilNow, feedback: oilFeedback, perfNow: time, language });
    renderFortOverlay(ctx, surfaceFort ?? null, { now: oilNow, language });
    if (darkMarket) renderMarketOverlay(ctx, darkMarket, { time, language });
    ctx.restore();
  }
  if (ctx.canvas) applyOxygenDeprivationOverlay(ctx, ctx.canvas.width, ctx.canvas.height, oxygenDeprived, time);
  renderLootboxOverlay(ctx, { ...lootbox, time, crateImage: assets.getImage('loot_crate') });
}

// Layd acompanha o presidente: mesma regra de chao dos habitantes, tamanho proporcional a um cao de verdade.
function drawCompanion(ctx, dog, grid, time, humanHeight, player, sheet = null) {
  if (!sheet) warmDogFrames(humanHeight * .31 / DOG_HEIGHT);
  if (dog.riding) {
    const cabin = getActorPlacement({ floor: player.floor, column: 0, type: 'elevator' }, { liftY: player.y });
    drawDog(ctx, { x: dog.x, y: cabin.floorY, facing: dog.facing, scale: humanHeight * .31 / DOG_HEIGHT, pose: 'stand', time, sheet, sick: dog.sick });
    return;
  }
  const column = Math.max(0, Math.min((grid[dog.floor]?.length ?? 1) - 1, Math.floor((dog.x - WORLD_LEFT) / SLOT_WIDTH)));
  const room = grid[dog.floor]?.[column] ?? { floor: dog.floor, column, type: 'vault' };
  const placement = getActorPlacement(room);
  drawDog(ctx, { x: dog.x, y: placement.floorY, facing: dog.facing, scale: humanHeight * .31 / DOG_HEIGHT,
    pose: dog.pose, gait: dog.gait, time, happy: dog.petSeconds > 0, sheet, sick: dog.sick });
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
export function drawNeedsPanel(ctx, centerX, bottomY, needs, language = 'pt-BR') {
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
    ctx.fillText(translateUiText(NEED_LABELS[key], language), left + 4, rowY + 4);
    ctx.fillStyle = '#2a2f2c';
    ctx.fillRect(left + 46, rowY + 1, 42, 6);
    ctx.fillStyle = NEED_BAR_COLORS[tone];
    ctx.fillRect(left + 46, rowY + 1, Math.round(42 * value / 100), 6);
  });
  ctx.restore();
}
