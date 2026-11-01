// Layd, a cadela que passa a seguir o presidente quando ele decide ficar no Vault.
export const LAYD_ID = 'layd';
export const LAYD_NAME = 'Layd';

const FOLLOW_GAP = 66;
const WALK_SPEED = 120;
const RUN_SPEED = 250;
const RUN_DISTANCE = 230;
const SIT_AFTER_SECONDS = 2.4;
const STRIDE = 13;
const PET_RANGE = 80;
const PET_SECONDS = 2.6;

export function hasLayd(state) {
  return state?.companion?.adopted === true;
}

export function adoptLayd(state) {
  if (hasLayd(state)) return state;
  return {
    ...state,
    companion: { adopted: true, name: LAYD_NAME, since: Number(state?.wasteland_turn) || 0, bond: 0 },
    ...(state?.pendingStory ? {} : { pendingStory: true, currentStory: 'layd_arrives' }),
    notice: 'Layd, uma cadela do Ermo, escolheu ficar com você. Ela vai te seguir por onde for.',
  };
}

export function normalizeCompanion(value) {
  if (value?.adopted !== true) return null;
  return { adopted: true, name: LAYD_NAME, since: Math.max(0, Math.floor(Number(value.since) || 0)),
    bond: Math.max(0, Math.min(100, Math.floor(Number(value.bond) || 0))) };
}

export function createDogActor(player) {
  const facing = player.facing === -1 ? -1 : 1;
  return { x: player.x - facing * FOLLOW_GAP, floor: player.floor, facing, pose: 'sit', gait: 0, idleSeconds: 0, petSeconds: 0, speed: 0 };
}

export function petDog(dog, player) {
  if (!dog || dog.floor !== player.floor || Math.abs(dog.x - player.x) > PET_RANGE) return dog;
  return { ...dog, petSeconds: PET_SECONDS, pose: 'sit', facing: player.x >= dog.x ? 1 : -1 };
}

export function canPetDog(dog, player) {
  return Boolean(dog) && dog.floor === player.floor && player.liftTarget === null && Math.abs(dog.x - player.x) <= PET_RANGE;
}

// Um passo do comportamento: caminha atras do jogador, corre se ficou longe, senta quando ele para.
// elevatorX: onde fica o elevador, usado para trocar de andar junto com o jogador.
export function updateDogActor(dog, player, deltaSeconds, { elevatorX = null, bounds = null } = {}) {
  const dt = Math.max(0, Math.min(.05, Number(deltaSeconds) || 0));
  const next = { ...dog };
  next.petSeconds = Math.max(0, (dog.petSeconds || 0) - dt);
  if (player.liftTarget !== null && player.liftTarget !== undefined) {
    // Se estava perto quando o elevador partiu, sobe junto dentro da cabine.
    if (dog.riding || (dog.floor === player.floor && Math.abs(dog.x - player.x) < 170)) {
      next.riding = true;
      next.x = player.x - 24;
      next.facing = 1;
    }
    next.speed = 0;
    next.pose = 'stand';
    return next;
  }
  if (dog.riding) {
    next.riding = false;
    next.floor = player.floor;
    next.x = player.x - 24;
  }
  let goalX = player.x - (player.facing === -1 ? -1 : 1) * FOLLOW_GAP * .75;
  if (dog.floor !== player.floor) {
    if (elevatorX === null) { next.floor = player.floor; next.x = player.x - FOLLOW_GAP; return next; }
    goalX = elevatorX;
  }
  const distance = goalX - dog.x;
  const away = Math.abs(player.x - dog.x);
  const idleTarget = Math.abs(player.vx || 0) < 1 && dog.floor === player.floor;
  next.idleSeconds = idleTarget && Math.abs(distance) < 28 ? (dog.idleSeconds || 0) + dt : 0;
  if (next.petSeconds > 0) {
    next.pose = 'sit';
    next.speed = 0;
    return next;
  }
  const mustMove = Math.abs(distance) > (dog.floor === player.floor ? 36 : 6);
  if (mustMove) {
    const running = away > RUN_DISTANCE || dog.floor !== player.floor;
    const speed = running ? RUN_SPEED : WALK_SPEED * (Math.abs(distance) > 90 ? 1.25 : .85);
    const step = Math.min(Math.abs(distance), speed * dt);
    next.x = dog.x + Math.sign(distance) * step;
    if (bounds) next.x = Math.max(bounds.min, Math.min(bounds.max, next.x));
    next.facing = Math.sign(distance) || dog.facing;
    next.gait = (dog.gait || 0) + step / STRIDE * (running ? .8 : 1);
    next.speed = step / (dt || 1);
    next.pose = running ? 'run' : 'walk';
    if (dog.floor !== player.floor && Math.abs(elevatorX - next.x) <= 6) {
      next.floor = player.floor;
      next.pose = 'stand';
    }
  } else {
    next.speed = 0;
    next.pose = next.idleSeconds >= SIT_AFTER_SECONDS ? 'sit' : 'stand';
    if (dog.floor === player.floor && Math.abs(player.x - next.x) > 8) next.facing = player.x >= next.x ? 1 : -1;
  }
  return next;
}
