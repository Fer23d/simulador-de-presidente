export const TILE_TYPES = Object.freeze({
  WALL: 0,
  FLOOR: 1,
  GENERATOR: 2,
  WATER_PURIFIER: 3,
  AIRLOCK: 4,
  COMMAND_CENTER: 5,
});

const createBunkerMap = () => {
  const map = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => (
    x === 0 || y === 0 || x === 19 || y === 19 ? TILE_TYPES.WALL : TILE_TYPES.FLOOR
  )));

  // A primeira ala demonstra colisão e mantém a leitura visual de uma base modular.
  for (let x = 1; x < 19; x += 1) map[9][x] = TILE_TYPES.WALL;
  map[9][9] = TILE_TYPES.FLOOR;
  map[5][10] = TILE_TYPES.GENERATOR;
  map[14][4] = TILE_TYPES.WATER_PURIFIER;
  map[1][18] = TILE_TYPES.AIRLOCK;
  map[10][17] = TILE_TYPES.COMMAND_CENTER;
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

function drawBunker(ctx, state, width, height) {
  const tileSize = Math.max(1, Math.floor(Math.min(width / 20, height / 20)));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const colors = {
    [TILE_TYPES.WALL]: '#3a1b0b',
    [TILE_TYPES.FLOOR]: '#100d09',
    [TILE_TYPES.GENERATOR]: '#bf5b20',
    [TILE_TYPES.WATER_PURIFIER]: '#2f7890',
    [TILE_TYPES.AIRLOCK]: '#9b7b31',
    [TILE_TYPES.COMMAND_CENTER]: '#5a3e8c',
  };
  for (let y = 0; y < state.map.length; y += 1) {
    for (let x = 0; x < state.map[y].length; x += 1) {
      const tile = state.map[y][x];
      const px = x * tileSize;
      const py = y * tileSize;
      ctx.fillStyle = colors[tile] ?? colors[TILE_TYPES.WALL];
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = tile === TILE_TYPES.WALL ? '#c25e24' : '#382116';
      ctx.lineWidth = tile === TILE_TYPES.WALL ? 2 : 1;
      ctx.strokeRect(px + .5, py + .5, tileSize - 1, tileSize - 1);
    }
  }

  const playerX = state.player.x * tileSize + (tileSize / 2);
  const playerY = state.player.y * tileSize + (tileSize / 2);
  ctx.fillStyle = '#ffb347';
  ctx.font = `${Math.max(14, Math.floor(tileSize * .78))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('@', playerX, playerY);

  const prompt = getInteractionPrompt(state);
  if (prompt) {
    ctx.fillStyle = '#ffb347';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(prompt, 12, height - 12);
  }
}

export function createBunkerEngine(canvas, { onInteract, onStateChange } = {}) {
  if (!canvas?.getContext) return null;
  const ctx = canvas.getContext('2d');
  let state = createBunkerState();
  let frameId = null;
  let active = true;

  const render = () => {
    const width = canvas.clientWidth || canvas.width || 640;
    const height = canvas.clientHeight || canvas.height || 640;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    drawBunker(ctx, state, width, height);
  };

  const loop = () => {
    if (!active) return;
    render();
    frameId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(loop) : null;
  };

  const handleKeyDown = (event) => {
    if (!active) return;
    if (event.key === 'e' || event.key === 'E') {
      const interactive = getInteractiveTile(state);
      if (interactive) {
        state = { ...state, paused: true, interaction: interactive };
        onInteract?.(interactive, state);
        render();
        event.preventDefault();
      }
      return;
    }
    if (!DIRECTIONS[event.key]) return;
    const nextState = moveBunkerPlayer(state, event.key);
    if (nextState !== state) {
      state = nextState;
      onStateChange?.(state);
      render();
    }
    event.preventDefault();
  };

  canvas.tabIndex = 0;
  canvas.addEventListener?.('keydown', handleKeyDown);
  canvas.focus?.();
  loop();

  return {
    getState: () => state,
    render,
    resume() {
      state = { ...state, paused: false, interaction: null };
      render();
    },
    destroy() {
      active = false;
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      canvas.removeEventListener?.('keydown', handleKeyDown);
    },
  };
}
