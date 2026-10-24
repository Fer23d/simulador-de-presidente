export const WEATHER_TYPES = Object.freeze({
  clear: Object.freeze({ id: 'clear', label: 'CÉU LIMPO', icon: '☼', blocksExpeditions: false,
    oxygenMultiplier: 1, radiationGain: 0, moralePenalty: 0 }),
  dust: Object.freeze({ id: 'dust', label: 'TEMPESTADE DE POEIRA', icon: '🌪', blocksExpeditions: true,
    oxygenMultiplier: 1, radiationGain: 0, moralePenalty: 0 }),
  acid_rain: Object.freeze({ id: 'acid_rain', label: 'CHUVA ÁCIDA', icon: '🌧', blocksExpeditions: true,
    oxygenMultiplier: 1, radiationGain: 3, moralePenalty: 0 }),
  radstorm: Object.freeze({ id: 'radstorm', label: 'TEMPESTADE RADIOATIVA', icon: '☢', blocksExpeditions: true,
    oxygenMultiplier: 1.25, radiationGain: 6, moralePenalty: 10 }),
});

export const CLEAR_DURATION_MS = Object.freeze([180_000, 360_000]);
export const STORM_DURATION_MS = Object.freeze([60_000, 180_000]);
// Chance de cada tempestade quando o ceu limpo termina.
const STORM_WEIGHTS = Object.freeze([['dust', .45], ['acid_rain', .35], ['radstorm', .2]]);

function nextWeatherRandom(seed) {
  const next = (Math.imul(Math.floor(Number(seed) || 1), 1_103_515_245) + 12_345) >>> 0;
  return { seed: next || 1, value: next / 4_294_967_296 };
}

function rollDuration([minimum, maximum], value) {
  return Math.round(minimum + (maximum - minimum) * value);
}

export function createWeatherState(value = {}) {
  const type = WEATHER_TYPES[value?.type] ? value.type : 'clear';
  const rawRemaining = Number(value?.remainingMs);
  const remainingMs = Number.isFinite(rawRemaining) && rawRemaining > 0
    ? Math.min(rawRemaining, Math.max(CLEAR_DURATION_MS[1], STORM_DURATION_MS[1]))
    : CLEAR_DURATION_MS[0];
  const seed = Math.max(1, Math.floor(Number(value?.seed) || 1)) >>> 0 || 1;
  return { type, remainingMs, seed };
}

export function advanceWeather(weather, deltaMs) {
  let current = createWeatherState(weather);
  const rawDelta = Number(deltaMs);
  let elapsed = Number.isFinite(rawDelta) ? Math.max(0, rawDelta) : 0;
  const startType = current.type;
  while (elapsed >= current.remainingMs) {
    elapsed -= current.remainingMs;
    let roll = nextWeatherRandom(current.seed);
    let type = 'clear';
    if (current.type === 'clear') {
      let cumulative = 0;
      type = STORM_WEIGHTS.find(([, weight]) => (cumulative += weight) > roll.value)?.[0] ?? 'dust';
    }
    const durationRoll = nextWeatherRandom(roll.seed);
    roll = durationRoll;
    current = { type, seed: roll.seed,
      remainingMs: rollDuration(type === 'clear' ? CLEAR_DURATION_MS : STORM_DURATION_MS, roll.value) };
  }
  return { ...current, remainingMs: current.remainingMs - elapsed, changed: current.type !== startType };
}

export function getWeather(stateOrWeather) {
  const weather = stateOrWeather?.weather ?? stateOrWeather;
  return WEATHER_TYPES[weather?.type] ?? WEATHER_TYPES.clear;
}
