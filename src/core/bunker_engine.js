export const TILE_TYPES = Object.freeze({
  WALL: 0,
  FLOOR: 1,
  GENERATOR: 2,
  WATER_PURIFIER: 3,
  AIRLOCK: 4,
  COMMAND_CENTER: 5,
});

export const BUNKER_ASSETS = Object.freeze({
  floor: 'assets/bunker_floor.png',
  wall: 'assets/bunker_wall.png',
  player: 'assets/bunker_survivor.png',
  generator: 'assets/bunker_generator.png',
  waterPurifier: 'assets/bunker_water_purifier.png',
  airlock: 'assets/bunker_airlock.png',
  commandCenter: 'assets/bunker_command_center.png',
});

export class AssetManager {
  constructor(sources = BUNKER_ASSETS) {
    this.sources = { ...sources };
    this.images = new Map();
  }

  loadAll() {
    if (typeof Image === 'undefined') return Promise.resolve(this);
    const entries = Object.entries(this.sources).map(([key, source]) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => { this.images.set(key, image); resolve(); };
      image.onerror = () => resolve();
      image.src = source;
    }));
    return Promise.all(entries).then(() => this);
  }

  get(key) {
    return this.images.get(key) ?? null;
  }
}

const createBunkerMap = () => {
  const size = 40;
  const map = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (
    x === 0 || y === 0 || x === size - 1 || y === size - 1 ? TILE_TYPES.WALL : TILE_TYPES.FLOOR
  )));

  for (let x = 1; x < size - 1; x += 1) map[9][x] = TILE_TYPES.WALL;
  map[9][9] = TILE_TYPES.FLOOR;
  for (let x = 1; x < size - 1; x += 1) map[19][x] = TILE_TYPES.WALL;
  map[19][10] = TILE_TYPES.FLOOR;
  map[5][10] = TILE_TYPES.GENERATOR;
  map[30][5] = TILE_TYPES.WATER_PURIFIER;
  map[2][38] = TILE_TYPES.AIRLOCK;
  map[28][32] = TILE_TYPES.COMMAND_CENTER;
  return map;
};

export const BUNKER_MAP = Object.freeze(createBunkerMap().map((row) => Object.freeze(row)));

const DIRECTIONS = Object.freeze({
  ArrowUp: [0, -1, 'up'], w: [0, -1, 'up'], W: [0, -1, 'up'],
  ArrowDown: [0, 1, 'down'], s: [0, 1, 'down'], S: [0, 1, 'down'],
  ArrowLeft: [-1, 0, 'left'], a: [-1, 0, 'left'], A: [-1, 0, 'left'],
  ArrowRight: [1, 0, 'right'], d: [1, 0, 'right'], D: [1, 0, 'right'],
});

const INTERACTIVE_TILES = new Set([
  TILE_TYPES.GENERATOR,
  TILE_TYPES.WATER_PURIFIER,
  TILE_TYPES.AIRLOCK,
  TILE_TYPES.COMMAND_CENTER,
]);

const defaultSurfaceFactory = (size) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  return null;
};

function createMetalFloorSurface(surface) {
  const ctx = surface?.getContext?.('2d');
  if (!ctx) return null;
  const size = surface.width || 48;
  const gradient = ctx.createLinearGradient?.(0, 0, size, size);
  if (gradient) {
    gradient.addColorStop(0, '#45413b');
    gradient.addColorStop(.45, '#252629');
    gradient.addColorStop(1, '#111416');
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = '#292a29';
  }
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(214, 194, 158, .24)';
  ctx.lineWidth = 1;
  for (let offset = -size; offset < size * 2; offset += 12) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + size, size);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, .45)';
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return surface;
}

function createCautionFloorSurface(surface) {
  const ctx = surface?.getContext?.('2d');
  if (!ctx) return null;
  const size = surface.width || 48;
  ctx.fillStyle = '#3c3423';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#bd8a2b';
  ctx.lineWidth = 8;
  for (let offset = -size; offset < size * 2; offset += 20) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(8, 8, 7, .75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return surface;
}

export function createProceduralPatterns(surfaceFactory = defaultSurfaceFactory) {
  return {
    floorMetal: createMetalFloorSurface(surfaceFactory(48)),
    floorCaution: createCautionFloorSurface(surfaceFactory(48)),
  };
}

export function createBunkerState(overrides = {}) {
  return {
    map: overrides.map ?? BUNKER_MAP,
    player: { x: overrides.player?.x ?? 10, y: overrides.player?.y ?? 10 },
    facing: overrides.facing ?? 'down',
    paused: false,
    interaction: null,
  };
}

function tileAt(state, x, y) {
  return state.map?.[y]?.[x] ?? TILE_TYPES.WALL;
}

export function getInteractiveTile(state) {
  const { x, y } = state.player;
  const candidates = [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  const [tileX, tileY] = candidates.find(([candidateX, candidateY]) => INTERACTIVE_TILES.has(tileAt(state, candidateX, candidateY))) ?? [];
  return tileX === undefined ? null : { x: tileX, y: tileY, tile: tileAt(state, tileX, tileY) };
}

export function getInteractionPrompt(state) {
  const interactive = getInteractiveTile(state);
  if (!interactive) return '';
  const prompts = {
    [TILE_TYPES.GENERATOR]: '> PRESSIONE [E] PARA INSPECIONAR GERADOR',
    [TILE_TYPES.WATER_PURIFIER]: '> PRESSIONE [E] PARA INSPECIONAR PURIFICADOR',
    [TILE_TYPES.AIRLOCK]: '> PRESSIONE [E] PARA INSPECIONAR AIRLOCK',
    [TILE_TYPES.COMMAND_CENTER]: '> PRESSIONE [E] PARA ACESSAR CENTRO DE COMANDO',
  };
  return prompts[interactive.tile] ?? '';
}

export function moveBunkerPlayer(state, key) {
  if (state.paused || !DIRECTIONS[key]) return state;
  const [dx, dy, facing] = DIRECTIONS[key];
  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  if (tileAt(state, nextX, nextY) === TILE_TYPES.WALL) return state;
  return { ...state, facing, player: { x: nextX, y: nextY } };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getCameraOffset(state, viewport, tileSize) {
  const mapWidth = state.map?.[0]?.length ?? 0;
  const mapHeight = state.map?.length ?? 0;
  const playerPixelX = (state.player.x + .5) * tileSize;
  const playerPixelY = (state.player.y + .5) * tileSize;
  return {
    x: clamp(playerPixelX - (viewport.width / 2), 0, Math.max(0, (mapWidth * tileSize) - viewport.width)),
    y: clamp(playerPixelY - (viewport.height / 2), 0, Math.max(0, (mapHeight * tileSize) - viewport.height)),
  };
}

function resolvePattern(ctx, pattern) {
  if (!pattern) return null;
  if (typeof pattern.getContext === 'function' && typeof ctx.createPattern === 'function') {
    return ctx.createPattern(pattern, 'repeat');
  }
  return pattern;
}

function drawProceduralFloor(ctx, x, y, tileSize, caution = false) {
  const gradient = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
  gradient.addColorStop(0, caution ? '#544321' : '#45413b');
  gradient.addColorStop(.5, caution ? '#282318' : '#252629');
  gradient.addColorStop(1, caution ? '#1b1711' : '#111416');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeStyle = caution ? 'rgba(223, 163, 42, .7)' : 'rgba(214, 194, 158, .22)';
  ctx.lineWidth = caution ? 5 : 1;
  for (let offset = -tileSize; offset < tileSize * 2; offset += caution ? 20 : 12) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + tileSize);
    ctx.lineTo(x + offset + tileSize, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, .45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, tileSize - 1, tileSize - 1);
}

function isCautionFloor(state, x, y) {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .some(([neighborX, neighborY]) => INTERACTIVE_TILES.has(tileAt(state, neighborX, neighborY)));
}

function drawWall(ctx, image, x, y, tileSize) {
  const depth = Math.max(8, Math.round(tileSize * .22));
  ctx.fillStyle = '#292a2b';
  ctx.fillRect(x, y + depth, tileSize, tileSize - depth);
  if (image) ctx.drawImage(image, x, y + depth, tileSize, tileSize - depth);
  ctx.fillStyle = '#55575a';
  ctx.beginPath();
  ctx.moveTo(x, y + depth);
  ctx.lineTo(x + tileSize, y + depth);
  ctx.lineTo(x + tileSize, y + depth + 5);
  ctx.lineTo(x, y + depth + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(207, 132, 72, .45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + depth + .5, tileSize - 1, tileSize - depth - 1);
  ctx.strokeStyle = 'rgba(255, 255, 255, .08)';
  for (let offset = 8; offset < tileSize; offset += 12) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + depth + 8);
    ctx.lineTo(x + offset - 4, y + tileSize - 5);
    ctx.stroke();
  }
}

function drawFallbackObject(ctx, tile, x, y, tileSize) {
  const center = x + tileSize / 2;
  const top = y + tileSize * .2;
  const color = tile === TILE_TYPES.GENERATOR ? '#bd5b22'
    : tile === TILE_TYPES.WATER_PURIFIER ? '#3ba2af'
      : tile === TILE_TYPES.AIRLOCK ? '#b8943e' : '#9369c2';
  const gradient = ctx.createRadialGradient(center - tileSize * .12, top + tileSize * .1, 2, center, top + tileSize * .3, tileSize * .42);
  gradient.addColorStop(0, '#f9e3b1');
  gradient.addColorStop(.18, color);
  gradient.addColorStop(1, '#090706');
  ctx.fillStyle = gradient;
  ctx.fillRect(x + tileSize * .2, y + tileSize * .18, tileSize * .6, tileSize * .64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + tileSize * .2, y + tileSize * .18, tileSize * .6, tileSize * .64);
}

function drawLocalLight(ctx, x, y, tileSize, color) {
  const radius = tileSize * 2.7;
  const light = ctx.createRadialGradient(x, y, 2, x, y, radius);
  light.addColorStop(0, color.replace('ALPHA', '.5'));
  light.addColorStop(.35, color.replace('ALPHA', '.2'));
  light.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawProceduralPlayer(ctx, x, y, tileSize, facing = 'down') {
  const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: Math.PI * 1.5 }[facing] ?? Math.PI;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0, 0, 0, .55)';
  ctx.beginPath();
  ctx.ellipse(0, tileSize * .12, tileSize * .27, tileSize * .18, 0, 0, Math.PI * 2);
  ctx.fill();
  const shoulders = ctx.createRadialGradient(-4, -2, 2, 0, 0, tileSize * .3);
  shoulders.addColorStop(0, '#d27a3e');
  shoulders.addColorStop(.65, '#71321f');
  shoulders.addColorStop(1, '#24130f');
  ctx.fillStyle = shoulders;
  ctx.beginPath();
  ctx.ellipse(0, tileSize * .04, tileSize * .24, tileSize * .29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d39a68';
  ctx.beginPath();
  ctx.arc(0, -tileSize * .18, tileSize * .15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -tileSize * .34);
  ctx.lineTo(0, -tileSize * .46);
  ctx.stroke();
  ctx.restore();
}

export function renderBunkerScene(ctx, state, assets, viewport, visualPosition, patterns = {}) {
  const tileSize = 48;
  const camera = getCameraOffset({ ...state, player: visualPosition }, viewport, tileSize);
  ctx.fillStyle = '#11100f';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const firstX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
  const firstY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
  const lastX = Math.min(state.map[0].length - 1, Math.ceil((camera.x + viewport.width) / tileSize) + 1);
  const lastY = Math.min(state.map.length - 1, Math.ceil((camera.y + viewport.height) / tileSize) + 1);
  const floorPattern = resolvePattern(ctx, patterns.floorMetal);
  const cautionPattern = resolvePattern(ctx, patterns.floorCaution);

  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const tile = state.map[y][x];
      const screenX = x * tileSize - camera.x;
      const screenY = y * tileSize - camera.y;
      if (tile === TILE_TYPES.WALL) {
        drawWall(ctx, assets.get('wall'), screenX, screenY, tileSize);
        continue;
      }
      const floorFill = isCautionFloor(state, x, y) ? cautionPattern : floorPattern;
      if (floorFill) {
        ctx.fillStyle = floorFill;
        ctx.fillRect(screenX, screenY, tileSize, tileSize);
      } else {
        drawProceduralFloor(ctx, screenX, screenY, tileSize, isCautionFloor(state, x, y));
      }
      if (tile >= TILE_TYPES.GENERATOR) {
        const assetKey = { 2: 'generator', 3: 'waterPurifier', 4: 'airlock', 5: 'commandCenter' }[tile];
        const image = assets.get(assetKey);
        if (image) ctx.drawImage(image, screenX, screenY, tileSize, tileSize);
        else drawFallbackObject(ctx, tile, screenX, screenY, tileSize);
      }
    }
  }

  // Tonalidade ambiente: deixa o bunker mais sujo sem apagar a geometria.
  ctx.fillStyle = 'rgba(20, 15, 0, .28)';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const tile = state.map[y][x];
      const lightColor = {
        [TILE_TYPES.GENERATOR]: 'rgba(255, 117, 32, ALPHA)',
        [TILE_TYPES.WATER_PURIFIER]: 'rgba(41, 255, 182, ALPHA)',
        [TILE_TYPES.AIRLOCK]: 'rgba(245, 245, 220, ALPHA)',
        [TILE_TYPES.COMMAND_CENTER]: 'rgba(133, 169, 255, ALPHA)',
      }[tile];
      if (lightColor) drawLocalLight(ctx, x * tileSize + tileSize / 2 - camera.x, y * tileSize + tileSize / 2 - camera.y, tileSize, lightColor);
    }
  }

  const playerScreenX = (visualPosition.x + .5) * tileSize - camera.x;
  const playerScreenY = (visualPosition.y + .5) * tileSize - camera.y;
  const playerImage = assets.get('player');
  if (playerImage) {
    ctx.save();
    ctx.translate(playerScreenX, playerScreenY);
    ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: Math.PI * 1.5 }[state.facing] ?? Math.PI);
    ctx.drawImage(playerImage, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
    ctx.restore();
  } else {
    drawProceduralPlayer(ctx, playerScreenX, playerScreenY, tileSize, state.facing);
  }

  const prompt = getInteractionPrompt({ ...state, player: { x: Math.round(visualPosition.x), y: Math.round(visualPosition.y) } });
  if (prompt) {
    ctx.fillStyle = '#ffb347';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(prompt, 14, viewport.height - 14);
  }
}

export function createBunkerEngine(canvas, { onInteract, onStateChange } = {}) {
  if (!canvas?.getContext) return null;
  const ctx = canvas.getContext('2d');
  const assets = new AssetManager();
  const patterns = createProceduralPatterns();
  let state = createBunkerState();
  let visualPosition = { ...state.player };
  let frameId = null;
  let active = true;
  let lastFrame = 0;

  const render = (timestamp = 0) => {
    const width = canvas.clientWidth || canvas.width || 720;
    const height = canvas.clientHeight || canvas.height || 720;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const deltaSeconds = Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1_000));
    lastFrame = timestamp;
    const smoothing = Math.min(1, deltaSeconds * 12 || 1);
    visualPosition = {
      x: visualPosition.x + (state.player.x - visualPosition.x) * smoothing,
      y: visualPosition.y + (state.player.y - visualPosition.y) * smoothing,
    };
    renderBunkerScene(ctx, state, assets, { width, height }, visualPosition, patterns);
  };

  const loop = (timestamp) => {
    if (!active) return;
    render(timestamp);
    frameId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(loop) : null;
  };

  const handleKeyDown = (event) => {
    if (!active) return;
    if (event.key === 'e' || event.key === 'E') {
      const interactive = getInteractiveTile(state);
      if (interactive) {
        state = { ...state, paused: true, interaction: interactive };
        onInteract?.(interactive, state);
        render(lastFrame);
        event.preventDefault();
      }
      return;
    }
    if (!DIRECTIONS[event.key]) return;
    const nextState = moveBunkerPlayer(state, event.key);
    if (nextState !== state) {
      state = nextState;
      onStateChange?.(state);
      render(lastFrame);
    }
    event.preventDefault();
  };

  canvas.tabIndex = 0;
  canvas.addEventListener?.('keydown', handleKeyDown);
  canvas.focus?.();
  assets.loadAll().then(() => {
    if (!active) return;
    render(0);
    loop(0);
  });

  return {
    assets,
    getState: () => state,
    render,
    resume() {
      state = { ...state, paused: false, interaction: null };
      render(lastFrame);
    },
    destroy() {
      active = false;
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      canvas.removeEventListener?.('keydown', handleKeyDown);
    },
  };
}
