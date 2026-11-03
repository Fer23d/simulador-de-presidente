import {
  cellCenter, findBuildSlots, getCellAtPoint, getRoom, INITIAL_SHELTER_GRID,
  MAX_COLUMNS, MAX_FLOORS, ROOM_HEIGHT, SHELTER_TYPES, SLOT_WIDTH,
  FLOOR_SPACING, WORLD_LEFT, WORLD_TOP,
} from './shelter_engine.js';
import { findOilDerrickAt } from './oil_renderer.js';
import { isFortAt } from './defense_renderer.js';
import { isMarketAt, MARKET_X } from './market_renderer.js';
import { hasMarketSuit } from './market.js';
import { DEFAULT_ASSETS, drawNeedsPanel, getActorPlacement, getSharedAssetManager, renderSpriteScene } from './sprite_engine.js';
import { isLootboxCrateClick } from './lootbox_renderer.js';
import { Inhabitant } from './inhabitant.js';
import { canPetDog, createDogActor, petDog, updateDogActor } from './companion.js';
import { advanceEnvironmentCycle, countActiveGenerators, createEnvironmentState, FULL_CYCLE_MS, getNpcMovementDelta } from './environment.js';
import { chooseDialogueLine } from './dialogues.js';
import { normalizeNeeds } from './needs.js';
import { generateResidentIdentity, resolveResidentIdentity } from './names.js';
import { advanceWeather, createWeatherState } from './weather.js';
import { translateUiText } from './i18n.js';

// Movimento mais responsivo; a simulação continua usando delta time para manter a mesma distância em qualquer FPS.
const WALK_SPEED = 220;
const LIFT_SPEED = 360;
const PLAYER_RADIUS = 14;
// Andar -1 e a superficie: so se chega la pelo elevador, e so de Traje Antirradiacao.
export const SURFACE_FLOOR = -1;
export const SURFACE_GROUND_Y = WORLD_TOP - 30;
const SURFACE_MAX_X = 1160;
const MARKET_REACH = 120;
const MAX_SIMULATION_STEP = 1 / 30;
const SURFACE_DOG_BOUNDS = Object.freeze({ min: WORLD_LEFT + 20, max: SURFACE_MAX_X - 20 });

function groundYFor(floor) {
  return floor === SURFACE_FLOOR ? SURFACE_GROUND_Y : cellCenter(floor, 0).y;
}
const TRIGGER_RADIUS = 70;
// No andar da superfície a câmera deixa uma faixa de céu acima do personagem.
// Assim as lanternas e a cobertura completa do Forte não encostam no HUD.
const SURFACE_CAMERA_HEADROOM = 46;
const LABELS = Object.freeze({
  vault: 'ACEDER AO COMANDO', generator: 'ACEDER AO TERMINAL DO GERADOR',
  greenhouse: 'INSPECIONAR A ESTUFA', dormitory: 'GERIR DORMITÓRIO',
  arsenal: 'ABRIR O ARSENAL', medical: 'ACEDER AO CENTRO MÉDICO', radiation_clinic: 'ENTRAR NA SALA DE TRATAMENTO',
  radio: 'OPERAR A SALA DE RÁDIO', office: 'ENTRAR NO GABINETE',
  life_support: 'ACEDER AO SUPORTE DE VIDA',
  detention: 'INSPECIONAR A CELA DE DETENÇÃO',
  presidential_suite: 'ABRIR O GUARDA-ROUPA',
});

export function createRpgPlayer(grid = INITIAL_SHELTER_GRID) {
  const start = getRoom(grid, 0, 1) ? cellCenter(0, 1) : cellCenter(0, 0);
  return { x: start.x, y: start.y, floor: 0, vx: 0, vy: 0, facing: 1, liftTarget: null, liftHeld: false };
}

export function normalizeRpgPlayer(value, grid) {
  const fallback = createRpgPlayer(grid);
  if (!value || !Number.isInteger(value.floor) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return fallback;
  if (value.floor === SURFACE_FLOOR) {
    return { x: Math.max(WORLD_LEFT + PLAYER_RADIUS, Math.min(SURFACE_MAX_X, value.x)), y: SURFACE_GROUND_Y, floor: SURFACE_FLOOR,
      vx: 0, vy: 0, facing: value.facing === -1 ? -1 : 1, liftTarget: null, liftHeld: false };
  }
  const column = Math.floor((value.x - WORLD_LEFT) / SLOT_WIDTH);
  if (!getRoom(grid, value.floor, column)) return fallback;
  return { x: value.x, y: cellCenter(value.floor, column).y, floor: value.floor,
    vx: 0, vy: 0, facing: value.facing === -1 ? -1 : 1, liftTarget: null, liftHeld: false };
}

function playerColumn(player) {
  return Math.floor((player.x - WORLD_LEFT) / SLOT_WIDTH);
}

export function getElevatorPrompt(player, grid, { surface = false, suit = false } = {}) {
  if (player.liftTarget !== null) return '';
  if (player.floor === SURFACE_FLOOR) {
    return Math.abs(player.x - cellCenter(0, 0).x) <= 42 ? '[ S ] DESCER' : '';
  }
  if (getRoom(grid, player.floor, playerColumn(player))?.type !== 'elevator') return '';
  if (Math.abs(player.x - cellCenter(player.floor, playerColumn(player)).x) > 42) return '';
  const up = getRoom(grid, player.floor - 1, 0)?.type === 'elevator';
  const down = getRoom(grid, player.floor + 1, 0)?.type === 'elevator';
  const toSurface = surface && player.floor === 0 && playerColumn(player) === 0;
  const surfaceLabel = !toSurface ? '' : suit ? '[ W ] SUBIR À SUPERFÍCIE' : '[ W ] SUPERFÍCIE: EXIGE TRAJE ANTIRRADIAÇÃO';
  return [up ? '[ W ] SUBIR' : '', surfaceLabel, down ? '[ S ] DESCER' : ''].filter(Boolean).join('   |   ');
}

export function findNearbyTrigger(player, grid, language = 'pt-BR') {
  if (player.liftTarget !== null) return null;
  const room = getRoom(grid, player.floor, playerColumn(player));
  if (!room || room.type === 'elevator') return null;
  const center = cellCenter(room.floor, room.column);
  return Math.abs(player.x - center.x) <= TRIGGER_RADIUS
    ? { room, label: translateUiText(`[ E ] ${LABELS[room.type] ?? 'GERIR SALA'}`, language) } : null;
}

export function findNearbyInhabitant(player, grid, inhabitants = [], range = 50) {
  if (!player || player.liftTarget !== null) return null;
  const room = getRoom(grid, player.floor, playerColumn(player));
  if (!room || room.type === 'elevator') return null;
  let nearest = null;
  for (const npc of inhabitants) {
    if (!npc || npc.is_on_expedition || npc.is_prisoner || npc.currentState === 'rebel'
      || npc.floor !== room.floor || npc.column !== room.column) continue;
    const npcX = WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + (Number(npc.offsetX) || 0);
    const npcY = cellCenter(npc.floor, npc.column).y;
    const distance = Math.hypot(player.x - npcX, player.y - npcY);
    if (distance <= range && (!nearest || distance < nearest.distance)) nearest = { npc, distance };
  }
  return nearest ? { ...nearest, label: '[ E ] FALAR' } : null;
}

export function createNearbyInhabitantTracker(intervalMs = 200) {
  const refreshInterval = Number.isFinite(Number(intervalMs)) ? Math.max(0, Number(intervalMs)) : 200;
  let checkedAt = -Infinity;
  let roomKey = '';
  let result = null;
  return (player, grid, inhabitants, now, force = false) => {
    const nextRoomKey = player ? `${player.floor}:${playerColumn(player)}` : '';
    const timestamp = Number.isFinite(Number(now)) ? Number(now) : 0;
    if (force || nextRoomKey !== roomKey || timestamp - checkedAt >= refreshInterval) {
      roomKey = nextRoomKey;
      checkedAt = timestamp;
      result = findNearbyInhabitant(player, grid, inhabitants);
    }
    return result;
  };
}

function drawPacificationFeedback(ctx, npc, camera, elapsed, language = 'pt-BR') {
  const x = WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + (Number(npc.offsetX) || 0) + camera.offset_x;
  const y = cellCenter(npc.floor, npc.column).y + camera.offset_y - 75 - elapsed * .025;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - elapsed / 1_600);
  ctx.font = 'bold 16px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#39ff14';
  ctx.shadowColor = '#39ff14';
  ctx.shadowBlur = 8;
  ctx.fillText(translateUiText('+15 LEALDADE', language), x, y);
  ctx.restore();
}

export function findNearbyRebel(player, grid, inhabitants = [], language = 'pt-BR') {
  if (player.liftTarget !== null) return null;
  const column = playerColumn(player);
  let nearest = null;
  for (const npc of inhabitants) {
    if (npc.currentState !== 'rebel' || npc.is_prisoner || npc.is_on_expedition
      || npc.floor !== player.floor || npc.column !== column) continue;
    const distance = Math.abs(player.x - (WORLD_LEFT + npc.column * SLOT_WIDTH + SLOT_WIDTH / 2 + npc.offsetX));
    if (distance <= 48 && (!nearest || distance < nearest.distance)) nearest = { npc, distance };
  }
  if (!nearest) return null;
  const hasCell = grid.some((floor) => floor.some((room) => room?.type === 'detention'));
  const label = hasCell ? '[ E ] PRENDER DISSIDENTE' : '[ E ] CONSTRUA UMA CELA PARA PRENDER O DISSIDENTE';
  return { npc: nearest.npc, label: translateUiText(label, language) };
}

export function updatePlayer(player, input, grid, deltaSeconds, oxygenDeprived = false) {
  const dt = Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
  const movementScale = oxygenDeprived ? 0.5 : 1;
  const next = { ...player };
  next.liftHeld = Boolean(input.up || input.down);
  if (next.liftTarget !== null) {
    const destination = groundYFor(next.liftTarget);
    const distance = destination - next.y;
    // O elevador usa um passo maior que o andar: com quadros lentos ele nao deve se arrastar.
    const liftDt = Math.max(0, Math.min(0.12, Number(deltaSeconds) || 0));
    next.y += Math.sign(distance) * Math.min(Math.abs(distance), LIFT_SPEED * movementScale * liftDt);
    next.vx = 0;
    next.vy = 0;
    if (next.y === destination) {
      next.floor = next.liftTarget;
      next.liftTarget = null;
    }
    return next;
  }
  const elevator = getElevatorPrompt(next, grid, { surface: input.surface, suit: input.suit });
  if (elevator && !player.liftHeld && ((input.up && elevator.includes('SUBIR')) || (input.down && elevator.includes('DESCER')))) {
    next.liftTarget = next.floor + (input.up ? -1 : 1);
    next.x = cellCenter(next.floor, 0).x;
    next.vx = 0;
    return next;
  }
  const direction = Number(Boolean(input.right)) - Number(Boolean(input.left));
  next.vx = direction * WALK_SPEED * movementScale;
  if (direction) next.facing = direction;
  if (next.floor === SURFACE_FLOOR) {
    next.x = Math.max(WORLD_LEFT + PLAYER_RADIUS, Math.min(SURFACE_MAX_X, next.x + next.vx * dt));
    next.y = SURFACE_GROUND_Y;
    next.vy = 0;
    return next;
  }
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
    { id: 'vault-resident-1', floor: 0, column: 1, offsetX: -78, currentRoomId: 'vault-0-1', role: 'resident', pose: 'seated', facing: 1,
      currentState: 'idle', targetOffsetX: null, waitSeconds: 1, loyalty: 100,
      revoltChance: 20, lastTalkedDay: 0,
      ...generateResidentIdentity('vault-resident-1'), isVIP: false, modifier: 1,
      workFloor: null, workColumn: null, state: 'idle', rebellionCheckDone: false,
      is_on_expedition: false, expedition_timer: 0, is_prisoner: false, needs: normalizeNeeds() },
    { id: 'vault-engineer-1', floor: 0, column: 1, offsetX: 78, currentRoomId: 'vault-0-1', role: 'engineer', pose: 'working', facing: -1,
      currentState: 'idle', targetOffsetX: null, waitSeconds: 1, loyalty: 100,
      revoltChance: 20, lastTalkedDay: 0,
      ...generateResidentIdentity('vault-engineer-1'), isVIP: false, modifier: 1,
      workFloor: null, workColumn: null, state: 'idle', rebellionCheckDone: false,
      is_on_expedition: false, expedition_timer: 0, is_prisoner: false, needs: normalizeNeeds() },
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
    const targetOffsetX = Number.isFinite(npc.targetOffsetX)
      ? Math.max(-108, Math.min(108, npc.targetOffsetX)) : null;
    const room = getRoom(grid, npc.floor, npc.column);
    const legacyWorkRoom = (room?.type === 'greenhouse' || room?.type === 'laboratory') && npc.role === 'scientist'
      || room?.type === 'generator' && npc.role === 'engineer';
    result.push({ id: npc.id, floor: npc.floor, column: npc.column,
      offsetX: Math.max(-108, Math.min(108, Number(npc.offsetX) || 0)),
      ...resolveResidentIdentity(npc),
      isVIP: npc.isVIP === true,
      modifier: Math.max(1, Math.min(5, Number(npc.modifier) || (npc.isVIP === true ? 2 : 1))),
      role: ['resident', 'engineer', 'scientist', 'medic', 'guard'].includes(npc.role) ? npc.role : 'resident',
      pose: ['idle', 'seated', 'working'].includes(npc.pose) ? npc.pose : 'idle',
      facing: npc.facing === -1 ? -1 : 1,
      currentState: npc.currentState === 'rebel' ? 'rebel'
        : targetOffsetX !== null && ['walking_left', 'walking_right'].includes(npc.currentState) ? npc.currentState : 'idle',
      targetOffsetX: npc.currentState === 'rebel' ? null : targetOffsetX,
      waitSeconds: Number.isFinite(npc.waitSeconds) ? Math.max(0, Math.min(6, npc.waitSeconds)) : 1,
      loyalty: Math.max(0, Math.min(100, Number(npc.loyalty ?? 100))),
      revoltChance: Math.max(0, Math.min(100, Number(npc.revoltChance ?? 20))),
      lastTalkedDay: Math.max(0, Math.floor(Number(npc.lastTalkedDay) || 0)),
      workFloor: Number.isInteger(npc.workFloor) ? npc.workFloor : legacyWorkRoom ? npc.floor : null,
      workColumn: Number.isInteger(npc.workColumn) ? npc.workColumn : legacyWorkRoom ? npc.column : null,
      currentRoomId: typeof npc.currentRoomId === 'string' && grid.flat().some((room) => room?.id === npc.currentRoomId)
        ? npc.currentRoomId : grid.flat().find((candidate) => candidate?.floor === (npc.workFloor ?? (legacyWorkRoom ? npc.floor : null))
          && candidate?.column === (npc.workColumn ?? (legacyWorkRoom ? npc.column : null)))?.id ?? room.id,
      ...(typeof npc.previousRoomId === 'string' && grid.flat().some((candidate) => candidate?.id === npc.previousRoomId)
        ? { previousRoomId: npc.previousRoomId } : {}),
      state: npc.is_prisoner === true || npc.state === 'imprisoned' ? 'imprisoned'
        : npc.state === 'working' ? 'working' : 'idle',
      rebellionCheckDone: npc.rebellionCheckDone === true,
      is_on_expedition: npc.is_on_expedition === true,
      expedition_timer: Math.max(0, Math.floor(Number(npc.expedition_timer) || 0)),
      ...(typeof npc.expedition_destination === 'string' && npc.expedition_destination.trim()
        ? { expedition_destination: npc.expedition_destination.slice(0, 120) } : {}),
      ...(typeof npc.expedition_sector === 'string' && /^\d-\d$/.test(npc.expedition_sector)
        ? { expedition_sector: npc.expedition_sector } : {}),
      is_prisoner: npc.is_prisoner === true,
      needs: normalizeNeeds(npc.needs) });
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

export const renderRpgBunker = renderSpriteScene;

export function createRpgBunkerEngine(canvas, { grid = INITIAL_SHELTER_GRID, player: savedPlayer,
  inhabitants = [], cabinFloor: savedCabinFloor, onBuild, onRoom, onPlayerChanged, onInhabitantsChanged, onHint,
  onDetain, onAssetsReady, onEnvironmentChanged, environment = {}, isNight = environment?.isNight ?? false, weather: savedWeather = {},
  oxygenDeprived = false, assetUrls = {}, lootbox = {}, onLootboxClick,
  presidentClass = null, equippedSkin = 'default', currentDay = 1, onDayPassed, mission = null, onMission,
  onDialogue, onDialogueAdvance, onDialogueClose, oilDerricks = null, oilFeedback = null, onOilDerrick, surfaceFort = null, onFort, companion = false, dog: savedDog = null, onPet, darkMarket = null, onMarket, escape = null, onEscape, playerName = '', language = 'pt-BR', laydSick = false } = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const assets = getSharedAssetManager({ ...DEFAULT_ASSETS, ...assetUrls });
  let player = normalizeRpgPlayer(savedPlayer, grid);
  let cabinFloor = Number.isInteger(savedCabinFloor) && getRoom(grid, savedCabinFloor, 0)?.type === 'elevator'
    ? savedCabinFloor : player.floor;
  let camera = { offset_x: canvas.width / 2 - player.x, offset_y: canvas.height / 2 - player.y };
  let buildMode = false;
  let buildType = 'dormitory';
  let paused = false;
  let dialogueNpc = null;
  const trackNearbyInhabitant = createNearbyInhabitantTracker();
  let pacificationFeedback = null;
  let destroyed = false;
  let frameId = null;
  let lastTime = 0;
  let lastSave = 0;
  let lastNpcSave = 0;
  let lastEnvironmentNotice = 0;
  let lastEnvironmentSave = 0;
  let lastHint = '';
  let dayNight = createEnvironmentState({ ...environment, isNight });
  let weather = createWeatherState(savedWeather);
  const activeGenerators = countActiveGenerators(grid);
  const keys = new Set();
  const hasSuit = hasMarketSuit(equippedSkin);
  let farMarketHintUntil = 0;
  const dogIsNear = () => Boolean(dog) && dog.floor === player.floor && Math.abs(dog.x - player.x) < 200;
  const nearMarket = () => Boolean(darkMarket) && player.floor === SURFACE_FLOOR && player.liftTarget === null && Math.abs(player.x - MARKET_X) <= MARKET_REACH;
  const actors = inhabitants.map((data) => new Inhabitant(data));
  let dog = companion ? (savedDog ?? createDogActor(player)) : null;

  function savePlayer() { onPlayerChanged?.({ ...player, vx: 0, vy: 0, liftTarget: null }); }
  function frame(time) {
    if (destroyed) return;
    // A aba pode atrasar um frame; limitar o passo evita saltos e filas de trabalho.
    const rawDt = lastTime ? (time - lastTime) / 1000 : 0;
    const dt = Math.max(0, Math.min(MAX_SIMULATION_STEP, Number.isFinite(rawDt) ? rawDt : 0));
    lastTime = time;
    const previousNight = dayNight.isNight;
    const fullCycleProgress = dayNight.elapsedMs + Math.max(0, dt * 1000);
    const daysPassed = Math.floor(fullCycleProgress / FULL_CYCLE_MS);
    dayNight = advanceEnvironmentCycle(dayNight, dt * 1000);
    if (daysPassed > 0) {
      currentDay = Math.max(1, (Number(currentDay) || 1) + daysPassed);
      onDayPassed?.(daysPassed);
    }
    const { changed: weatherChanged, ...nextWeather } = advanceWeather(weather, dt * 1000);
    weather = nextWeather;
    const phaseChanged = previousNight !== dayNight.isNight;
    if (phaseChanged || weatherChanged || time - lastEnvironmentNotice >= 1_000) {
      const persist = phaseChanged || weatherChanged || time - lastEnvironmentSave >= 10_000;
      onEnvironmentChanged?.({ elapsedMs: dayNight.elapsedMs, isNight: dayNight.isNight,
        remainingMs: dayNight.remainingMs, progress: dayNight.progress, weather: { ...weather } },
      { phaseChanged, weatherChanged, persist });
      lastEnvironmentNotice = time;
      if (persist) lastEnvironmentSave = time;
    }
    if (!paused && !buildMode) {
      const previousFloor = player.floor;
      player = updatePlayer(player, { left: keys.has('a') || keys.has('arrowleft'), right: keys.has('d') || keys.has('arrowright'),
        up: keys.has('w') || keys.has('arrowup'), down: keys.has('s') || keys.has('arrowdown'), surface: true, suit: hasSuit }, grid, dt, oxygenDeprived);
      if (player.liftTarget !== null || getRoom(grid, player.floor, playerColumn(player))?.type === 'elevator') cabinFloor = player.floor;
      if (player.floor !== previousFloor) { cabinFloor = player.floor; savePlayer(); }
      if (Math.abs(player.vx) > 0 && time - lastSave > 700) { savePlayer(); lastSave = time; }
      const oxygenMovementDelta = oxygenDeprived ? 0.5 : 1;
      if (dog) dog = updateDogActor(dog, player, dt, {
        // O elevador fica na coluna 0 em todos os andares, inclusive na superfície.
        elevatorX: cellCenter(0, 0).x,
        bounds: { min: WORLD_LEFT + 20, max: WORLD_LEFT + MAX_COLUMNS * SLOT_WIDTH - 20 },
        surfaceBounds: SURFACE_DOG_BOUNDS,
        marketX: darkMarket ? MARKET_X : null,
      });
      for (const actor of actors) actor.update(dt, getNpcMovementDelta(1, dayNight.isNight, activeGenerators) * oxygenMovementDelta);
      if (time - lastNpcSave > 2500) {
        onInhabitantsChanged?.(actors.map((actor) => actor.snapshot()));
        lastNpcSave = time;
      }
    }
    // Com o Mercado Sombrio aberto a camera avanca um pouco a direita para a banca caber na tela.
    const marketPan = 0;
    const targetX = canvas.width / 2 - player.x - marketPan;
    const targetY = canvas.height / 2 - player.y
      + (player.floor <= 0 ? Math.min(SURFACE_CAMERA_HEADROOM, canvas.height * .08) : 0);
    camera.offset_x += (targetX - camera.offset_x) * Math.min(1, dt * 8);
    camera.offset_y += (targetY - camera.offset_y) * Math.min(1, dt * 8);
    renderSpriteScene(ctx, { grid, player, camera, assets, inhabitants: actors, cabinFloor, time, language,
      isNight: dayNight.isNight, activeGenerators, oxygenDeprived, lootbox, presidentClass, equippedSkin,
      weather: weather.type, oilDerricks, oilFeedback, surfaceFort, companion: dog ? { ...dog, sick: laydSick } : null, darkMarket });
    if (escape) {
      // Alarme: o Vault inteiro esta acordado e atras de voce.
      ctx.save();
      ctx.globalAlpha = .06 + (Math.sin(time / 260) + 1) * .045;
      ctx.fillStyle = '#ff1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    const rebel = paused || buildMode ? null : findNearbyRebel(player, grid, actors, language);
    const nearbyInhabitant = paused || buildMode ? null : trackNearbyInhabitant(player, grid, actors, time);
    const nearbyRoom = nearbyInhabitant && getRoom(grid, nearbyInhabitant.npc.floor, nearbyInhabitant.npc.column);
    if (nearbyRoom) {
      const placement = getActorPlacement(nearbyRoom);
      drawNeedsPanel(ctx, WORLD_LEFT + nearbyInhabitant.npc.column * SLOT_WIDTH + SLOT_WIDTH / 2
        + (Number(nearbyInhabitant.npc.offsetX) || 0) + camera.offset_x,
      placement.floorY - placement.height - 26 + camera.offset_y, nearbyInhabitant.npc.needs, language);
    }
    if (pacificationFeedback && time - pacificationFeedback.startedAt < 1_600) {
      drawPacificationFeedback(ctx, pacificationFeedback.npc, camera, time - pacificationFeedback.startedAt, language);
    } else pacificationFeedback = null;
    const roomTrigger = findNearbyTrigger(player, grid, language);
    const missionHere = mission && roomTrigger && roomTrigger.room.floor === mission.floor && roomTrigger.room.column === mission.column;
    const marketPrompt = nearMarket() ? `[ E ] NEGOCIAR COM ${darkMarket.merchant.toUpperCase()}` : '';
    const farHint = time < farMarketHintUntil ? (hasSuit ? 'SOBE PELO ELEVADOR ATÉ A SUPERFÍCIE PARA NEGOCIAR' : 'A SUPERFÍCIE MATA: EQUIPE O TRAJE ANTIRRADIAÇÃO') : '';
    const escapeHint = escape && roomTrigger?.room.type === escape.room ? (escape.room === 'vault' && !dogIsNear() ? 'ESPERE LAYD TE ALCANÇAR' : escape.hint) : '';
    const hint = paused || buildMode ? '' : escapeHint || marketPrompt || farHint || rebel?.label || (missionHere ? `[ E ] RESOLVER: ${mission.title ?? 'PROBLEMA'}` : '')
      || nearbyInhabitant?.label || getElevatorPrompt(player, grid, { surface: true, suit: hasSuit }) || roomTrigger?.label || '';
    if (hint !== lastHint) { lastHint = hint; onHint?.(hint); }
    frameId = requestAnimationFrame(frame);
  }

  function editable() {
    const activeElement = globalThis.document?.activeElement;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement?.tagName) || activeElement?.isContentEditable;
  }
  function finishDialogue() {
    if (!dialogueNpc) return;
    const npc = dialogueNpc;
    dialogueNpc = null;
    paused = false;
    keys.clear();
    const update = onDialogueClose?.(npc);
    if (update && typeof update === 'object') {
      const actor = actors.find((candidate) => candidate.id === npc.id);
      if (actor) Object.assign(actor, update);
      pacificationFeedback = { npc: actor?.snapshot() ?? { ...npc, ...update }, startedAt: performance.now() };
    }
    onHint?.('');
  }
  function advanceDialogue() {
    if (!dialogueNpc) return;
    if (onDialogueAdvance?.(dialogueNpc) === true) return;
    finishDialogue();
  }
  function keydown(event) {
    const key = event.key.toLowerCase();
    if (dialogueNpc) {
      if (key === 'e' || key === ' ' || key === 'spacebar') {
        event.preventDefault();
        if (!event.repeat) advanceDialogue();
      }
      return;
    }
    if (paused || buildMode || editable()) return;
    if (!['a', 'd', 'w', 's', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) return;
    event.preventDefault();
    if (key === 'e' && !event.repeat) {
      if (escape) {
        const target = findNearbyTrigger(player, grid);
        if (target && target.room.type === escape.room) {
          paused = true;
          keys.clear();
          onEscape?.(target.room, { dogNear: dogIsNear() });
          return;
        }
      }
      if (nearMarket()) {
        paused = true;
        keys.clear();
        onMarket?.();
        return;
      }
      const rebel = findNearbyRebel(player, grid, actors);
      if (rebel) {
        const hasCell = grid.flat().some((room) => room?.type === 'detention');
        if (hasCell && onDetain) {
          paused = true;
          keys.clear();
          onDetain(rebel.npc.id);
        }
        return;
      }
      // A missao tem prioridade sobre conversar com quem estiver por perto na mesma sala.
      const missionTrigger = findNearbyTrigger(player, grid);
      if (missionTrigger && mission && missionTrigger.room.floor === mission.floor && missionTrigger.room.column === mission.column) {
        paused = true;
        keys.clear();
        onMission?.(missionTrigger.room);
        return;
      }
      const nearby = trackNearbyInhabitant(player, grid, actors, lastTime, true);
      if (!nearby && canPetDog(dog, player) && !findNearbyTrigger(player, grid)) {
        dog = petDog(dog, player);
        onPet?.();
        return;
      }
      if (nearby) {
        dialogueNpc = nearby.npc;
        paused = true;
        keys.clear();
        onDialogue?.(nearby.npc, chooseDialogueLine(nearby.npc, Math.random, playerName));
        return;
      }
      const trigger = findNearbyTrigger(player, grid);
      if (trigger && mission && trigger.room.floor === mission.floor && trigger.room.column === mission.column) {
        paused = true; keys.clear(); onMission?.(trigger.room);
      } else if (trigger) { paused = true; keys.clear(); onRoom?.(trigger.room); }
    } else keys.add(key);
  }
  function keyup(event) { keys.delete(event.key.toLowerCase()); }
  function click(event) {
    if (lootbox?.opened) {
      const rect = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height,
      };
      if (isLootboxCrateClick(point, canvas.width, canvas.height)) onLootboxClick?.();
      return;
    }
    if (!buildMode) {
      if (!oilDerricks || paused || dialogueNpc) return;
      const rect = canvas.getBoundingClientRect();
      const slot = findOilDerrickAt((event.clientX - rect.left) * canvas.width / rect.width - camera.offset_x,
        (event.clientY - rect.top) * canvas.height / rect.height - camera.offset_y);
      const clickX = (event.clientX - rect.left) * canvas.width / rect.width - camera.offset_x;
      const clickY = (event.clientY - rect.top) * canvas.height / rect.height - camera.offset_y;
      if (darkMarket && isMarketAt(clickX, clickY)) {
        if (nearMarket()) { paused = true; keys.clear(); onMarket?.(); } else farMarketHintUntil = performance.now() + 3_000;
      }
      else if (slot !== null) onOilDerrick?.(slot);
      else if (isFortAt((event.clientX - rect.left) * canvas.width / rect.width - camera.offset_x,
        (event.clientY - rect.top) * canvas.height / rect.height - camera.offset_y)) onFort?.();
      return;
    }
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
  // Mao de clique ao passar sobre um poco, como em qualquer construcao clicavel.
  function hover(event) {
    if (!oilDerricks) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left) * canvas.width / rect.width - camera.offset_x;
    const worldY = (event.clientY - rect.top) * canvas.height / rect.height - camera.offset_y;
    const clickable = !buildMode && !paused && (findOilDerrickAt(worldX, worldY) !== null || isFortAt(worldX, worldY) || (darkMarket && isMarketAt(worldX, worldY)));
    canvas.style.cursor = clickable ? 'pointer' : '';
  }
  canvas.addEventListener('mousemove', hover);
  const ready = assets.preload().then(() => {
    if (!destroyed) { onAssetsReady?.(assets.failedKeys); frameId = requestAnimationFrame(frame); }
  });
  return {
    ready,
    getSnapshot: () => ({ player: { ...player }, camera: { ...camera }, cabinFloor, dog: dog ? { ...dog } : null,
      dialogueOpen: Boolean(dialogueNpc), currentDay,
      environment: { elapsedMs: dayNight.elapsedMs, isNight: dayNight.isNight },
      weather: { ...weather },
      inhabitants: actors.map((actor) => actor.snapshot()) }),
    isDialogueOpen: () => Boolean(dialogueNpc),
    setBuildMode(value) { buildMode = Boolean(value); keys.clear(); },
    setBuildType(value) { if (SHELTER_TYPES[value]) buildType = value; },
    pause() { paused = true; keys.clear(); },
    resume() { paused = false; },
    advanceDialogue,
    closeDialogue() { finishDialogue(); },
    destroy() {
      destroyed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      canvas.removeEventListener('click', click);
      canvas.removeEventListener('mousemove', hover);
    },
  };
}
