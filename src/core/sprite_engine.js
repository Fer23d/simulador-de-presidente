import { FLOOR_SPACING, ROOM_HEIGHT, SLOT_WIDTH, WORLD_LEFT, WORLD_TOP } from './shelter_engine.js';

const SURFACE_Y = WORLD_TOP - 30;
const ATLAS_CELLS = Object.freeze({
  vault: [0, 0], elevator: [1, 0], dormitory: [2, 0],
  generator: [0, 1], greenhouse: [1, 1], arsenal: [2, 1],
  medical: [0, 2], radio: [1, 2], office: [2, 2],
});
const ACTOR_COLUMNS = Object.freeze({ resident: 0, engineer: 0, scientist: 1, medic: 2, guard: 3 });

export const DEFAULT_ASSETS = Object.freeze({
  bg_sky: './assets/img/bg_sky.png',
  bg_mountains: './assets/img/bg_mountains.png',
  fg_wasteland: './assets/img/fg_wasteland.png',
  dirt_texture: './assets/img/dirt_texture.png',
  room_atlas: './assets/img/room_atlas.png',
  elevator_cabin: './assets/img/elevator_cabin.png',
  character_sheet: './assets/img/character_sheet.png',
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

function renderSurface(ctx, camera, assets) {
  const boundary = SURFACE_Y + camera.offset_y;
  if (boundary <= 0) return;
  drawRepeatingLayer(ctx, assets.getImage('bg_sky'), camera.offset_x * .08, boundary - 520, 1400, 540);
  drawRepeatingLayer(ctx, assets.getImage('bg_mountains'), camera.offset_x * .2, boundary - 230, 1400, 260);
  drawRepeatingLayer(ctx, assets.getImage('fg_wasteland'), camera.offset_x, boundary - 180, 1600, 210);
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

function drawRoomSprite(ctx, room, assets) {
  const x = WORLD_LEFT + room.column * SLOT_WIDTH;
  const y = WORLD_TOP + room.floor * FLOOR_SPACING;
  const individual = assets.getImage(`room_${room.type}`);
  if (individual) { drawOrMissing(ctx, individual, x, y, SLOT_WIDTH, ROOM_HEIGHT); return; }
  const atlas = assets.getImage('room_atlas');
  const [column, row] = ATLAS_CELLS[room.type] ?? ATLAS_CELLS.vault;
  const cellWidth = atlas?.width / 3;
  const cellHeight = atlas?.height / 3;
  drawOrMissing(ctx, atlas, x, y, SLOT_WIDTH, ROOM_HEIGHT,
    atlas ? [column * cellWidth, row * cellHeight, cellWidth, cellHeight] : null);
}

export function drawActorSprite(ctx, actor, image, time = 0) {
  const frameWidth = image?.width / 4;
  const frameHeight = image?.height / 2;
  const walking = Math.abs(actor.vx ?? 0) > 1;
  const frame = actor.role === 'president'
    ? (walking ? 1 + Math.floor(time / 140) % 3 : 0)
    : ACTOR_COLUMNS[actor.role] ?? 0;
  const row = actor.role === 'president' ? 0 : 1;
  const width = actor.role === 'president' ? 72 : 60;
  const height = actor.role === 'president' ? 110 : 96;
  ctx.save();
  ctx.translate(actor.x, actor.y);
  if (actor.facing === -1) ctx.scale(-1, 1);
  drawOrMissing(ctx, image, -width / 2, -height, width, height,
    image ? [frame * frameWidth, row * frameHeight, frameWidth, frameHeight] : null);
  ctx.restore();
}

export function renderSpriteScene(ctx, { grid, player, camera, assets, inhabitants = [], cabinFloor = player.floor, time = 0 }) {
  renderSurface(ctx, camera, assets);
  renderDirt(ctx, camera, assets);
  ctx.save();
  ctx.translate(camera.offset_x, camera.offset_y);
  const atlas = assets.getImage('room_atlas');
  for (let floor = 0; floor < grid.length; floor++) {
    for (let column = 0; column < grid[floor].length; column++) {
      const room = grid[floor][column];
      if (!room) continue;
      drawRoomSprite(ctx, room, assets);
      if (room.type === 'elevator' && atlas && grid[floor + 1]?.[column]?.type === 'elevator') {
        const cellWidth = atlas.width / 3;
        const cellHeight = atlas.height / 3;
        drawOrMissing(ctx, atlas, WORLD_LEFT + column * SLOT_WIDTH,
          WORLD_TOP + floor * FLOOR_SPACING + ROOM_HEIGHT, SLOT_WIDTH, FLOOR_SPACING - ROOM_HEIGHT,
          [cellWidth, 0, cellWidth, cellHeight]);
      }
    }
  }
  const cabinY = player.liftTarget !== null ? player.y : WORLD_TOP + cabinFloor * FLOOR_SPACING + ROOM_HEIGHT - 19;
  drawOrMissing(ctx, assets.getImage('elevator_cabin'), WORLD_LEFT + 74, cabinY - 129, 116, 129);
  const sheet = assets.getImage('character_sheet');
  for (const npc of inhabitants) {
    const x = WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + npc.offsetX;
    const y = WORLD_TOP + npc.floor * FLOOR_SPACING + ROOM_HEIGHT - 19;
    drawActorSprite(ctx, { ...npc, x, y }, sheet, time);
  }
  drawActorSprite(ctx, { ...player, role: 'president' }, sheet, time);
  ctx.restore();
}
