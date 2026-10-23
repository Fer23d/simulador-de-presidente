import { SLOT_WIDTH } from './shelter_engine.js';

const EDGE_MARGIN = 24;
const MAX_OFFSET = SLOT_WIDTH / 2 - EDGE_MARGIN;
const STATES = new Set(['idle', 'walking_left', 'walking_right', 'rebel']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class Inhabitant {
  constructor(data, random = Math.random) {
    this.id = data.id;
    this.floor = data.floor;
    this.column = data.column;
    this.currentRoomId = typeof data.currentRoomId === 'string' ? data.currentRoomId : null;
    this.previousRoomId = typeof data.previousRoomId === 'string' ? data.previousRoomId : null;
    this.state = data.state === 'imprisoned' ? 'imprisoned' : data.state === 'working' ? 'working' : 'idle';
    this.role = data.role ?? 'resident';
    this.name = typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 60) : 'Habitante Genérico';
    this.isVIP = data.isVIP === true;
    this.modifier = Math.max(1, Math.min(5, Number(data.modifier) || (this.isVIP ? 2 : 1)));
    this.pose = data.pose ?? 'idle';
    this.facing = data.facing === -1 ? -1 : 1;
    this.offsetX = clamp(Number(data.offsetX) || 0, -MAX_OFFSET, MAX_OFFSET);
    this.targetOffsetX = Number.isFinite(data.targetOffsetX)
      ? clamp(data.targetOffsetX, -MAX_OFFSET, MAX_OFFSET) : null;
    this.currentState = STATES.has(data.currentState) ? data.currentState : 'idle';
    this.loyalty = clamp(Number(data.loyalty ?? 100), 0, 100);
    this.revoltChance = clamp(Number(data.revoltChance ?? 20), 0, 100);
    this.lastTalkedDay = Math.max(0, Math.floor(Number(data.lastTalkedDay) || 0));
    this.workFloor = Number.isInteger(data.workFloor) ? data.workFloor : null;
    this.workColumn = Number.isInteger(data.workColumn) ? data.workColumn : null;
    this.rebellionCheckDone = data.rebellionCheckDone === true;
    this.is_on_expedition = data.is_on_expedition === true;
    this.expedition_timer = Math.max(0, Math.floor(Number(data.expedition_timer) || 0));
    this.expedition_destination = typeof data.expedition_destination === 'string' ? data.expedition_destination.slice(0, 120) : undefined;
    this.is_prisoner = data.is_prisoner === true;
    if (this.targetOffsetX === null && this.currentState !== 'rebel') this.currentState = 'idle';
    this.waitSeconds = Number.isFinite(data.waitSeconds) ? clamp(data.waitSeconds, 0, 6) : 1;
    this.speed = 26 + [...this.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 12;
    this.random = random;
  }

  update(deltaTime, speedMultiplier = 1) {
    const dt = clamp(Number(deltaTime) || 0, 0, .1);
    if (!dt || this.is_on_expedition || this.is_prisoner || this.currentState === 'rebel') return;
    if (this.currentState === 'idle') {
      this.waitSeconds -= dt;
      if (this.waitSeconds > 0) return;
      if (this.random() < .7) {
        const workStation = this.pose === 'working' && this.random() < .35;
        const destination = workStation ? (this.offsetX <= 0 ? -84 : 84)
          : Math.round((this.random() * 2 - 1) * MAX_OFFSET);
        if (Math.abs(destination - this.offsetX) >= 12) {
          this.targetOffsetX = destination;
          this.currentState = destination < this.offsetX ? 'walking_left' : 'walking_right';
          this.facing = destination < this.offsetX ? -1 : 1;
          return;
        }
      }
      this.waitSeconds = 1 + this.random() * 2;
      return;
    }
    const remaining = this.targetOffsetX - this.offsetX;
    this.offsetX += Math.sign(remaining) * Math.min(Math.abs(remaining), this.speed * dt * Math.max(0, Number(speedMultiplier) || 0));
    if (this.offsetX === this.targetOffsetX) {
      if (this.pose === 'working' && Math.abs(this.offsetX) === 84) this.facing = this.offsetX < 0 ? 1 : -1;
      this.currentState = 'idle';
      this.targetOffsetX = null;
      this.waitSeconds = 1.5 + this.random() * 2;
    }
  }

  snapshot() {
    return { id: this.id, floor: this.floor, column: this.column, offsetX: this.offsetX,
      role: this.role, pose: this.pose, facing: this.facing,
      name: this.name, isVIP: this.isVIP, modifier: this.modifier,
      currentState: this.currentState, targetOffsetX: this.targetOffsetX, waitSeconds: this.waitSeconds,
      loyalty: this.loyalty, workFloor: this.workFloor, workColumn: this.workColumn,
      revoltChance: this.revoltChance, lastTalkedDay: this.lastTalkedDay,
      currentRoomId: this.currentRoomId, previousRoomId: this.previousRoomId, state: this.state,
      rebellionCheckDone: this.rebellionCheckDone,
      is_on_expedition: this.is_on_expedition, expedition_timer: this.expedition_timer,
      ...(this.expedition_destination ? { expedition_destination: this.expedition_destination } : {}),
      is_prisoner: this.is_prisoner };
  }
}
