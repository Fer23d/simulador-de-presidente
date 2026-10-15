export const ROOM_SIZE = 5;
export const TILE_WIDTH = 76;
export const TILE_HEIGHT = 38;
const MAX_ROOMS = 24;
const WALL_HEIGHT = 43;

export const ROOM_TYPES = Object.freeze({
  vault: Object.freeze({ name: 'Porta do Cofre', cost: 0, capacity: 3500, accent: '#f3a34b' }),
  dormitory: Object.freeze({ name: 'Dormitório', cost: 80, capacity: 500, accent: '#74b5bd' }),
  generator: Object.freeze({ name: 'Sala do Gerador', cost: 120, capacity: 0, accent: '#e88b39' }),
  greenhouse: Object.freeze({ name: 'Estufa Hidropônica', cost: 100, capacity: 100, accent: '#86c975' }),
});

export const INITIAL_BUNKER_ROOMS = Object.freeze([
  Object.freeze({ id: 'vault', type: 'vault', x: 0, y: 0, width: ROOM_SIZE, height: ROOM_SIZE }),
]);

const MOVES = Object.freeze({
  w: [0, -1, 'north'], ArrowUp: [0, -1, 'north'],
  s: [0, 1, 'south'], ArrowDown: [0, 1, 'south'],
  a: [-1, 0, 'west'], ArrowLeft: [-1, 0, 'west'],
  d: [1, 0, 'east'], ArrowRight: [1, 0, 'east'],
});
const SIDES = Object.freeze({
  north: [0, -ROOM_SIZE], south: [0, ROOM_SIZE],
  west: [-ROOM_SIZE, 0], east: [ROOM_SIZE, 0],
});

export function cartesianToIsometric(cartX, cartY, tileWidth = TILE_WIDTH, tileHeight = TILE_HEIGHT) {
  return {
    x: (cartX - cartY) * (tileWidth / 2),
    y: (cartX + cartY) * (tileHeight / 2),
  };
}

export function getRoomAt(rooms, x, y) {
  return rooms.find((room) => x >= room.x && x < room.x + ROOM_SIZE && y >= room.y && y < room.y + ROOM_SIZE) ?? null;
}

function neighbor(rooms, room, direction) {
  const [dx, dy] = SIDES[direction];
  return rooms.find((other) => other.x === room.x + dx && other.y === room.y + dy) ?? null;
}

function nextRoomId(rooms) {
  return Array.from({ length: MAX_ROOMS }, (_, index) => `room-${index + 1}`)
    .find((id) => !rooms.some((room) => room.id === id));
}

export function normalizeBunkerRooms(value) {
  if (!Array.isArray(value)) return [...INITIAL_BUNKER_ROOMS];
  const rooms = [...INITIAL_BUNKER_ROOMS];
  for (const candidate of value.slice(1, MAX_ROOMS)) {
    if (!candidate || !ROOM_TYPES[candidate.type] || candidate.type === 'vault') continue;
    if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) continue;
    if (candidate.x % ROOM_SIZE || candidate.y % ROOM_SIZE) continue;
    if (Math.abs(candidate.x) > 50 || Math.abs(candidate.y) > 50) continue;
    if (getRoomAt(rooms, candidate.x, candidate.y)) continue;
    const adjacent = rooms.some((room) => Math.abs(room.x - candidate.x) + Math.abs(room.y - candidate.y) === ROOM_SIZE);
    if (!adjacent) continue;
    const id = typeof candidate.id === 'string' && /^[a-z0-9-]{1,32}$/.test(candidate.id) && !rooms.some((room) => room.id === candidate.id)
      ? candidate.id : nextRoomId(rooms);
    rooms.push({ id, type: candidate.type, x: candidate.x, y: candidate.y, width: ROOM_SIZE, height: ROOM_SIZE,
      ...(candidate.type === 'generator' ? { operational: candidate.operational === true } : {}) });
  }
  return rooms;
}

export function getBuildSlots(rooms) {
  if (rooms.length >= MAX_ROOMS) return [];
  const slots = [];
  const occupied = new Set(rooms.map(({ x, y }) => `${x},${y}`));
  for (const room of rooms) {
    for (const [direction, [dx, dy]] of Object.entries(SIDES)) {
      const x = room.x + dx;
      const y = room.y + dy;
      if (occupied.has(`${x},${y}`) || Math.abs(x) > 50 || Math.abs(y) > 50) continue;
      if (!slots.some((slot) => slot.x === x && slot.y === y)) slots.push({ anchorId: room.id, direction, x, y });
    }
  }
  return slots;
}

export function calculateBunkerCapacity(rooms) {
  return rooms.reduce((sum, room) => sum + (ROOM_TYPES[room.type]?.capacity ?? 0), 0);
}

export function normalizeBunkerPlayer(value, rooms) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isInteger(x) && Number.isInteger(y) && getRoomAt(rooms, x, y)
    ? { x, y, facing: ['north', 'south', 'east', 'west'].includes(value.facing) ? value.facing : 'south' }
    : { x: 2, y: 2, facing: 'south' };
}

export function buildBunkerRoom(state, type, anchorId, direction) {
  const rooms = normalizeBunkerRooms(state.bunker_rooms);
  const specification = ROOM_TYPES[type];
  if (!state.is_wasteland || !specification || type === 'vault') return { ...state, notice: 'Módulo de construção inválido.' };
  const slot = getBuildSlots(rooms).find((item) => item.anchorId === anchorId && item.direction === direction);
  if (!slot) return { ...state, notice: 'Escolha uma parede externa livre para anexar a sala.' };
  if ((Number(state.scrap) || 0) < specification.cost) return { ...state, notice: 'Sucata insuficiente para construir este módulo.' };
  const room = { id: nextRoomId(rooms), type, x: slot.x, y: slot.y, width: ROOM_SIZE, height: ROOM_SIZE,
    ...(type === 'generator' ? { operational: false } : {}) };
  return {
    ...state,
    scrap: state.scrap - specification.cost,
    bunker_rooms: [...rooms, room],
    notice: `${specification.name} conectado ao bunker. Capacidade: ${calculateBunkerCapacity([...rooms, room])} moradores.`,
  };
}

export function repairBunkerGenerator(state, roomId) {
  const rooms = normalizeBunkerRooms(state.bunker_rooms);
  const room = rooms.find((item) => item.id === roomId && item.type === 'generator');
  if (!state.is_wasteland || !room) return { ...state, notice: 'Gerador indisponível.' };
  if (room.operational) return { ...state, notice: 'Este gerador já está operacional.' };
  if ((Number(state.scrap) || 0) < 25) return { ...state, notice: 'Sucata insuficiente para reparar o gerador.' };
  return {
    ...state,
    scrap: state.scrap - 25,
    bunker_rooms: rooms.map((item) => item.id === roomId ? { ...item, operational: true } : item),
    notice: 'Gerador reparado. A produção de sucata aumentará no próximo mês.',
  };
}

export function moveIsometricActor(actor, key, rooms) {
  const move = MOVES[key];
  if (!move) return actor;
  const [dx, dy, direction] = move;
  const current = getRoomAt(rooms, actor.x, actor.y);
  const destination = getRoomAt(rooms, actor.x + dx, actor.y + dy);
  if (!current || !destination) return actor;
  if (current.id !== destination.id) {
    if (neighbor(rooms, current, direction)?.id !== destination.id) return actor;
    const centered = dx ? actor.y === current.y + 2 : actor.x === current.x + 2;
    if (!centered) return actor;
  }
  return { x: actor.x + dx, y: actor.y + dy };
}

export function createBunkerNpcs(rooms) {
  return rooms.flatMap((room) => {
    const count = room.type === 'dormitory' ? 2 : 1;
    return Array.from({ length: count }, (_, index) => ({
      id: `${room.id}-resident-${index}`,
      x: room.x + 1 + index * 2,
      y: room.y + 2,
      facing: 'south',
    }));
  });
}

export function stepBunkerNpcs(npcs, rooms, random = Math.random) {
  const keys = ['w', 'a', 's', 'd'];
  return npcs.map((npc) => {
    const key = keys[Math.min(3, Math.floor(random() * 4))];
    const next = moveIsometricActor(npc, key, rooms);
    return next === npc ? npc : { ...npc, ...next, facing: MOVES[key][2] };
  });
}

function polygon(ctx, points, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function tileGeometry(x, y, origin) {
  const center = cartesianToIsometric(x + .5, y + .5);
  center.x += origin.x;
  center.y += origin.y;
  return {
    center,
    north: { x: center.x, y: center.y - TILE_HEIGHT / 2 },
    east: { x: center.x + TILE_WIDTH / 2, y: center.y },
    south: { x: center.x, y: center.y + TILE_HEIGHT / 2 },
    west: { x: center.x - TILE_WIDTH / 2, y: center.y },
  };
}

function drawFloor(ctx, room, x, y, origin) {
  const tile = tileGeometry(x, y, origin);
  const tint = ROOM_TYPES[room.type].accent;
  const surface = ctx.createLinearGradient(tile.center.x, tile.north.y, tile.center.x, tile.south.y);
  surface.addColorStop(0, '#3e4240');
  surface.addColorStop(.62, '#242a2a');
  surface.addColorStop(1, '#111819');
  polygon(ctx, [tile.north, tile.east, tile.south, tile.west], surface, 'rgba(140, 151, 144, .24)');
  ctx.strokeStyle = 'rgba(181, 190, 179, .13)';
  ctx.beginPath();
  ctx.moveTo(tile.west.x + 8, tile.west.y);
  ctx.lineTo(tile.east.x - 8, tile.east.y);
  ctx.moveTo(tile.north.x, tile.north.y + 5);
  ctx.lineTo(tile.south.x, tile.south.y - 5);
  ctx.stroke();
  if ((x + y) % 3 === 0) {
    ctx.fillStyle = 'rgba(224, 154, 87, .36)';
    ctx.fillRect(tile.center.x - 2, tile.center.y - 2, 3, 3);
  }
  if (x === room.x + 2 && y === room.y + 2) {
    ctx.fillStyle = tint;
    ctx.fillRect(tile.center.x - 9, tile.center.y + 8, 18, 2);
  }
}

function drawWall(ctx, tile, side, accent) {
  const endpoints = {
    north: [tile.west, tile.north], west: [tile.north, tile.east],
    east: [tile.south, tile.west], south: [tile.east, tile.south],
  }[side];
  const [start, end] = endpoints;
  const upperStart = { x: start.x, y: start.y - WALL_HEIGHT };
  const upperEnd = { x: end.x, y: end.y - WALL_HEIGHT };
  const face = ctx.createLinearGradient(start.x, upperStart.y, end.x, end.y);
  face.addColorStop(0, side === 'north' || side === 'west' ? '#4b5050' : '#343a3b');
  face.addColorStop(1, '#171e20');
  polygon(ctx, [upperStart, upperEnd, end, start], face, '#0c1112');
  polygon(ctx, [upperStart, upperEnd, { x: upperEnd.x, y: upperEnd.y - 6 }, { x: upperStart.x, y: upperStart.y - 6 }], '#646766', accent);
  ctx.strokeStyle = 'rgba(195, 145, 89, .21)';
  ctx.beginPath();
  ctx.moveTo(upperStart.x, upperStart.y + 16);
  ctx.lineTo(upperEnd.x, upperEnd.y + 16);
  ctx.stroke();
}

function drawRoomWalls(ctx, rooms, room, origin, front) {
  for (const side of front ? ['east', 'south'] : ['north', 'west']) {
    // A parede partilhada é desenhada uma única vez, com uma passagem no centro.
    if (!front && neighbor(rooms, room, side)) continue;
    for (let index = 0; index < ROOM_SIZE; index += 1) {
      if (index === 2 && neighbor(rooms, room, side)) continue;
      const x = room.x + (side === 'west' ? 0 : side === 'east' ? 4 : index);
      const y = room.y + (side === 'north' ? 0 : side === 'south' ? 4 : index);
      drawWall(ctx, tileGeometry(x, y, origin), side, ROOM_TYPES[room.type].accent);
    }
  }
}

function drawMachine(ctx, room, origin) {
  const { x, y } = tileGeometry(room.x + 2, room.y + 2, origin).center;
  const glow = ctx.createRadialGradient(x, y - 15, 2, x, y - 15, 86);
  glow.addColorStop(0, `${ROOM_TYPES[room.type].accent}66`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y - 15, 86, 0, Math.PI * 2); ctx.fill();
  if (room.type === 'dormitory') {
    for (const dx of [-24, 24]) {
      polygon(ctx, [{ x: x + dx - 15, y: y - 5 }, { x: x + dx + 4, y: y - 15 }, { x: x + dx + 14, y: y - 8 }, { x: x + dx - 5, y: y + 2 }], '#5e6663', '#a7aca5');
    }
  } else {
    ctx.fillStyle = room.type === 'greenhouse' ? '#355044' : '#343a3d';
    ctx.fillRect(x - 22, y - 34, 44, 27);
    ctx.fillStyle = ROOM_TYPES[room.type].accent;
    ctx.fillRect(x - 14, y - 28, 28, 5);
    ctx.fillStyle = '#11191b';
    ctx.fillRect(x - 24, y - 7, 48, 8);
  }
}

function drawActor(ctx, actor, origin, player = false) {
  const center = tileGeometry(actor.x, actor.y, origin).center;
  const direction = { north: -.65, south: 2.5, east: .65, west: -2.5 }[actor.facing] ?? 2.5;
  ctx.save();
  ctx.translate(center.x, center.y - 8);
  ctx.rotate(direction);
  ctx.fillStyle = 'rgba(0, 0, 0, .48)';
  ctx.beginPath(); ctx.ellipse(0, 12, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = player ? '#d99049' : '#828f8b';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bcaa91';
  ctx.beginPath(); ctx.arc(0, -6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = player ? '#ffe6a8' : '#c9d3ca';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -16); ctx.stroke();
  ctx.restore();
}

function buildMarker(ctx, slot, rooms, origin) {
  const anchor = rooms.find((room) => room.id === slot.anchorId);
  const centers = {
    north: [anchor.x + 2, anchor.y], south: [anchor.x + 2, anchor.y + 4],
    west: [anchor.x, anchor.y + 2], east: [anchor.x + 4, anchor.y + 2],
  };
  const [x, y] = centers[slot.direction];
  const tile = tileGeometry(x, y, origin);
  const point = {
    north: { x: (tile.west.x + tile.north.x) / 2, y: (tile.west.y + tile.north.y) / 2 - 24 },
    south: { x: (tile.east.x + tile.south.x) / 2, y: (tile.east.y + tile.south.y) / 2 - 24 },
    west: { x: (tile.north.x + tile.east.x) / 2, y: (tile.north.y + tile.east.y) / 2 - 24 },
    east: { x: (tile.south.x + tile.west.x) / 2, y: (tile.south.y + tile.west.y) / 2 - 24 },
  }[slot.direction];
  ctx.fillStyle = '#f7b653';
  ctx.beginPath(); ctx.arc(point.x, point.y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#19150f';
  ctx.font = 'bold 21px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+', point.x, point.y);
  return { ...slot, screenX: point.x, screenY: point.y };
}

export function renderIsometricBunker(ctx, rooms, player, npcs, viewport, buildMode = false) {
  ctx.fillStyle = '#161b1c';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  const playerProjection = cartesianToIsometric(player.x + .5, player.y + .5);
  const origin = { x: viewport.width / 2 - playerProjection.x, y: viewport.height * .54 - playerProjection.y };
  const floorTiles = rooms.flatMap((room) => Array.from({ length: ROOM_SIZE * ROOM_SIZE }, (_, index) => ({
    room, x: room.x + index % ROOM_SIZE, y: room.y + Math.floor(index / ROOM_SIZE),
  }))).sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const tile of floorTiles) drawFloor(ctx, tile.room, tile.x, tile.y, origin);
  for (const room of rooms) drawRoomWalls(ctx, rooms, room, origin, false);
  for (const room of rooms) drawMachine(ctx, room, origin);
  const actors = [...npcs.map((npc) => ({ ...npc, isPlayer: false })), { ...player, isPlayer: true }]
    .sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const actor of actors) drawActor(ctx, actor, origin, actor.isPlayer);
  for (const room of rooms) drawRoomWalls(ctx, rooms, room, origin, true);
  if (!buildMode) return [];
  return getBuildSlots(rooms).map((slot) => buildMarker(ctx, slot, rooms, origin));
}

export function createIsometricBunkerEngine(canvas, { rooms: roomInput, initialPlayer, onBuild, onInteract, onRoomChange, onMove } = {}) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;
  const rooms = normalizeBunkerRooms(roomInput);
  const spawn = normalizeBunkerPlayer(initialPlayer, rooms);
  let player = { ...spawn, currentRoom: getRoomAt(rooms, spawn.x, spawn.y)?.id ?? 'vault', facing: spawn.facing ?? 'south' };
  let npcs = createBunkerNpcs(rooms);
  let visualPlayer = { ...player };
  let visualNpcs = npcs.map((npc) => ({ ...npc }));
  let buildMode = false;
  let buildType = 'dormitory';
  let paused = false;
  let active = true;
  let frameId = null;
  let lastFrame = 0;
  let lastRender = 0;
  let npcElapsed = 0;
  let hitZones = [];

  const render = () => {
    const width = Math.max(320, canvas.clientWidth || canvas.width || 720);
    const height = Math.max(320, canvas.clientHeight || canvas.height || 720);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    hitZones = renderIsometricBunker(ctx, rooms, visualPlayer, visualNpcs, { width, height }, buildMode);
  };

  const frame = (timestamp) => {
    if (!active) return;
    const delta = Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1000));
    const smoothing = Math.min(1, delta * 14);
    if (!paused) {
      npcElapsed += Math.max(0, Math.min(100, timestamp - lastFrame));
      if (npcElapsed >= 850) { npcs = stepBunkerNpcs(npcs, rooms); npcElapsed = 0; }
      visualPlayer = {
        ...player,
        x: visualPlayer.x + (player.x - visualPlayer.x) * smoothing,
        y: visualPlayer.y + (player.y - visualPlayer.y) * smoothing,
      };
      visualNpcs = npcs.map((npc, index) => ({
        ...npc,
        x: visualNpcs[index].x + (npc.x - visualNpcs[index].x) * smoothing,
        y: visualNpcs[index].y + (npc.y - visualNpcs[index].y) * smoothing,
      }));
    }
    lastFrame = timestamp;
    if (timestamp - lastRender >= 33) { render(); lastRender = timestamp; }
    frameId = requestAnimationFrame(frame);
  };

  const move = (key) => {
    if (!active || paused || !MOVES[key]) return;
    const next = moveIsometricActor(player, key, rooms);
    if (next !== player) {
      const currentRoom = getRoomAt(rooms, next.x, next.y);
      player = { ...player, ...next, facing: MOVES[key][2], currentRoom: currentRoom.id };
      onMove?.({ x: player.x, y: player.y, facing: player.facing });
      onRoomChange?.(currentRoom);
      render();
    }
  };

  const interact = () => {
    if (!active || paused || buildMode) return;
    paused = true;
    onInteract?.(getRoomAt(rooms, player.x, player.y));
  };

  const keydown = (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'e') interact();
    else if (MOVES[key]) move(key);
    else return;
    event.preventDefault();
  };

  const click = (event) => {
    if (!buildMode || paused) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (canvas.height / bounds.height);
    const slot = hitZones.find((zone) => Math.hypot(zone.screenX - x, zone.screenY - y) <= 19);
    if (slot) onBuild?.(buildType, slot);
    canvas.focus();
  };

  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('click', click);
  canvas.focus();
  render();
  if (typeof requestAnimationFrame === 'function') frameId = requestAnimationFrame(frame);

  return {
    getState: () => ({ player: { ...player }, npcs: npcs.map((npc) => ({ ...npc })) }),
    move,
    interact,
    setBuildMode(value) { buildMode = Boolean(value); render(); canvas.focus(); },
    setBuildType(type) { if (ROOM_TYPES[type] && type !== 'vault') buildType = type; render(); canvas.focus(); },
    resume() { paused = false; canvas.focus(); },
    destroy() {
      active = false;
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      canvas.removeEventListener('keydown', keydown);
      canvas.removeEventListener('click', click);
    },
  };
}
