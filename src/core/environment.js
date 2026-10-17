export const DAY_PHASE_MS = 300_000;
export const FULL_CYCLE_MS = 600_000;
export const GENERATOR_LIGHT_THRESHOLD = 3;
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function countActiveGenerators(rooms) {
  if (!Array.isArray(rooms)) return 0;
  return rooms.flat(Infinity).filter((room) => room?.type === 'generator'
    && Number(room.level ?? 1) >= 1 && room.operational !== false && room.destroyed !== true).length;
}

export function hasReliableNightPower(activeGenerators) {
  return Number.isFinite(Number(activeGenerators))
    && Number(activeGenerators) >= GENERATOR_LIGHT_THRESHOLD;
}

export function createEnvironmentState(value = {}) {
  const rawElapsed = Number(value.elapsedMs);
  const elapsedMs = modulo(Number.isFinite(rawElapsed) ? Math.max(0, rawElapsed) : 0, FULL_CYCLE_MS);
  return { elapsedMs, isNight: elapsedMs >= DAY_PHASE_MS };
}

export function advanceEnvironmentCycle(environment, deltaMs) {
  const current = createEnvironmentState(environment);
  const rawDelta = Number(deltaMs);
  const elapsed = Number.isFinite(rawDelta) ? Math.max(0, rawDelta) : 0;
  const next = createEnvironmentState({ elapsedMs: current.elapsedMs + elapsed });
  return {
    ...next,
    remainingMs: next.isNight ? FULL_CYCLE_MS - next.elapsedMs : DAY_PHASE_MS - next.elapsedMs,
    progress: next.isNight
      ? (next.elapsedMs - DAY_PHASE_MS) / DAY_PHASE_MS
      : next.elapsedMs / DAY_PHASE_MS,
  };
}

export function getEnergyConsumptionForPhase(amount, isNight) {
  const rawConsumption = Number(amount);
  const consumption = Number.isFinite(rawConsumption) ? Math.max(0, rawConsumption) : 0;
  return isNight ? Math.ceil(consumption * 0.7) : consumption;
}

export function getNpcMovementDelta(deltaSeconds, isNight, activeGenerators = 0) {
  const rawDelta = Number(deltaSeconds);
  const delta = Number.isFinite(rawDelta) ? Math.max(0, rawDelta) : 0;
  return isNight && !hasReliableNightPower(activeGenerators) ? delta * 0.8 : delta;
}

export function getNighttimeRiskChance(baseChance, isNight, activeGenerators = 0) {
  const rawChance = Number(baseChance);
  const chance = Number.isFinite(rawChance) ? Math.max(0, Math.min(1, rawChance)) : 0;
  return isNight && !hasReliableNightPower(activeGenerators) ? Math.min(1, chance * 2) : chance;
}
