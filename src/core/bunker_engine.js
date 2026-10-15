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

  // Salas e corredores maiores que a viewport permitem que a câmera acompanhe o sobrevivente.
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
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
});

const INTERACTIVE_TILES = new Set([
  TILE_TYPES.GENERATOR,
  TILE_TYPES.WATER_PURIFIER,
  TILE_TYPES.AIRLOCK,
  TILE_TYPES.COMMAND_CENTER,
]);

export function createBunkerState(overrides = {}) {
  return {
    map: overrides.map ?? BUNKER_MAP,
    player: { x: overrides.player?.x ?? 10, y: overrides.player?.y ?? 10 },
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
  const [dx, dy] = DIRECTIONS[key];
  const nextX = state.player.x + dx;
  const nextY = state.player.y + dy;
  if (tileAt(state, nextX, nextY) === TILE_TYPES.WALL) return state;
  return { ...state, player: { x: nextX, y: nextY } };
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

function drawFallbackTile(ctx, tile, x, y, tileSize) {
  const gradient = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
  if (tile === TILE_TYPES.WALL) {
    gradient.addColorStop(0, '#5a3825');
    gradient.addColorStop(.5, '#1c120d');
    gradient.addColorStop(1, '#7c492c');
  } else {
    gradient.addColorStop(0, '#262523');
    gradient.addColorStop(.5, '#0c0d0d');
    gradient.addColorStop(1, '#35322d');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeStyle = tile === TILE_TYPES.WALL ? '#d06b2e' : '#4e4640';
  ctx.lineWidth = tile === TILE_TYPES.WALL ? 2 : 1;
  ctx.strokeRect(x + .5, y + .5, tileSize - 1, tileSize - 1);
  ctx.strokeStyle = tile === TILE_TYPES.WALL ? 'rgba(255, 158, 91, .2)' : 'rgba(205, 190, 166, .13)';
  for (let offset = -tileSize; offset < tileSize * 2; offset += 9) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + tileSize, y + tileSize);
    ctx.stroke();
  }
}

function drawFallbackObject(ctx, tile, x, y, tileSize) {
  const center = x + tileSize / 2;
  const top = y + tileSize * .18;
  const color = tile === TILE_TYPES.GENERATOR ? '#bd5b22' : tile === TILE_TYPES.WATER_PURIFIER ? '#3ba2af' : tile === TILE_TYPES.AIRLOCK ? '#b8943e' : '#9369c2';
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

function drawImageOrFallback(ctx, image, fallback, x, y, size) {
  if (image) ctx.drawImage(image, x, y, size, size);
  else fallback();
}

function drawWorld(ctx, state, assets, viewport, visualPosition) {
  const tileSize = 48;
  const camera = getCameraOffset({ ...state, player: visualPosition }, viewport, tileSize);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const firstX = Math.max(0, Math.floor(camera.x / tileSize) - 1);
  const firstY = Math.max(0, Math.floor(camera.y / tileSize) - 1);
  const lastX = Math.min(state.map[0].length - 1, Math.ceil((camera.x + viewport.width) / tileSize) + 1);
  const lastY = Math.min(state.map.length - 1, Math.ceil((camera.y + viewport.height) / tileSize) + 1);
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const tile = state.map[y][x];
      const screenX = (x * tileSize) - camera.x;
      const screenY = (y * tileSize) - camera.y;
      const floorImage = assets.get('floor');
      const wallImage = assets.get('wall');
      drawImageOrFallback(ctx, tile === TILE_TYPES.WALL ? wallImage : floorImage, () => drawFallbackTile(ctx, tile, screenX, screenY, tileSize), screenX, screenY, tileSize);
      if (tile >= TILE_TYPES.GENERATOR) {
        const assetKey = { 2: 'generator', 3: 'waterPurifier', 4: 'airlock', 5: 'commandCenter' }[tile];
        drawImageOrFallback(ctx, assets.get(assetKey), () => drawFallbackObject(ctx, tile, screenX, screenY, tileSize), screenX, screenY, tileSize);
      }
    }
  }

  const playerScreenX = (visualPosition.x + .5) * tileSize - camera.x;
  const playerScreenY = (visualPosition.y + .5) * tileSize - camera.y;
  drawImageOrFallback(ctx, assets.get('player'), () => {
    const gradient = ctx.createRadialGradient(playerScreenX - 7, playerScreenY - 9, 2, playerScreenX, playerScreenY, tileSize * .35);
    gradient.addColorStop(0, '#ffe0a2');
    gradient.addColorStop(.3, '#cb713b');
    gradient.addColorStop(1, '#17100b');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, tileSize * .28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.stroke();
  }, playerScreenX - tileSize / 2, playerScreenY - tileSize / 2, tileSize);

  // Escurece o mapa inteiro e remove a escuridão apenas no raio da lanterna.
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .95)';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.globalCompositeOperation = 'destination-out';
  const light = ctx.createRadialGradient(playerScreenX, playerScreenY, tileSize * .65, playerScreenX, playerScreenY, tileSize * 4);
  light.addColorStop(0, 'rgba(0, 0, 0, 1)');
  light.addColorStop(.52, 'rgba(0, 0, 0, .82)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.arc(playerScreenX, playerScreenY, tileSize * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

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
    drawWorld(ctx, state, assets, { width, height }, visualPosition);
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
